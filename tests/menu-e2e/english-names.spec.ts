import { test, expect } from "@playwright/test";

// One product, one SKU, three languages: menu card, product page and cart line.
const product = "/menu?product=pan-de-muerto-traditional--azucar";
const sku = "pan-de-muerto-traditional-azucar-individual-70-g";
const expected = {
  en: {
    title: "Traditional Pan de Muerto · Sugar",
    cart: "Traditional Pan de Muerto · Sugar · Individual · 70 g",
  },
  es: {
    title: "Pan de Muerto tradicional · Azúcar",
    cart: "Pan de Muerto tradicional · Azúcar · Individual · 70 g",
  },
  ar: { title: "Pan de Muerto تقليدي · سكر", cart: "سكر" },
} as const;
const spanishInEnglish =
  /Pan de Muerto (tradicional|relleno)|Azúcar|Ajonjolí|individuales|Mascarpone y/u;

for (const [locale, copy] of Object.entries(expected))
  test(`${locale}: product page and cart use the ${locale} catalog wording`, async ({
    page,
  }) => {
    await page.addInitScript(
      (line) => {
        localStorage.setItem("3l-cart", JSON.stringify([line]));
      },
      { productId: sku, quantity: 1 },
    );
    await page.goto(`${product}&lang=${locale}`);
    await expect(page.locator("h1.b-product-title")).toHaveText(copy.title);
    await page.goto(`/cart?lang=${locale}`);
    await expect(page.locator("main")).toContainText(copy.cart);
    if (locale === "en")
      await expect(page.locator("main")).not.toContainText(spanishInEnglish);
  });

test("en: the Pan de Muerto menu shows no Spanish-authored names", async ({
  page,
}) => {
  await page.goto("/menu?lang=en");
  await page
    .getByRole("navigation", { name: "Menu categories" })
    .getByRole("button", { name: "Pan de Muerto", exact: true })
    .click();
  const grid = page.locator(".b-menu-grid");
  await expect(grid).toContainText("Traditional Pan de Muerto · Sugar");
  await expect(grid).toContainText(
    "Filled Pan de Muerto · Mascarpone and cajeta",
  );
  // Option labels are part of the visible text of each card's selector.
  // Pistachio names are held: the founder corrected them in Product Hub.
  const visible = (await grid.innerText())
    .split("\n")
    .filter((line) => !/Pistachio/u.test(line));
  expect(visible.filter((line) => spanishInEnglish.test(line))).toEqual([]);
});
