import { test, expect, type Page } from "@playwright/test";
import { chooseArea } from "../fixtures/storefront-form";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync } from "node:fs";
const menuCategories: { id: string; name: string }[] = JSON.parse(
  readFileSync("src/brand/menu-data.json", "utf8"),
).categories;

const photos = "work/qa/master-sprint";
const family = (page: Page, id: string) =>
  page.locator(`[data-menu-family="${id}"]`).first();
const category = async (page: Page, name: string) => {
  await page
    .getByRole("navigation", { name: "Menu categories" })
    .getByRole("button", { name, exact: true })
    .click();
};

test("all eight categories expose purchasable options with safe selectors", async ({
  page,
}) => {
  await page.goto("/menu");
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
  await page.goto("/menu");
  await category(page, "Pan de Muerto");
  await expect(
    family(page, "pan-de-muerto-traditional").getByRole("button", {
      name: "ADD TO CART · AED 13",
    }),
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
  await expect(concha.locator("select")).toHaveCount(1);
  await concha.getByLabel("Size / pack").selectOption("Individual");
  await concha.getByRole("button", { name: "ADD TO CART · AED 21" }).click();
  await page.goto("/cart");
  await expect(page.locator("main")).toContainText(
    "Concha rellena de pistache · Individual",
  );
  await expect(page.locator("main")).toContainText("AED 21");
});

test("multiple menu SKUs go through cart and existing web checkout with authoritative total", async ({
  page,
}) => {
  await page.goto("/menu");
  await category(page, "Pan de Muerto");
  await family(page, "pan-de-muerto-traditional-pack")
    .getByRole("combobox")
    .selectOption("6 mini");
  await family(page, "pan-de-muerto-traditional-pack")
    .getByRole("button", { name: "ADD TO CART · AED 60" })
    .click();
  await category(page, "Cake Jars");
  const bundle = family(page, "cake-jar-bundle");
  await expect(bundle.locator("select")).toHaveCount(1);
  await bundle.getByRole("combobox").selectOption("4 × 200 ml");
  await bundle.getByRole("button", { name: "ADD TO CART · AED 130" }).click();
  await category(page, "Extras");
  await family(page, "candles")
    .getByRole("button", { name: "ADD TO CART · AED 25" })
    .click();
  await page.goto("/cart");
  await expect(page.locator("main")).toContainText("AED 215");
  await page.getByRole("link", { name: "CONTINUE TO FULFILLMENT" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await chooseArea(page, "JLT", "JLT Cluster C");
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
  await page.goto("/menu");
  await category(page, "Pan de Muerto");
  await expect(
    family(page, "pan-de-muerto-traditional-pack").getByRole("button", {
      name: "ADD TO CART · UNAVAILABLE",
    }),
  ).toBeDisabled();
});

for (const width of [390, 768, 1440]) {
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
    await page.goto("/menu");
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
      .getByRole("combobox")
      .selectOption("6 mini");
    await family(page, "pan-de-muerto-traditional-pack")
      .getByRole("button", { name: "ADD TO CART · AED 60" })
      .click();
    await page.goto("/cart");
    await shot("cart");
    await page.getByRole("link", { name: "CONTINUE TO FULFILLMENT" }).click();
    await shot("checkout");
    expect(errors).toEqual([]);
    expect(paymentCalls).toEqual([]);
  });
}

test("catalog remains server-authoritative when payment activation is offline", async ({
  page,
}) => {
  await page.route("**/api/checkout/config", async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    expect(config.products.length).toBeGreaterThan(190);
    await route.fulfill({
      json: { ...config, enabled: false, mode: "offline" },
    });
  });
  await page.goto("/menu");
  for (const entry of menuCategories) {
    await category(page, entry.name);
    await expect(
      page
        .locator(".b-menu-grid button")
        .filter({ hasText: "ADD TO CART" })
        .first(),
    ).toBeEnabled();
  }
  await page
    .locator(".b-menu-grid button")
    .filter({ hasText: "ADD TO CART" })
    .first()
    .click();
  await page.goto("/cart");
  await expect(
    page.getByRole("link", { name: "CONTINUE TO FULFILLMENT" }),
  ).toHaveAttribute("href", "/checkout");
});

const REMOVED = [
  "pan-de-muerto-traditional--ajonjoli-chocolate-covering",
  "pan-de-muerto-filled--crema-diplomatica-vainilla-chocolate-covering",
  "pan-de-muerto-filled--chocolate-chocolate-covering",
  "pan-de-muerto-filled--mascarpone-y-cajeta-chocolate-covering",
  "pan-de-muerto-filled--pistachio-chocolate-covering",
  "pan-de-muerto-filled--mascarpone-y-fresas-chocolate-covering",
];
test("removed Pan de Muerto combinations cannot be found, linked to, or paid for", async ({
  page,
  request,
}) => {
  const config = await (await request.get("/api/checkout/config")).json();
  const listed: string[] = config.products.map((p: { id: string }) => p.id);
  expect(
    listed.filter((id) => /(ajonjoli|filled).*chocolate-covering/.test(id)),
  ).toEqual([]);
  expect(listed).toContain("pan-de-muerto-filled-pistachio-individual");
  await page.goto("/menu?category=pan");
  await expect(page.locator(".b-menu-grid article")).toHaveCount(10);
  for (const slug of REMOVED) {
    await expect(page.locator(`[data-product-id="${slug}"]`)).toHaveCount(0);
    await page.goto(`/menu?product=${slug}`);
    await expect(
      page.getByRole("heading", { name: "Product not found" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /ADD TO CART/ })).toHaveCount(
      0,
    );
  }
  // A cart saved before the removal: the item is flagged and cannot be paid for.
  const stale = "pan-de-muerto-filled-pistachio-individual-chocolate-covering";
  await page.evaluate(
    (id) =>
      localStorage.setItem(
        "3l-cart",
        JSON.stringify([
          { productId: id, quantity: 2 },
          {
            productId: "pan-de-muerto-filled-pistachio-individual",
            quantity: 1,
          },
        ]),
      ),
    stale,
  );
  await page.goto("/cart");
  await expect(page.getByText("This item is no longer available.")).toHaveCount(
    1,
  );
  const quote = (productId: string) =>
    page.evaluate(async (id) => {
      const response = await fetch("/api/checkout/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fulfillmentMethod: "pickup",
          lines: [{ productId: id, quantity: 1 }],
        }),
      });
      return { status: response.status, body: await response.text() };
    }, productId);
  const refused = await quote(stale);
  expect(refused.status).toBe(422);
  expect(refused.body).toContain("Product unavailable");
  expect(
    (await quote("pan-de-muerto-filled-pistachio-individual")).status,
  ).toBe(200);
});
