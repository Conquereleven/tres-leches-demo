import { test, expect } from "@playwright/test";

test("public storefront opens the Operations dashboard", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Gestión", exact: true }).click();
  await expect(page).toHaveURL(/\/operations\/inbox$/);
  await expect(page.locator(".ops-shell")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Inbox", exact: true }),
  ).toBeVisible();
});
