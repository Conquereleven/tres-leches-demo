import { expect, test } from "@playwright/test";

const policyPaths = ["/terms", "/privacy", "/refund-policy", "/delivery-policy"];
const publicRoutes = [
  "/", "/menu", "/bakery", "/journal", "/contact", "/how-to-order",
  ...policyPaths, "/cart", "/checkout", "/checkout/return",
  "/menu/tres-leches--classic", "/menu/panettone-normal",
];
const languages = ["en", "es", "ar"] as const;
const guestOnly = 'a[href*="/account"], a[href*="/register"], a[href*="/orders/history"]';

test("localized policy text, metadata and guest navigation are present before JavaScript", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const language of languages) {
    for (const route of publicRoutes) {
      const response = await page.goto(new URL(`${route}?lang=${language}`, baseURL).href);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.locator("meta[property='og:locale']")).toHaveAttribute("content", language + "_AE");
      await expect(page.locator(guestOnly)).toHaveCount(0);
      const metadata = await page.locator("meta[name='description']").getAttribute("content");
      expect(metadata, route).toBeTruthy();
      if (language === "ar") {
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
        expect(await page.title(), route).toMatch(/\p{Script=Arabic}/u);
        expect(metadata, route).toMatch(/\p{Script=Arabic}/u);
      }
      if (route === "/bakery" && language !== "en") {
        await expect(page.locator("main noscript")).not.toContainText("Enable JavaScript");
        await expect(page.locator(`main noscript a[href="/contact?lang=${language}"]`)).toHaveCount(1);
      }
      if (policyPaths.includes(route)) {
        const main = page.locator("main");
        await expect(main).not.toContainText(/Translation pending|Traducción pendiente|الترجمة قيد الإعداد/);
        await expect(main.locator("section h2").last()).toBeVisible();
        const english = /Terms & Conditions|Privacy Policy|Refund & Cancellation Policy|Delivery Policy|Last updated|No card storage|Who we are|Cancelling before payment|trading as/;
        if (language !== "en") await expect(main).not.toContainText(english);
        if (route === "/refund-policy") {
          await expect(main).toContainText(/(?:12|١٢)/);
          await expect(main).toContainText(/(?:90|٩٠)/);
          await expect(main).toContainText(/(?:10|١٠)/);
        }
      }
    }
  }
  await context.close();
});

test("language switch updates policy content, social metadata and same-language policy links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/refund-policy?lang=en");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Language").selectOption("ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page).toHaveTitle(/\p{Script=Arabic}/u);
  await expect(page.locator("meta[name='twitter:description']")).toHaveAttribute("content", /\p{Script=Arabic}/u);
  await page.keyboard.press("Escape");
  await expect(page.locator('footer a[href="/terms?lang=ar"]')).toHaveCount(1);
  await page.locator('footer a[href="/terms?lang=ar"]').click();
  await expect(page).toHaveURL(/\/terms\?lang=ar$/);
  await expect(page.locator("main h1")).toHaveText(/\p{Script=Arabic}/u);
  await expect(page.locator(guestOnly)).toHaveCount(0);
});

test("public missing pages are localized and guest checkout remains capability-only", async ({ request }) => {
  const missing = { en:"Page not found", es:"Página no encontrada", ar:"الصفحة غير موجودة" };
  for (const lang of languages) {
    for (const path of ["/not-a-3l-page", "/menu/nonexistent-product", "/account", "/account/orders"]) {
      const response = await request.get(`${path}?lang=${lang}`);
      expect(response.status(), path).toBe(404);
      const body = await response.json();
      expect(body.message).toBe(missing[lang]);
      expect(body.order).toBeUndefined();
    }
  }
  const workspace = await request.get("/api/workspace?lang=ar");
  expect(workspace.status()).toBe(401);
  const config = await request.get("/api/checkout/config");
  expect(config.status()).toBe(200);
  const view = await config.json();
  expect(view.products.some((p: { id: string }) => p.id === "panettone-normal-mini")).toBe(true);
});
