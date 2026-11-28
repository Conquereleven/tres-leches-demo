import { expect, test, type Page } from "@playwright/test";
import manifest from "../../data-imports/rt012-panettone/manifest.json" with { type: "json" };

const languages = {
  en: { mexican: "Mexican Bakery", panettone: "Panettone", special: "Special Flavors" },
  es: { panettone: "Panettone" },
  ar: { panettone: "بانيتوني" },
};

async function revealCategories(page: Page) {
  const trigger = page.locator(".category-trigger");
  await page.locator("button[data-product-id]").first().waitFor();
  if (await trigger.isVisible()) await trigger.click();
}

test("three flavors, six sizes and prices, correct photo identity, persistent cart and server quote", async ({ page, request }, info) => {
  await page.goto("/bakery?lang=en");
  await revealCategories(page);
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

  const anchor = page.locator('.ref32-product[data-product-id="panettone-normal"]');
  await anchor.click();
  const panel = page.getByRole("dialog", { name: "Panettone Normal" });
  await panel.locator('[data-sku="panettone-normal-normal"]').click();
  for (const product of manifest.products.slice(1)) {
    await page.locator("#product-panel").locator(`[data-variant-id="${product.id}"]`).click();
    await expect(page.locator("#product-panel")).toHaveAttribute("data-selected-sku", `${product.id}-normal`);
    await expect(page.locator("#product-panel img.ref32-panettone-preview")).toHaveAttribute("src",
      `/brand/hub/${product.previewPhoto.sha256}.webp`);
  }
  await page.locator("#product-panel").getByRole("button", { name: "Close" }).click();

  const cart = [];
  for (const product of manifest.products) {
    const card = page.locator(`.ref32-product[data-product-id="${product.id}"]`);
    await expect(card.locator("img")).toHaveAttribute("src", `/brand/hub/${product.previewPhoto.sha256}.webp`);
    await card.scrollIntoViewIfNeeded();
    await expect.poll(() => card.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    for (const size of manifest.sizes) {
      await card.click();
      const dialog = page.getByRole("dialog", { name: product.name.en });
      const sku = `${product.id}-${size.id}`;
      const option = dialog.locator(`[data-sku="${sku}"]`);
      await expect(dialog.getByRole("group", { name: "Size", exact: true }).getByRole("button")).toHaveCount(2);
      await expect(option.locator("span")).toHaveText(size.en);
      const flavorGroup = dialog.getByRole("group", { name: "Choose a variant", exact: true });
      await expect(flavorGroup.locator("button > span")).toHaveText(manifest.products.map(item => item.flavor.en));
      await expect(option).toContainText(String(size.priceFils / 100));
      await option.click();
      await expect(dialog).toHaveAttribute("data-selected-sku", sku);
      const photo = dialog.locator("img.ref32-panettone-preview");
      await expect(photo).toHaveAttribute("src", `/brand/hub/${product.previewPhoto.sha256}.webp`);
      const dimensions = await photo.evaluate(async (img: HTMLImageElement) => {
        await img.decode();
        const bitmap = await createImageBitmap(await (await fetch(img.currentSrc)).blob());
        try { return [bitmap.width, bitmap.height]; }
        finally { bitmap.close(); }
      });
      expect(dimensions).toEqual([960, 960]);
      await expect(card.locator("img")).toHaveCSS("object-fit", "cover");
      if (size.id === "mini") await expect(dialog.getByText("Photo shows the Normal size")).toBeVisible();
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
  await firstRow.getByRole("spinbutton").blur();
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
  await page.getByRole("link", { name: /^Checkout/ }).click();
  await page.getByRole("radio", { name: "PICKUP", exact: true }).check();
  const summary = page.getByRole("complementary", { name: "Order summary" });
  const summaryToggle = summary.getByRole("button", { name: /Show order summary/i });
  if (await summaryToggle.isVisible()) await summaryToggle.click();
  for (const product of manifest.products)
    for (const size of manifest.sizes)
      await expect(summary.getByText(`${product.name.en} · ${size.en}`, { exact: true })).toBeVisible();
});

for (const language of ["es", "ar"] as const) {
  test(`localized Panettone product, size and allergen copy in ${language}`, async ({ page }) => {
    const product = manifest.products[2]!;
    await page.goto(`/bakery?category=panettone&lang=${language}`);
    await revealCategories(page);
    await expect(page.getByRole("button", { name: languages[language].panettone, exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.locator(`.ref32-product[data-product-id="${product.id}"]`).click();
    const dialog = page.getByRole("dialog", { name: product.name[language] });
    await expect(dialog).toContainText(product.description[language]);
    await expect(dialog.locator("button[data-variant-id] > span")).toHaveText(manifest.products.map(item => item.flavor[language]));
    for (const size of manifest.sizes)
      await expect(dialog.locator(`[data-sku="${product.id}-${size.id}"] > span`)).toHaveText(size[language]);
    await expect(dialog).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
  });
}

test("shows unavailable Panettone choices and cannot add an unavailable SKU", async ({ page, request }) => {
  test.skip(process.env.PANETTONE_FIXTURE_MIXED !== "true", "Mixed availability fixture");
  await page.goto("/bakery?category=panettone&lang=en");
  await page.locator('.ref32-product[data-product-id="panettone-normal"]').click();
  const dialog = page.locator("#product-panel");
  await expect(dialog.locator('[data-variant-id="panettone-pistacchio"]')).toBeDisabled();
  await dialog.locator('[data-variant-id="panettone-chocolate"]').click();
  await expect(dialog.locator('[data-sku="panettone-chocolate-mini"]')).toBeDisabled();
  await expect(dialog).toHaveAttribute("data-selected-sku", "panettone-chocolate-normal");
  await dialog.getByRole("button", { name: /Add to cart/ }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("3l-cart") ?? "[]")))
    .toEqual([{ productId: "panettone-chocolate-normal", quantity: 1 }]);
  const quote = await request.post("/api/checkout/quote", {
    headers: { Origin: "http://127.0.0.1:4178" },
    data: { lines: [{ productId: "panettone-chocolate-mini", quantity: 1 }], fulfillmentMethod: "pickup" },
  });
  expect((await quote.json()).eligible).toBe(false);
});
