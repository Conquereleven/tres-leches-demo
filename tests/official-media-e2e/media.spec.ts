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
        width >= 1024
          ? "/brand/approved/story-desktop-poster.webp"
          : "/brand/approved/packaging-poster.webp",
      );
    }
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
    await page.goto("/menu?product=pan-de-muerto-traditional--ajonjoli");
    await expect(page.locator(".b-menu-photo img")).toHaveAttribute(
      "src",
      /official-pan-09/,
    );
    await expect(page.locator(".b-product-gallery img")).toHaveCount(1);
    await page.screenshot({
      path: `work/qa/official-media/${info.project.name}-product-${width}.png`,
    });
    await page.goto("/menu?category=pan");
    const rotation = page.locator(".b-official-rotation").first();
    await expect(rotation).toBeVisible();
    const initial = await rotation.boundingBox();
    await expect(rotation.locator("picture.is-loaded")).toHaveCount(2);
    await expect(rotation.locator("picture.is-active img")).toHaveAttribute(
      "src",
      /official-pan-06/,
      { timeout: 12000 },
    );
    const after = await rotation.boundingBox();
    expect(after?.height).toBe(initial?.height);
    await rotation.focus();
    const active = await rotation
      .locator("picture.is-active img")
      .getAttribute("src");
    await page.waitForTimeout(7500);
    expect(
      await rotation.locator("picture.is-active img").getAttribute("src"),
    ).toBe(active);
    await page.screenshot({
      path: `work/qa/official-media/${info.project.name}-menu-${width}.png`,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(video.locator("source")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
