import { test, expect } from "@playwright/test";

test("canonical homepage/menu/bakery render approved V3.2", async ({page}) => {
  await page.goto("/");
  await expect(page.locator(".v32-app .v32-header")).toBeVisible();
  await expect(page.locator('a.v32-logo[href="/"]')).toBeVisible();
  await page.goto("/menu");
  await expect(page.locator(".v32-landing")).toBeVisible();
  await page.locator('a.v32-logo[href="/"]').click();
  await expect(page.locator(".v32-home")).toBeVisible();
  const bakeryResponse = await page.goto("/bakery");
  expect(bakeryResponse?.status(), "canonical /bakery must return HTTP 200").toBe(200);
  await expect(page.locator(".v32-catalog")).toBeVisible();
  await page.locator('a.v32-logo[href="/"]').click();
  await expect(page.locator(".v32-home")).toBeVisible();
});

test("canonical cart enters existing real checkout, NOT preview checkout", async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem("3l-cart", JSON.stringify([{
      productId: "tres-leches-classic-13-personas",
      quantity: 1,
      cakeMessage: "Feliz cumple"
    }]));
  });
  await page.goto("/cart");
  await expect(page.locator('[data-new-ui="cart"]')).toBeVisible();
  await expect(page.locator('[data-cart-cake-message]')).toContainText("Feliz cumple");
  await expect(page.locator('a[href="/checkout"]')).toBeVisible();
  await expect(page.locator(".v32-app")).toBeVisible();
  await page.goto("/checkout");
  await expect(page.locator(".b-shop .b-co-header")).toBeVisible();
  await expect(page.locator(".v32-new-payment-block")).toHaveCount(0);
  await expect(page.locator('[data-new-ui="checkout"]')).toHaveCount(0);
  await page.goto("/checkout/return");
  await expect(page.locator(".b-shop")).toBeVisible();
  await expect(page.locator('[data-new-ui="return"]')).toHaveCount(0);
});

test("negative: explicit visual-v32 checkout stays offline-only", async ({page}) => {
  await page.goto("/visual-v32/checkout");
  await expect(page.locator('.v32-app[data-visual-preview="v32"]')).toBeVisible();
  await expect(page.locator('[data-new-ui="checkout"]')).toBeVisible();
  await expect(page.locator(".b-shop")).toHaveCount(0);
});

test("operations route does not inherit customer V3.2", async ({page}) => {
  await page.goto("/operations/login");
  await expect(page.locator(".v32-app")).toHaveCount(0);
});

// Canonical V3.2 cart reuses the classic commercial editing primitives
// (PackBuilder/packComplete/cart.edit, cart.editColor) without changing the
// approved design, prices or payment policy.
test("canonical cart edits tricolor color with line identity and persistence", async ({
  page,
}) => {
  await page.goto("/cart");
  await expect(page.locator('[data-new-ui="cart"]')).toBeVisible();
  // Seed through the page (addInitScript would re-seed on every reload and
  // hide persistence regressions).
  await page.evaluate(() => {
    localStorage.setItem(
      "3l-cart",
      JSON.stringify([
        {
          productId: "conchas-traditional-tricolor-individual-70-g",
          quantity: 1,
          color: "red",
        },
      ]),
    );
  });
  await page.reload();
  const rows = page.locator(".v32-new-cart-row");
  await expect(rows).toHaveCount(1);
  const editor = page.locator(".v32-new-tricolor select");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue("red");
  await editor.selectOption("green");
  await expect(rows).toHaveCount(1);
  await expect(editor).toHaveValue("green");
  await page.reload();
  await expect(page.locator(".v32-new-cart-row")).toHaveCount(1);
  await expect(page.locator(".v32-new-tricolor select")).toHaveValue("green");
});

// HTTP and React must agree about every new commercial deep link, while
// unrecognized routes retain a strict 404 (not a broad SPA catch-all).
test("canonical public deep links return 200 and unknown paths return 404", async ({ page, request }) => {
  const routes: [string,string][] = [
    ["/bakery", ".v32-catalog"],
    ["/contact", '[data-new-ui="contact"]'],
    ["/journal", ".v32-home"],
    ["/how-to-order", '[data-new-ui="how"]'],
    ["/terms", '[data-new-ui="policy"]'],
    ["/privacy", '[data-new-ui="policy"]'],
  ];
  for (const [path, selector] of routes) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} must return 200`).toBe(200);
    await expect(page.locator(selector), `${path} must render V3.2`).toBeVisible();
  }
  const unknown = await request.get("/not-a-3l-route-rt01");
  expect(unknown.status(), "unknown paths must fail closed").toBe(404);
});
