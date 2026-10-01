import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync } from "node:fs";
const menuCategories: { id: string; name: string }[] = JSON.parse(
  readFileSync("src/brand/menu-data.json", "utf8"),
).categories;

const photos = "work/qa/full-menu";
const family = (page: Page, id: string) =>
  page.locator(`[data-menu-family="${id}"]`);
const category = async (page: Page, name: string) => {
  await page
    .getByRole("navigation", { name: "Menu categories" })
    .getByRole("button", { name, exact: true })
    .click();
};

test("all eight categories expose purchasable options with safe selectors", async ({
  page,
}) => {
  await page.goto("/#bakery");
  for (const entry of menuCategories) {
    await category(page, entry.name);
    await expect(page.locator(".b-menu-grid article").first()).toBeVisible();
    await expect(
      page
        .locator(".b-menu-grid button")
        .filter({ hasText: "ADD TO CART" })
        .first(),
    ).toBeEnabled();
  }
  await category(page, "Extras");
  await expect(family(page, "cake-topper").locator("select")).toHaveCount(0);
  await expect(family(page, "candles").locator("select")).toHaveCount(0);
  await category(page, "Seasonal");
  await expect(family(page, "rosca-de-reyes")).toContainText(
    "Order at least 24 hours in advance",
  );
});

test("latest individual sizes, fillings and packs preserve their precise prices", async ({
  page,
}) => {
  await page.goto("/#bakery");
  await category(page, "Pan de Muerto");
  const pan = family(page, "pan-de-muerto-traditional");
  await pan.getByLabel("Flavour").selectOption("Ajonjolí");
  await pan.getByLabel("Size / pack").selectOption("Individual · 70 g");
  await expect(
    pan.getByRole("button", { name: "ADD TO CART · AED 13" }),
  ).toBeEnabled();
  const pack = family(page, "pan-de-muerto-filled-pack");
  await expect(pack.locator("select")).toHaveCount(1);
  await pack
    .getByRole("combobox", { name: "Pack", exact: true })
    .selectOption("12 individuales");
  await expect(
    pack.getByRole("button", { name: "ADD TO CART · AED 235" }),
  ).toBeEnabled();
  await category(page, "Conchas");
  const concha = family(page, "conchas-filled");
  await expect(concha.locator("select")).toHaveCount(2);
  await concha.getByLabel("Filling").selectOption("Mascarpone y fresas");
  await concha.getByLabel("Size / pack").selectOption("Individual");
  await concha.getByRole("button", { name: "ADD TO CART · AED 21" }).click();
  await page.goto("/cart");
  await expect(page.locator("main")).toContainText(
    "Conchas rellenas · Mascarpone y fresas · Individual",
  );
  await expect(page.locator("main")).toContainText("AED 21");
});

test("multiple menu SKUs go through cart and existing web checkout with authoritative total", async ({
  page,
}) => {
  await page.goto("/#bakery");
  await category(page, "Pan de Muerto");
  await family(page, "pan-de-muerto-traditional-pack")
    .getByRole("button", { name: "ADD TO CART · AED 60" })
    .click();
  await category(page, "Cake Jars");
  const bundle = family(page, "cake-jar-bundle");
  await expect(bundle.locator("select")).toHaveCount(1);
  await bundle.getByRole("button", { name: "ADD TO CART · AED 130" }).click();
  await category(page, "Extras");
  await family(page, "candles")
    .getByRole("button", { name: "ADD TO CART · AED 25" })
    .click();
  await page.goto("/cart");
  await expect(page.locator("main")).toContainText("AED 215");
  await page.getByRole("link", { name: "CONTINUE TO DELIVERY" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await page.getByLabel("Delivery area").selectOption("jlt-cluster-c");
  await expect(page.locator("main")).toContainText("AED 215");
  await expect(
    page.getByRole("link", { name: /ORDER ON WHATSAPP/ }),
  ).toHaveCount(0);
});

test("missing or differently priced server SKUs cannot enter the cart", async ({
  page,
}) => {
  await page.route("**/api/checkout/config", async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config.products = config.products.map((product: { priceFils: number }) => ({
      ...product,
      priceFils: product.priceFils + 1,
    }));
    await route.fulfill({ json: config });
  });
  await page.goto("/#bakery");
  await category(page, "Pan de Muerto");
  await expect(
    family(page, "pan-de-muerto-traditional").getByRole("button", {
      name: "ADD TO CART · UNAVAILABLE",
    }),
  ).toBeDisabled();
});

for (const width of [390, 1440]) {
  test(`visual, accessibility and no-payment QA at ${width}px`, async ({
    page,
  }) => {
    mkdirSync(photos, { recursive: true });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const errors: string[] = [];
    const paymentCalls: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.location().url.endsWith("/favicon.ico")
      )
        errors.push(message.text());
    });
    page.on("request", (request) => {
      if (/paymennt\.com|\/api\/checkout\/(token|prepare)/.test(request.url()))
        paymentCalls.push(request.url());
    });
    const shot = async (name: string) => {
      await page.waitForTimeout(500);
      await page
        .locator("img")
        .evaluateAll((images) =>
          Promise.all(
            images
              .filter((image) => image.complete && image.naturalWidth > 0)
              .map((image) => image.decode().catch(() => {})),
          ),
        );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${photos}/${name}-${width}.png`,
        animations: "disabled",
      });
    };
    await page.goto("/");
    await shot("homepage");
    for (const entry of menuCategories) {
      await category(page, entry.name);
      await page
        .locator(".b-menu-category-heading")
        .evaluate((heading) =>
          heading.scrollIntoView({ block: "start", behavior: "instant" }),
        );
      await shot(entry.id);
      const categoryAxe = await new AxeBuilder({ page })
        .include(".b-full-menu")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(categoryAxe.violations).toEqual([]);
    }
    await category(page, "Pan de Muerto");
    await family(page, "pan-de-muerto-filled").screenshot({
      path: `${photos}/product-${width}.png`,
      animations: "disabled",
    });
    const axe = await new AxeBuilder({ page })
      .include(".b-full-menu")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    await family(page, "pan-de-muerto-traditional-pack")
      .getByRole("button", { name: "ADD TO CART · AED 60" })
      .click();
    await page.goto("/cart");
    await shot("cart");
    await page.getByRole("link", { name: "CONTINUE TO DELIVERY" }).click();
    await shot("checkout");
    expect(errors).toEqual([]);
    expect(paymentCalls).toEqual([]);
  });
}
