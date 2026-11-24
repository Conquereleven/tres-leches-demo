import { test, expect } from "@playwright/test";
import { gotoWithCart } from "../helpers/storefront";

/**
 * RT01 R3: the cart seed applies once per tab session. Editing the quantity
 * and moving through full-page loads (cart → checkout → cart) must keep the
 * edited value; the seed must NOT be reapplied on later navigations.
 * Existing positive/negative checkout coverage stays in checkout.spec.ts
 * and delivery-pickup.spec.ts.
 */
test("cart keeps the edited quantity across cart → checkout → cart", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await gotoWithCart(
    page,
    "/cart",
    [{ productId: "pan-de-muerto", quantity: 1 }],
    '[data-new-ui="cart"]',
  );
  const row = page.locator(".v32-new-cart-items .v32-new-cart-row").first();
  await expect(row).toContainText("AED");
  const qty = row.locator('input[type="number"]');
  await expect(qty).toHaveValue("1");

  // Customer edit: 1 → 3. The Shop cart persists to localStorage on change.
  await qty.fill("3");
  await expect(qty).toHaveValue("3");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("3l-cart")))
    .toContain('"quantity":3');

  // Full-page loads, not SPA transitions: each one re-runs init scripts.
  await page.goto("/checkout");
  await expect(page.locator(".b-shop .b-co-header")).toBeVisible();

  await page.goto("/cart");
  await expect(page.locator('[data-new-ui="cart"]')).toBeVisible();
  const qtyAfter = page
    .locator(".v32-new-cart-items .v32-new-cart-row")
    .first()
    .locator('input[type="number"]');
  // The edited 3 persisted; the seed of 1 was NOT reapplied (RT01 R3).
  await expect(qtyAfter).toHaveValue("3");
  expect(await page.evaluate(() => localStorage.getItem("3l-cart"))).toContain(
    '"quantity":3',
  );
  expect(errors).toEqual([]);
});

test("negative: quantity above the 100-unit maximum is rejected", async ({
  page,
}) => {
  await gotoWithCart(
    page,
    "/cart",
    [{ productId: "pan-de-muerto", quantity: 1 }],
    '[data-new-ui="cart"]',
  );
  const row = page.locator(".v32-new-cart-items .v32-new-cart-row").first();
  const qty = row.locator('input[type="number"]');
  await expect(qty).toHaveAttribute("max", "100");
  await qty.fill("101");
  // The cart clamps to the approved maximum instead of storing 101.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("3l-cart")))
    .not.toContain('"quantity":101');
});
