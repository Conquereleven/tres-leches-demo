import { expect, test } from "@playwright/test";
import bolillo from "../../data-imports/commercial-hotfix/ph-media.json" with { type: "json" };

test("existing Mexican Bolillo resolves the verified PH product photo", async ({ page }, info) => {
  const photoUrl = `/brand/hub/${bolillo.sha256}.webp`;
  await page.goto("/bakery?q=Mexican%20Bolillo&lang=en");
  const card = page.locator('.ref32-product[data-product-id="111"]');
  const photo = card.locator("img");
  await expect(photo).toHaveAttribute("src", photoUrl);
  await expect(photo).toHaveCSS("object-fit", "contain");
  await photo.evaluate((img: HTMLImageElement) => img.decode());
  await card.screenshot({ path: info.outputPath("mexican-bolillo-card.png") });
  await card.click();
  const dialog = page.getByRole("dialog", { name: "Mexican Bolillo" });
  await expect(dialog).toHaveAttribute("data-selected-sku", "B111");
  await expect(dialog.locator("[data-minimum-notice]")).toContainText("6");
  await dialog.getByRole("button", { name: /Add to cart/ }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("3l-cart") ?? "[]")))
    .toEqual([{ productId: "B111", quantity: 6 }]);
  await page.goto("/menu/111?lang=en");
  await expect(page.getByRole("heading", { name: "Mexican Bolillo", exact:true })).toBeVisible();
  await expect(page.locator(".v32-product-page-card img")).toHaveAttribute("src", photoUrl);
});
