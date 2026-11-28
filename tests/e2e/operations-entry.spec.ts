import { test, expect } from "@playwright/test";

test("public storefront keeps staff navigation separate from Operations", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".mast")).toBeVisible();
  await expect(page.locator('a[href^="/operations"]')).toHaveCount(1);
  await expect(page.locator('.mast a[href^="/operations"]')).toHaveCount(0);
  const staffAccess = page.locator(".v32-site-footer").getByRole("link", { name: "Staff Access", exact: true });
  await expect(staffAccess).toHaveAttribute("href", "/operations/orders");
  await expect(page.getByRole("button", { name: "Gestión", exact: true })).toHaveCount(0);
  await staffAccess.click();
  await expect(page).toHaveURL(/\/operations\/orders$/);
  await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
  await page.goto("/operations/inbox");
  await expect(page).toHaveURL(/\/operations\/inbox$/);
  await expect(page.locator(".ops-shell")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Inbox", exact: true }),
  ).toBeVisible();
});
