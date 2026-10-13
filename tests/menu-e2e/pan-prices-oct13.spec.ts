import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { chooseArea } from "../fixtures/storefront-form";
import { PAN_OCT13_CORRECTION as changes } from "../../server/domain/pan-price-correction";
const products: { slug: string; optionIds: string[] }[] = JSON.parse(
  readFileSync("shared/storefront-products.json", "utf8"),
);
const families: { options: { id: string; size: string }[] }[] = JSON.parse(
  readFileSync("src/brand/menu-data.json", "utf8"),
).families;
for (const [id, [, fils]] of Object.entries(changes))
  test(`${id}: selector, cart, delivery/pickup summary and fixed quantity price`, async ({
    page,
  }) => {
    const product = products.find((p) => p.optionIds.includes(id))!;
    const option = families.flatMap((f) => f.options).find((o) => o.id === id)!;
    await page.goto(`/menu?product=${product.slug}`);
    await page.getByRole("combobox").selectOption(option.size);
    await expect(page.locator(".b-menu-price")).toContainText(
      `AED ${fils / 100}`,
    );
    await page
      .getByRole("textbox", { name: "Quantity", exact: true })
      .fill("3");
    await page
      .getByRole("button", {
        name: `ADD TO CART · AED ${(fils * 3) / 100}`,
        exact: true,
      })
      .click();
    await page.goto("/cart");
    await expect(page.locator("main")).toContainText(`AED ${(fils * 3) / 100}`);
    await page.getByRole("link", { name: "CONTINUE TO FULFILLMENT" }).click();
    await chooseArea(page, "JLT", "JLT Cluster C");
    await expect(page.locator(".b-co-summary")).toContainText(
      `AED ${(fils * 3) / 100}`,
    );
    await page.getByRole("radio", { name: "PICKUP", exact: true }).check();
    await expect(page.locator(".b-co-summary")).toContainText(
      `AED ${(fils * 3) / 100}`,
    );
  });
