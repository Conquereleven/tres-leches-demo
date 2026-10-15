/**
 * 3L-SEO-AEO-002: a product's permanent URL keeps one H1 — the product name —
 * in the server HTML and after the interactive view renders.
 */
import { test, expect } from "@playwright/test";

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
