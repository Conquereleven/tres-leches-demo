import { test, expect } from "@playwright/test";

test("S02 public bakery groups Pan de Muerto and Conchas without changing product ids", async ({ page }) => {
  await page.goto("/menu?category=pan");
  const nav = page.getByRole("navigation", { name: "Menu categories" });
  await expect(nav.getByRole("button", { name: "Pan de Muerto" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Conchas" })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Panadería Mexicana" })).toBeVisible();
  await expect(page.locator('[data-menu-family^="pan-de-muerto"]').first()).toBeVisible();
  await expect(page.locator('[data-menu-family^="conchas"]').first()).toBeVisible();
  await page.goto("/menu?category=conchas");
  await expect(nav.getByRole("button", { name: "Panadería Mexicana" })).toHaveAttribute("aria-pressed", "true");
});

for (const width of [320, 390, 1440]) {
  test(`S02 floating options never reflow cards at ${width}px; Escape restores keyboard focus`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/menu?category=bakery");
    const card = page.locator('[data-menu-family="pan-de-muerto-traditional-pack"]').first();
    const trigger = card.locator(".s02-open");
    const before = await card.boundingBox();
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("select")).toHaveCount(1);
    const after = await card.boundingBox();
    expect(after?.height).toBe(before?.height);
    expect(after?.width).toBe(before?.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test("S02 mismatched checkout price blocks cart from floating options", async ({ page }) => {
  await page.route("**/api/checkout/config", async route => {
    const response = await route.fetch();
    const config = await response.json();
    config.products = config.products.map((p: { priceFils: number }) => ({
      ...p, priceFils: p.priceFils + 1,
    }));
    await route.fulfill({json: config});
  });
  await page.goto("/menu?category=bakery");
  await page.locator('[data-menu-family="pan-de-muerto-traditional-pack"] .s02-open').first().click();
  await expect(page.getByRole("dialog").getByRole("button", {name: "ADD TO CART · UNAVAILABLE"})).toBeDisabled();
});
