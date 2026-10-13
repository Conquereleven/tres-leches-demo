import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
for (const width of [390, 768, 1024, 1440, 1920]) {
  test(`official media responsive ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const requests: string[] = [],
      errors: string[] = [];
    page.on("request", (r) => {
      if (r.url().endsWith(".mp4")) requests.push(r.url());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    // Every menu page asks the server for prices. Leaving before that answer
    // arrives makes WebKit report the cancelled request as a page error, so the
    // test lets each page finish loading; any real page error still fails it.
    const visitMenu = async (url: string) => {
      const config = page.waitForResponse((r) =>
        r.url().endsWith("/api/checkout/config"),
      );
      await page.goto(url);
      await config;
    };
    await page.goto("/");
    const video = page.locator(".ref-hero video");
    // New story film on desktop; the original packaging video on tablet and mobile.
    const expected =
      width >= 1024
        ? "story-desktop-576.mp4"
        : width <= 640
          ? "packaging-540.mp4"
          : "packaging-720.mp4";
    await expect(video.locator("source")).toHaveAttribute(
      "src",
      `/brand/approved/${expected}`,
    );
    await expect(video).toHaveAttribute(
      "poster",
      width >= 1024
        ? "/brand/approved/story-desktop-poster.webp"
        : "/brand/approved/packaging-poster.webp",
    );
    // Real playback in both engines: Safari needs the server to honour Range.
    const ranged = await page.evaluate(async (file) => {
      const r = await fetch(`/brand/approved/${file}`, {
        headers: { Range: "bytes=0-1" },
      });
      return [r.status, r.headers.get("content-range")?.slice(0, 10)];
    }, expected);
    expect(ranged).toEqual([206, "bytes 0-1/"]);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), {
        timeout: 20000,
      })
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
        timeout: 20000,
      })
      .toBeGreaterThan(0);
    expect(
      await video.evaluate(
        (v: HTMLVideoElement) => v.muted && v.loop && v.playsInline,
      ),
    ).toBe(true);
    if (width >= 1024)
      expect(await video.evaluate((v) => getComputedStyle(v).objectFit)).toBe(
        "contain",
      );
    expect(requests.every((url) => url.endsWith(expected))).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    mkdirSync("work/qa/official-media", { recursive: true });
    await page.screenshot({
      path: `work/qa/official-media/${info.project.name}-home-${width}.png`,
    });
    await visitMenu("/menu?product=pan-de-muerto-traditional--ajonjoli");
    await expect(page.locator(".b-menu-photo img")).toHaveAttribute(
      "src",
      /official-pan-09/,
    );
    await expect(page.locator(".b-product-gallery img")).toHaveCount(1);
    await expect(page.locator(".b-official-rotation")).toHaveCount(0);
    // Product pages carry neither the watermark nor the banner.
    await expect(page.locator(".b-menu-intro-mark")).toHaveCount(0);
    await expect(page.locator(".b-category-showcase")).toHaveCount(0);
    await page.screenshot({
      path: `work/qa/official-media/${info.project.name}-product-${width}.png`,
    });
    await visitMenu("/menu?category=pan");
    // Restored Pan de Muerto banner: whole 3:2 boards, before the product grid.
    const banner = page.locator(".b-category-showcase .b-official-rotation");
    await expect(banner.locator("picture.is-active img")).toHaveAttribute(
      "src",
      /official-pan-banner-0[1-4]-/,
    );
    const bannerBox = (await page
      .locator(".b-category-showcase")
      .boundingBox())!;
    expect(Math.abs(bannerBox.width / bannerBox.height - 1.5)).toBeLessThan(
      0.02,
    );
    expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(
      (await page.locator(".b-menu-grid").boundingBox())!.y,
    );
    // The logo watermark belongs to the Menu introduction and nowhere else.
    const mark = page.locator(".b-menu-intro-mark");
    await expect(mark).toHaveCount(1);
    expect(
      await mark.evaluate((m) => {
        const cs = getComputedStyle(m);
        const nav = document
          .querySelector(".b-menu-categories")!
          .getBoundingClientRect();
        return [
          cs.opacity,
          cs.pointerEvents,
          m.getAttribute("aria-hidden"),
          cs.backgroundRepeat,
          m.getBoundingClientRect().bottom <= nav.bottom,
        ];
      }),
    ).toEqual(["0.08", "none", "true", "no-repeat", true]);
    // Every card image is a square with rounded corners and shows the whole photo.
    const frames = await page.evaluate(() =>
      [...document.querySelectorAll(".b-menu-card .b-menu-photo")].map((f) => {
        const r = f.getBoundingClientRect();
        return [
          Math.abs(r.width - r.height) < 1,
          getComputedStyle(f).borderRadius,
          getComputedStyle(f.querySelector("img")!).objectFit,
        ];
      }),
    );
    // The photograph itself is square and fills the frame: no portrait strip inside a square box.
    for (const card of await page.locator(".b-menu-card .b-menu-photo").all()) {
      await card.scrollIntoViewIfNeeded();
      const img = card.locator("picture.is-active img, img").first();
      await expect
        .poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth))
        .toBeGreaterThan(0);
      const fill = await card.evaluate((frame) => {
        const f = frame.getBoundingClientRect();
        const image = (frame.querySelector("picture.is-active img") ??
          frame.querySelector("img")) as HTMLImageElement;
        const i = image.getBoundingClientRect();
        const layers = [
          ...frame.querySelectorAll(".b-official-rotation picture"),
        ].map((p) => p.getBoundingClientRect());
        return {
          frame: Math.abs(f.width - f.height),
          natural: image.naturalWidth / image.naturalHeight,
          image: Math.max(
            Math.abs(i.width - f.width),
            Math.abs(i.height - f.height),
          ),
          layers: Math.max(
            0,
            ...layers.map(
              (l) =>
                Math.abs(l.width - f.width) + Math.abs(l.height - f.height),
            ),
          ),
          clips: getComputedStyle(frame).overflow,
        };
      });
      expect(fill.frame).toBeLessThanOrEqual(2);
      expect(fill.natural).toBe(1);
      expect(fill.image).toBeLessThanOrEqual(2);
      expect(fill.layers).toBeLessThanOrEqual(2);
      expect(fill.clips).toBe("hidden");
    }
    expect(frames.length).toBeGreaterThan(8);
    expect(frames.every(([square]) => square)).toBe(true);
    expect([...new Set(frames.map(([, radius]) => radius))]).toEqual(["20px"]);
    expect([...new Set(frames.map(([, , fit]) => fit))]).toEqual(["contain"]);
    for (const [id, source] of [
      ["pan-de-muerto-traditional-pack", /official-pan-02-/],
      ["pan-de-muerto-filled-pack", /official-pan-02-/],
    ] as const) {
      const card = page.locator(`[data-product-id="${id}"] .b-menu-photo`);
      await card.scrollIntoViewIfNeeded();
      await expect(
        card.locator("picture.is-active img, img").first(),
      ).toHaveAttribute("src", source);
    }
    // Whole bread, centred on cream: every official photo is contained, none zoomed.
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll(".b-official-photo img")]
          .filter((i) => !i.closest("picture:not(.is-active)") || true)
          .map((i) => getComputedStyle(i).objectFit)
          .filter((f) => f !== "contain"),
      ),
    ).toEqual([]);
    const rotation = page.locator(
      '[data-product-id="pan-de-muerto-traditional--ajonjoli"] .b-official-rotation',
    );
    await rotation.scrollIntoViewIfNeeded();
    // Only the current and the next photo are mounted until a turn has played.
    await expect(rotation.locator("picture")).toHaveCount(2);
    const initial = await rotation.boundingBox();
    expect(Math.round(initial!.width)).toBe(Math.round(initial!.height));
    await expect(rotation.locator("picture.is-active img")).toHaveAttribute(
      "src",
      /official-pan-06-/,
      { timeout: 12000 },
    );
    // Mid-fade the outgoing photo is still fully painted: no blank frame.
    expect(
      await rotation.evaluate((node) =>
        [...node.querySelectorAll("picture")].some(
          (p) => getComputedStyle(p).opacity === "1",
        ),
      ),
    ).toBe(true);
    const after = await rotation.boundingBox();
    expect(after?.height).toBe(initial?.height);
    await rotation.focus();
    const active = await rotation
      .locator("picture.is-active img")
      .getAttribute("src");
    await page.waitForTimeout(4200);
    expect(
      await rotation.locator("picture.is-active img").getAttribute("src"),
    ).toBe(active);
    // Crema diplomática: Joel's three photos, in order, 3.5 s apart, then back to the first.
    const crema = page.locator(
      '[data-product-id="pan-de-muerto-filled--crema-diplomatica-vainilla"] .b-official-rotation',
    );
    await crema.scrollIntoViewIfNeeded();
    const shown = () =>
      crema
        .locator("picture.is-active img")
        .evaluate((img: HTMLImageElement) =>
          img.currentSrc.replace(/^.*official-pan-(.*)-\d+\.\w+$/, "$1"),
        );
    const seen: [string, number][] = [[await shown(), Date.now()]];
    while (seen.length < 5) {
      await expect.poll(shown, { timeout: 9000 }).not.toBe(seen.at(-1)![0]);
      seen.push([await shown(), Date.now()]);
      if (seen.length === 3) {
        // The cutout keeps its transparency and sits on the card surface, never black.
        // BRAND-02 (approved 12 October 2026) made product surfaces white.
        expect(
          await crema
            .locator("picture.is-active")
            .evaluate((p) => getComputedStyle(p).backgroundColor),
        ).toBe("rgb(255, 255, 255)");
      }
      if (seen.at(-1)![0] === "13")
        expect(
          await crema
            .locator("picture.is-active img")
            .evaluate((img) => getComputedStyle(img).objectFit),
        ).toBe("contain");
      await crema.screenshot({
        path: `work/qa/official-media/${info.project.name}-crema-${width}-${seen.length}.png`,
      });
    }
    const order = seen.map(([name]) => name);
    const start = order.indexOf("14");
    expect(order.slice(start, start + 3)).toEqual(["14", "14-cutout", "13"]);
    expect(order.filter((n) => !["14", "14-cutout", "13"].includes(n))).toEqual(
      [],
    );
    for (let i = 2; i < seen.length; i++) {
      const gap = seen[i]![1] - seen[i - 1]![1];
      expect(gap).toBeGreaterThan(3000 - 150);
      expect(gap).toBeLessThan(4300);
    }
    const cremaBox = (await crema.boundingBox())!;
    expect(Math.abs(cremaBox.height - cremaBox.width)).toBeLessThan(1);
    // Chocolate relleno: Joel's five photos, detail last, never first.
    const choc = page.locator(
      '[data-product-id="pan-de-muerto-filled--chocolate"] .b-official-rotation',
    );
    await choc.scrollIntoViewIfNeeded();
    const chocShown = () =>
      choc
        .locator("picture.is-active img")
        .evaluate((img: HTMLImageElement) =>
          img.currentSrc.replace(/^.*official-pan-(.*)-\d+\.\w+$/, "$1"),
        );
    const chocSeen = [await chocShown()];
    await choc.screenshot({
      path: `work/qa/official-media/${info.project.name}-chocolate-${width}-1.png`,
    });
    while (chocSeen.length < 6) {
      await expect.poll(chocShown, { timeout: 9000 }).not.toBe(chocSeen.at(-1));
      chocSeen.push(await chocShown());
      await choc.screenshot({
        path: `work/qa/official-media/${info.project.name}-chocolate-${width}-${chocSeen.length}.png`,
      });
    }
    const cycle = ["16", "18", "16-cutout", "18-cutout", "29"];
    const from = cycle.indexOf(chocSeen[0]!);
    expect(from).toBeGreaterThanOrEqual(0);
    expect(chocSeen).toEqual(
      chocSeen.map((_, i) => cycle[(from + i) % cycle.length]),
    );
    expect(
      await choc
        .locator("picture.is-active")
        .evaluate((p) => getComputedStyle(p).backgroundColor),
    ).toBe("rgb(255, 255, 255)");
    // The traditional pack has four photos and rotates; the filled pack has one and stays static.
    await expect(
      page.locator(
        '[data-product-id="pan-de-muerto-traditional-pack"] .b-official-rotation',
      ),
    ).toHaveCount(1);
    await expect(
      page.locator(
        '[data-product-id="pan-de-muerto-filled-pack"] .b-official-rotation',
      ),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        [...document.images]
          .filter((i) => i.complete && !i.naturalWidth)
          .map((i) => i.currentSrc),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: `work/qa/official-media/${info.project.name}-menu-${width}.png`,
    });
    await visitMenu("/menu?category=conchas");
    await expect(
      page.locator(".b-category-showcase .b-official-rotation"),
    ).toHaveCount(1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await visitMenu("/menu?category=pan");
    await rotation.scrollIntoViewIfNeeded();
    await page.waitForTimeout(4200);
    await expect(rotation.locator("picture.is-active img")).toHaveAttribute(
      "src",
      /official-pan-09-/,
    );
    // Still frames: the default photograph is the first approved one.
    await expect(
      page.locator(
        '[data-product-id="pan-de-muerto-filled--chocolate"] picture.is-active img',
      ),
    ).toHaveAttribute("src", /official-pan-16-/);
    await page.goto("/");
    await expect(video.locator("source")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
