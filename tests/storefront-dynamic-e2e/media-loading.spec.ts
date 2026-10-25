import { test, expect } from "@playwright/test";
import type { LiveCatalog } from "../../src/brand/live-catalog";

for (const width of [390, 1440]) {
  test(`catalog loading reserves viewport and recovers ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const catalog: LiveCatalog = await (
      await page.request.get("/api/storefront/catalog")
    ).json();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/storefront/catalog", async (route) => {
      await held;
      await route.fulfill({ json: catalog });
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/menu?category=cakes", { waitUntil: "domcontentloaded" });
    const loading = page.locator('.b-full-menu[data-catalog-status="loading"]');
    await expect(loading).toBeVisible();
    expect(
      await loading.evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(1000);
    expect(
      await page
        .locator(".b-footer")
        .evaluate((el) => el.getBoundingClientRect().top),
    ).toBeGreaterThanOrEqual(1000);
    await page.screenshot({ path: info.outputPath(`loading-${width}.png`) });
    release();
    await expect(
      page.locator('.b-full-menu[data-catalog-status="live"]'),
    ).toBeVisible();
    await expect(loading).toHaveCount(0);
    const photo = page.locator(".b-menu-photo").first();
    await expect(photo).toBeVisible();
    const rect = await photo.boundingBox();
    expect(Math.abs(rect!.width - rect!.height)).toBeLessThan(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`loaded-${width}.png`) });
    expect(errors).toEqual([]);
  });

  test(`catalog unavailable retries without stale products ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const catalog: LiveCatalog = await (
      await page.request.get("/api/storefront/catalog")
    ).json();
    let failed = true;
    await page.route("**/api/storefront/catalog", (route) =>
      failed
        ? route.fulfill({ status: 503, json: { error: "fixture unavailable" } })
        : route.fulfill({ json: catalog }),
    );
    await page.goto("/menu?category=cakes");
    await expect(
      page.locator('[data-catalog-status="unavailable"]'),
    ).toBeVisible();
    await expect(page.locator(".b-menu-card")).toHaveCount(0);
    failed = false;
    await page.getByRole("button", { name: "TRY AGAIN" }).click();
    await expect(page.locator('[data-catalog-status="live"]')).toBeVisible();
    await expect(page.locator(".b-menu-card").first()).toBeVisible();
  });

  test(`empty published menu never falls back to bundled products ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const catalog: LiveCatalog = await (
      await page.request.get("/api/storefront/catalog")
    ).json();
    await page.route("**/api/storefront/catalog", (route) =>
      route.fulfill({ json: { ...catalog, products: [] } }),
    );
    await page.goto("/menu?category=cakes");
    await expect(page.locator('[data-catalog-status="live"]')).toBeVisible();
    await expect(page.locator(".b-menu-card")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
