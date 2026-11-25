import { expect, test } from "@playwright/test";
import manifest from "../../data-imports/rt012-panettone/manifest.json" with { type: "json" };

const languages = {
  en: { mexican: "Mexican Bakery", panettone: "Panettone", special: "Special Flavors" },
  es: { panettone: "Panettone" },
  ar: { panettone: "بانيتوني" },
};

test("three flavors, six sizes and prices, correct photo identity, persistent cart and server quote", async ({ page, request }, info) => {
  await page.goto("/bakery?lang=en");
  const tab = page.getByRole("button", { name: languages.en.panettone, exact: true });
  await expect(tab).toBeVisible();
  const labels = await tab.locator("..").getByRole("button").allTextContents();
  const position = labels.indexOf(languages.en.panettone);
  expect(labels.slice(position - 1, position + 2)).toEqual(
    [languages.en.mexican, languages.en.panettone, languages.en.special],
  );
  await tab.click();
  await expect(page).toHaveURL(/category=panettone/);
  await expect(page.locator(".ref32-product")).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("panettone-category.png"), fullPage: true });

  const cart = [];
  for (const product of manifest.products) {
    const card = page.locator(`.ref32-product[data-product-id="${product.id}"]`);
    await expect(card.getByRole("img")).toHaveAttribute("src", `/brand/hub/${product.previewPhoto.sha256}.webp`);
    await card.scrollIntoViewIfNeeded();
    await expect.poll(() => card.getByRole("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    for (const size of manifest.sizes) {
      await card.click();
      const dialog = page.getByRole("dialog", { name: product.name.en });
      const sku = `${product.id}-${size.id}`;
      const option = dialog.locator(`[data-sku="${sku}"]`);
      await expect(dialog.getByRole("group", { name: "Size", exact: true }).getByRole("button")).toHaveCount(2);
      await expect(option).toContainText(size.en);
      await expect(option).toContainText(String(size.priceFils / 100));
      await option.click();
      await expect(dialog).toHaveAttribute("data-selected-sku", sku);
      if (product.id === "panettone-pistacchio" && size.id === "normal")
        await page.screenshot({ path: info.outputPath("pistacchio-normal-dialog.png"), animations: "disabled" });
      await dialog.getByRole("button", { name: /Add to cart/ }).click();
      await expect(dialog).toHaveCount(0);
      cart.push({ productId: sku, quantity: 1 });
    }
  }

  await page.goto("/cart?lang=en");
  const rows = page.locator(".v32-new-cart-row");
  await expect(rows).toHaveCount(6);
  const firstRow = rows.filter({ has: page.getByRole("heading", { name: "Panettone Normal · Mini", exact: true }) });
  await firstRow.getByRole("spinbutton").fill("2");
  cart[0]!.quantity = 2;
  await page.reload();
  await expect(firstRow.getByRole("spinbutton")).toHaveValue("2");
  await expect(page.locator(".v32-new-total")).toContainText(/618[.,]00|618/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("3l-cart") ?? "[]"))).toEqual(cart);

  const send = (lines: unknown) => request.post("/api/checkout/quote", {
    headers: { Origin: "http://127.0.0.1:4178" },
    data: { lines, fulfillmentMethod: "pickup" },
  });
  const quote = await send(cart);
  expect(quote.ok()).toBeTruthy();
  expect(await quote.json()).toMatchObject({ eligible: true, subtotalFils: 61800 });
  expect((await send([{ ...cart[0], priceFils: 1 }])).ok()).toBeFalsy();
  expect((await send([{ productId: "panettone-missing-mini", quantity: 1 }])).status()).toBe(422);
});

for (const language of ["es", "ar"] as const) {
  test(`localized Panettone product, size and allergen copy in ${language}`, async ({ page }) => {
    const product = manifest.products[2]!;
    await page.goto(`/bakery?category=panettone&lang=${language}`);
    await expect(page.getByRole("button", { name: languages[language].panettone, exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.locator(`.ref32-product[data-product-id="${product.id}"]`).click();
    const dialog = page.getByRole("dialog", { name: product.name[language] });
    await expect(dialog).toContainText(product.description[language]);
    for (const size of manifest.sizes)
      await expect(dialog.locator(`[data-sku="${product.id}-${size.id}"]`)).toContainText(size[language]);
    await expect(dialog).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
  });
}
