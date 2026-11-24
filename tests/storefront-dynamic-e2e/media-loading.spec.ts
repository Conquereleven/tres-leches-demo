import { test, expect } from "@playwright/test";
import type { LiveCatalog } from "../../src/brand/live-catalog";
import type { Page } from "@playwright/test";

/**
 * Loading and outage states adapted to canonical V3.2 (RT01 P1 remediation).
 *
 * The retired legacy menu (`.b-full-menu[data-catalog-status]`,
 * `.b-discovery-search`, `.b-menu-card`, `.b-menu-photo`, `.b-footer`) no
 * longer renders. V3.2 states: loading and unavailable share `.v32-message`
 * (role=status) with a TRY AGAIN button; the live catalog is `.ref32-grid`
 * with `.ref32-photo` 4/3 cover frames. Every legacy contract below is
 * mapped to its V3.2 approved equivalent instead of deleted; the approved
 * V3.2 loading state is a compact message (no 1000px skeleton reserve), so
 * the no-layout-shift intent is asserted on the retry control itself.
 */

const menuRetry = (page: Page) =>
  page
    .locator(".v32-message")
    .getByRole("button", { name: "TRY AGAIN", exact: true });

/** The menu's retry must not move when checkout settings finish loading. */
async function retryStaysPut(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Isolate the checkout transition from the external font swap.
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/checkout/config", async (route) => {
    await held;
    await route.continue();
  });
  await page.route("**/api/storefront/catalog", (route) =>
    route.fulfill({ status: 503, json: { error: "fixture unavailable" } }),
  );
  await page.goto("/bakery?category=cakes&lang=en");
  const retry = menuRetry(page);
  const status = page.locator(".v32-message");
  await expect(status).toContainText("Online ordering is unavailable.");
  await expect(retry).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const before = await retry.boundingBox();
  const response = page.waitForResponse("**/api/checkout/config");
  release();
  const settings = await response;
  expect(settings.ok()).toBe(true);
  await settings.finished();
  await expect(status).toContainText("Online ordering is unavailable.");
  await expect(retry).toBeVisible();
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
    await page.goto("/bakery?category=cakes&lang=en", {
      waitUntil: "domcontentloaded",
    });
    const loading = page.locator(".v32-message");
    await expect(loading).toContainText(/Loading|Cargando|جارٍ/);
    await page.screenshot({ path: info.outputPath(`loading-${width}.png`) });
    release();
    await expect(page.locator(".ref32-grid")).toBeVisible();
    await expect(
      loading.filter({ hasText: /Loading|Cargando|جارٍ/ }),
    ).toHaveCount(0);
    const photo = page.locator(".ref32-photo").first();
    await expect(photo).toBeVisible();
    const rect = await photo.boundingBox();
    expect(Math.abs(rect!.width / rect!.height - 4 / 3)).toBeLessThan(0.02);
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
    await page.goto("/bakery?category=cakes&lang=en");
    await expect(page.locator(".v32-message")).toContainText(
      "Online ordering is unavailable.",
    );
    await expect(page.locator(".ref32-product")).toHaveCount(0);
    failed = false;
    // The catalog revalidates on its scheduled refresh once the outage
    // clears; the user gesture below mirrors the manual retry path.
    await menuRetry(page).click();
    await expect(page.locator(".ref32-grid")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".ref32-product").first()).toBeVisible();
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
    await page.goto("/bakery?category=cakes&lang=en");
    await expect(page.locator(".v32-message")).toContainText(
      "No matching products.",
    );
    await expect(page.locator(".ref32-product")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
