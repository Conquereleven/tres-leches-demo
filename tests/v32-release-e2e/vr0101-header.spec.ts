import { expect, test } from "@playwright/test";

const routes = [
  "/", "/menu", "/bakery?category=cakes", "/bakery", "/menu/conchas-traditional--vainilla",
  "/cart", "/checkout", "/checkout/return", "/journal", "/contact", "/how-to-order",
  "/terms", "/privacy", "/refund-policy", "/delivery-policy",
];

test("one floating first-paint header on every public route", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
    const page = await context.newPage();
    let baseline: unknown;
    for (const route of routes) {
      const response = await page.goto(new URL(route, baseURL).href);
      expect(response?.status(), route).toBe(200);
      const header = page.locator("header.mast");
      await expect(header).toHaveCount(1);
      await expect(header.locator(".brand img")).toHaveAttribute("src", "/brand/vr008/wordmark-tight.png");
      await expect(page.locator("header.mast.flat, header.b-co-header")).toHaveCount(0);
      const style = await header.evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        const css = getComputedStyle(el);
        const logo = el.querySelector(".brand img")!;
        const logoBounds = logo.getBoundingClientRect();
        return [
          bounds.x, bounds.y, bounds.width, bounds.height, css.borderRadius,
          css.backgroundImage, css.boxShadow, css.fontSize,
          logoBounds.width, getComputedStyle(logo).filter,
        ];
      });
      if (route === "/") baseline = style;
      else expect(style, route).toEqual(baseline);
    }
    const arabic = await page.goto(new URL("/checkout?lang=ar", baseURL).href);
    expect(arabic?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator(".mast .mobile-nav")).toHaveAttribute("aria-label", "فتح قائمة التنقل");
    await context.close();
  }
});

test("mobile navigation restores keyboard focus and preserves language and cart across routes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?lang=es");
  const trigger = page.getByRole("button", { name: "Abrir navegación" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: "Navegación móvil" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.evaluate(() => localStorage.setItem("3l-cart", JSON.stringify([
    { productId: "conchas-traditional-vainilla-individual-70-g", quantity: 1 },
  ])));
  await page.reload();
  await expect(page.locator(".mast .mobile-bag output")).toHaveText("1");
  await trigger.click();
  await menu.getByRole("link", { name: "Diario" }).click();
  await expect(page).toHaveURL(/\/journal\?lang=es/);
  await expect(page.locator(".mast .mobile-bag output")).toHaveText("1");
  await trigger.click();
  await menu.getByLabel("Idioma").selectOption("ar");
  await page.getByRole("dialog", { name: "قائمة التنقل" }).getByRole("link", { name: "القائمة" }).click();
  await expect(page).toHaveURL(/\/menu\?lang=ar/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const badge = page.locator(".mast .mobile-bag output");
  await expect(badge).toHaveText("١");
  expect(await badge.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(20);
  await expect(page.locator(".mast")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
