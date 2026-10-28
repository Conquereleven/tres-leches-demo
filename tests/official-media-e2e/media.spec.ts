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
    // Pan gallery opens with the 3L-MEDIA-002 photograph M002-080, 3:2, before the product grid.
    const banner = page.locator(".b-category-showcase .b-official-rotation");
    await expect(banner.locator("picture.is-active img")).toHaveAttribute(
      "src",
      /3l-media-002\/pan-2-m002-080-/,
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
    // Every product card is square; photographs fill the frame without letterboxing.
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
    expect([...new Set(frames.map(([, , fit]) => fit))]).toEqual(["cover"]);
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
    // PR #61: cards show exactly one stable PRIMARY; galleries stay on detail.
    await expect(page.locator(".b-menu-card .b-official-rotation")).toHaveCount(
      0,
    );
    const coverFits = await page.locator(".b-official-photo img").evaluateAll(
      (images) => images.map((i) => getComputedStyle(i).objectFit),
    );
    expect(coverFits.length).toBeGreaterThan(0);
    expect(coverFits.every((fit) => fit === "cover")).toBe(true);

    // The category editorial banner retains its independent 3:2 rotation.
    const rotation = page.locator(".b-category-showcase .b-official-rotation");
    await expect(rotation).toHaveCount(1);
    await rotation.scrollIntoViewIfNeeded();
    const first = rotation.locator("picture.is-active img");
    await expect
      .poll(() => first.evaluate((i: HTMLImageElement) => i.naturalWidth))
      .toBeGreaterThan(0);
    const firstSrc = await first.getAttribute("src");
    await expect(first).not.toHaveAttribute("src", firstSrc!, {
      timeout: 11000,
    });
    await rotation.focus();
    const focusedSrc = await first.getAttribute("src");
    await page.waitForTimeout(3900);
    await expect(first).toHaveAttribute("src", focusedSrc!);

    // Detail-only gallery remains accessible, and is not a card carousel.
    await visitMenu("/menu?product=pan-de-muerto-filled--chocolate");
    await expect(page.locator(".b-menu-photo .b-official-rotation")).toHaveCount(0);
    const gallery = page.locator(".b-product-gallery img");
    expect(await gallery.count()).toBeGreaterThan(0);
    await expect(gallery.first()).toBeVisible();

    // Return to the Pan product grid for the screenshot and responsive check.
    await visitMenu("/menu?category=pan");
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
      /3l-media-002\/pan-2-m002-080-/,
    );
    // Still frames: the default photograph is the first approved one.
    await expect(
      page.locator(
        '[data-product-id="pan-de-muerto-filled--chocolate"] .b-menu-photo img',
      ),
    ).toHaveAttribute("src", /official-pan-16-/);
    await page.goto("/");
    await expect(video.locator("source")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
