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
    await page.goto("/");
    const video = page.locator(".ref-hero video");
    const expected = "story-desktop-576.mp4";
    await expect(video.locator("source")).toHaveAttribute(
      "src",
      `/brand/approved/${expected}`,
    );
    if (info.project.name === "chromium") {
      await expect
        .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
        .toBeGreaterThanOrEqual(2);
    } else {
      await expect
        .poll(() => requests.some((url) => url.endsWith(expected)))
        .toBe(true);
      info.annotations.push({
        type: "playback-unresolved",
        description:
          "Local WebKit requests H.264 but does not decode it with the existing chunked static response. These checks verify source selection, poster fallback and photo UX; playback is not a pass.",
      });
      await expect(video).toHaveAttribute(
        "poster",
        "/brand/approved/story-desktop-poster.webp",
      );
    }
    expect(
      await video.evaluate(
        (v: HTMLVideoElement) => v.muted && v.loop && v.playsInline,
      ),
    ).toBe(true);
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
    await page.goto("/menu?product=pan-de-muerto-traditional--ajonjoli");
    await expect(page.locator(".b-menu-photo img")).toHaveAttribute(
      "src",
      /official-pan-09/,
    );
    await expect(page.locator(".b-product-gallery img")).toHaveCount(1);
    await expect(page.locator(".b-official-rotation")).toHaveCount(0);
    await page.screenshot({
      path: `work/qa/official-media/${info.project.name}-product-${width}.png`,
    });
    await page.goto("/menu?category=pan");
    const banner = page.locator(".b-category-showcase .b-official-rotation");
    await expect(banner.locator("picture.is-active img")).toHaveAttribute(
      "src",
      /official-pan-01-/,
    );
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
        // The cutout keeps its transparency and sits on the cream card, never black.
        expect(
          await crema
            .locator("picture.is-active")
            .evaluate((p) => getComputedStyle(p).backgroundColor),
        ).toBe("rgb(246, 239, 227)");
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
    // Products without their own photograph stay static.
    await expect(
      page.locator(
        '[data-product-id="pan-de-muerto-traditional-pack"] .b-official-rotation',
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
    await page.goto("/menu?category=conchas");
    await expect(page.locator(".b-official-rotation")).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/menu?category=pan");
    await rotation.scrollIntoViewIfNeeded();
    await page.waitForTimeout(4200);
    await expect(rotation.locator("picture.is-active img")).toHaveAttribute(
      "src",
      /official-pan-09-/,
    );
    await page.goto("/");
    await expect(video.locator("source")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
