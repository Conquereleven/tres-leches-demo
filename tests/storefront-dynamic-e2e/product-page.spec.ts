/**
 * 3L-SEO-AEO-002: a product's permanent URL keeps one H1 — the product name —
 * in the server HTML and after the interactive view renders.
 */
import { test, expect } from "@playwright/test";

test("every fixed pack offer URL selects its actual size and price without inventing composition offers", async ({
  page,
}) => {
  const catalog = await (
    await page.request.get("/api/storefront/catalog")
  ).json();
  const packs = catalog.products.filter((p: { id: string }) =>
    ["pan-de-muerto-traditional-pack", "pan-de-muerto-filled-pack"].includes(
      p.id,
    ),
  );
  let checked = 0;
  for (const product of packs) {
    for (const option of product.options) {
      await page.goto(
        `/menu/${product.slug}?sku=${encodeURIComponent(option.id)}`,
      );
      await expect(
        page.getByRole("combobox", { name: "Pack", exact: true }),
      ).toHaveValue(option.size);
      await expect(page.locator(".b-add-to-cart > button")).toContainText(
        `AED ${option.priceFils / 100}`,
      );
      const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute("href");
      expect(canonical).toBe(`https://www.3ldubai.ae/menu/${product.slug}`);
      checked++;
    }
  }
  expect(checked).toBe(8);
});

test("/menu/<slug> has one H1, the product name, before and after JavaScript", async ({
  page,
  browser,
}) => {
  const catalog = (await (
    await page.request.get("/api/storefront/catalog")
  ).json()) as {
    products: { slug: string; content: { en: { name: string } } }[];
  };
  const product = catalog.products.find(
    (p) => p.slug === "tres-leches--classic",
  )!;
  const name = product.content.en.name;
  const crawler = await browser.newContext({ javaScriptEnabled: false });
  const raw = await crawler.newPage();
  await raw.goto(`/menu/${product.slug}`);
  await expect(raw.locator("h1")).toHaveCount(1);
  await expect(raw.locator("h1")).toHaveText(name);
  const photo = raw.locator("[data-seo-product] img");
  const ratio = await photo.evaluate((img) => {
    const box = img.getBoundingClientRect();
    return {
      displayed: box.width / box.height,
      intrinsic:
        Number(img.getAttribute("width")) / Number(img.getAttribute("height")),
    };
  });
  expect(ratio.displayed).toBeCloseTo(ratio.intrinsic, 2);
  await crawler.close();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/menu/${product.slug}`);
  await expect(page.locator("[data-product-id]")).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText(name);
  await expect(page).toHaveTitle(`${name} — Pastelerías 3L Dubai`);
  // The menu itself keeps its own heading.
  await page.goto("/menu");
  await expect(page.locator("h1").first()).toHaveText(/Menu/);
  expect(errors).toEqual([]);
});

test("a legacy query cannot replace the canonical path product after JavaScript", async ({
  page,
}) => {
  await page.goto("/menu/tres-leches--classic?product=carrot-cake&lang=en");
  await expect(page.locator("[data-product-id]")).toHaveAttribute(
    "data-product-id",
    "tres-leches--classic",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://www.3ldubai.ae/menu/tres-leches--classic",
  );
});

test("product pages preserve mobile EN/ES/AR, RTL and Add to Cart", async ({
  page,
}, testInfo) => {
  for (const language of ["en", "es", "ar"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/menu/tres-leches--classic?lang=${language}`);
    await expect(page.locator("[data-product-id]")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    if (language === "ar")
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("h1")).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const add = page.locator(".b-add-to-cart > button");
    await expect(add).toBeEnabled();
    await page.screenshot({
      path: `docs/seo/sprint03/${testInfo.project.name}-${language}-390.png`,
      fullPage: true,
    });
    await add.click();
    await page.goto(`/cart?lang=${language}`);
    await expect(page.locator(".b-co-item").first()).toBeVisible();
  }
});
