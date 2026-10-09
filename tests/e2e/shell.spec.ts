import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("TL27 sidebar, drawer keyboard, responsive widths and history", async ({
  page,
}) => {
  await page.goto("/operations/inbox");
  await expect(
    page.getByRole("heading", { name: "Inbox", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ops-sidebar")).toHaveCSS("width", "252px");
  await page.getByRole("button", { name: "Contraer barra lateral" }).click();
  await expect(page.locator(".ops-sidebar")).toHaveCSS("width", "80px");
  await page.reload();
  await expect(page.locator(".ops-sidebar")).toHaveCSS("width", "80px");
  await page.getByRole("button", { name: "Expandir barra lateral" }).click();
  for (const width of [1024, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator(".ops-sidebar")).toHaveCSS("width", "80px");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect(page.locator(".ops-sidebar")).toBeHidden();
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Operaciones" }),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Cerrar menú" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Abrir menú" })).toBeFocused();
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("button", { name: "Pedidos", exact: true }).click();
  await expect(page).toHaveURL(/\/operations\/orders$/);
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Inbox", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
