import { expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Navigate to a storefront route and wait for visible readiness instead of
 * coupling the test to incidental API traffic.
 *
 * Root cause (RT01 RC-01): Home V3.2 (`/`) and the menu landing (`/menu`) do
 * not fetch `/api/checkout/config` — only cart/checkout-adjacent components
 * behind `useCheckoutConfig` do. `page.waitForResponse(...checkout/config)`
 * around `page.goto("/")` therefore always times out on the approved V3.2
 * shell. Readiness here is a visible shell, never a network request.
 */
export async function gotoStorefront(
  page: Page,
  url: string,
  ready = ".v32-app, main",
): Promise<void> {
  await page.goto(url);
  await expect(page.locator(ready).first()).toBeVisible();
}

/**
 * Seed the browser cart before the first navigation (via init script, so a
 * hydrating WebKit document is never torn down mid-fetch) and open the
 * target route once it is visibly ready.
 *
 * Root cause (RT01 R3): `page.addInitScript` runs on EVERY new document of
 * the page, not just the first navigation. An unguarded
 * `localStorage.setItem("3l-cart", seed)` therefore reseeded the cart on
 * each later `page.goto` (cart → checkout → return) and masked real
 * persistence regressions. The seed below applies once per tab session:
 * later full-page loads keep the customer's edits. A new test (fresh
 * browser context) seeds again. To reseed deliberately, clear
 * `sessionStorage["3l-cart-seeded"]` first.
 */
export async function gotoWithCart(
  page: Page,
  url: string,
  lines: unknown,
  ready?: string,
): Promise<void> {
  await page.addInitScript((seed) => {
    if (!sessionStorage.getItem("3l-cart-seeded")) {
      localStorage.setItem("3l-cart", JSON.stringify(seed));
      sessionStorage.setItem("3l-cart-seeded", "1");
    }
  }, lines);
  await gotoStorefront(page, url, ready);
}

/**
 * Independent API check for the checkout configuration endpoint.
 * Use this instead of asserting on a response captured incidentally during
 * navigation: it keeps the 200/503 coverage without coupling page loads to
 * component-internal fetches. Never call it to force Home to fetch.
 */
export async function expectCheckoutConfig(
  request: APIRequestContext,
  status = 200,
): Promise<void> {
  const response = await request.get("/api/checkout/config");
  expect(response.status()).toBe(status);
}
