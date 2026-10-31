import { test, expect } from "@playwright/test";
import type { LiveCatalog } from "../../src/brand/live-catalog";
import type { Page } from "@playwright/test";

const menuRetry = (page: Page) =>
  page
    .locator('[data-catalog-status] > [role="status"]')
    .getByRole("button", { name: "TRY AGAIN", exact: true });

/** The menu's retry must not move when checkout settings finish loading. */
async function retryStaysPut(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/checkout/config", async (route) => {
    await held;
    await route.continue();
  });
  await page.route("**/api/storefront/catalog", (route) =>
    route.fulfill({ status: 503, json: { error: "fixture unavailable" } }),
  );
  await page.goto("/menu?category=cakes");
  const retry = menuRetry(page);
  await expect(retry).toBeVisible();
  const before = await retry.boundingBox();
  release();
  await expect(
    page
      .locator(".b-discovery-search")
      .getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  expect(await retry.boundingBox()).toEqual(before);
}

// Narrow enough that a longer search status wraps, in every font environment.
test("menu TRY AGAIN keeps its position when checkout settings arrive 320", ({
  page,
}) => retryStaysPut(page, 320));

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
    // The menu's own retry; the search panel has a separate "Try again".
    await menuRetry(page).click();
    await expect(page.locator('[data-catalog-status="live"]')).toBeVisible();
    await expect(page.locator(".b-menu-card").first()).toBeVisible();
  });

  test(`menu TRY AGAIN keeps its position when checkout settings arrive ${width}`, ({
    page,
  }) => retryStaysPut(page, width));

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
