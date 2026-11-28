import { expect, test } from "@playwright/test";

test("staff footer link uses existing authentication and keeps Operations private", async ({ page, request }, info) => {
  expect((await request.get("/api/workspace")).status()).toBe(401);
  expect((await request.get("/api/product-hub")).status()).toBe(401);
  const labels = { en: "Staff Access", es: "Acceso para el personal", ar: "دخول الموظفين" };
  for (const language of ["en", "es", "ar"] as const) {
    await page.goto(`/journal?lang=${language}`);
    const footer = page.locator(".v32-site-footer");
    await expect(footer).toHaveCSS("direction", language === "ar" ? "rtl" : "ltr");
    const link = footer.getByRole("link", { name: labels[language], exact: true });
    await expect(link).toHaveAttribute("href", "/operations/orders");
    await link.focus();
    await expect(link).toBeFocused();
  }
  await page.locator(".v32-site-footer").screenshot({ path: info.outputPath("staff-footer-rtl.png") });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/operations\/orders$/);
  const username = page.locator('input[autocomplete="username"]');
  const password = page.locator('input[autocomplete="current-password"]');
  const submit = page.locator("main.ops-auth button[type=submit], main.ops-auth form button.primary");
  await expect(password).toBeVisible();
  await expect(page.locator(".operations-table")).toHaveCount(0);
  await username.fill("fixture-admin");
  await password.fill("invalid-fixture-password");
  const rejected = page.waitForResponse(response => response.url().endsWith("/api/login"));
  await submit.click();
  expect((await rejected).status()).toBe(401);
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
  await password.fill("fictional-password");
  const accepted = page.waitForResponse(response => response.url().endsWith("/api/login"));
  await submit.click();
  expect((await accepted).ok()).toBe(true);
  await expect(password).toHaveCount(0);
  expect((await page.request.get("/api/workspace")).status()).toBe(200);
  await page.goto("/?lang=en");
  await page.locator(".v32-site-footer").getByRole("link", { name: labels.en }).click();
  await expect(page).toHaveURL(/\/operations\/orders$/);
  await expect(page.locator(".ops-shell")).toBeVisible();
  await expect(password).toHaveCount(0);
});
