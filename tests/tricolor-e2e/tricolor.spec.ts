import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import type { CartLine } from "../../src/brand/cart";
import { tricolorCopy } from "../../shared/tricolor";
const shots = "docs/tricolor/screenshots";
mkdirSync(shots, { recursive: true });

const fixedPacks = [
  { productId: "conchas-tricolor-pack-3-mini", priceFils: 3300 },
  { productId: "conchas-tricolor-pack-3-individuales", priceFils: 3900 },
] as const;
const readCart = (page: Page): Promise<CartLine[]> =>
  page.evaluate(() => JSON.parse(localStorage.getItem("3l-cart") ?? "[]"));
async function addAndVerify(page: Page, expected: CartLine[], info: TestInfo) {
  const before = await readCart(page);
  await expect(page.locator(".b-add-to-cart > button")).toBeEnabled();
  await page.locator(".b-add-to-cart > button").click();
  // A dispatched click alone does not establish the accepted cart state.
  await expect.poll(() => readCart(page)).toEqual(expected);
  await info.attach(`cart-add-${expected.length}.json`, {
    body: JSON.stringify({ before, after: await readCart(page) }),
    contentType: "application/json",
  });
}
async function addFixedPacks(
  page: Page,
  lang: keyof typeof tricolorCopy,
  expected: CartLine[],
  info: TestInfo,
  width: number,
) {
  const packSizes = page.locator(".b-menu-selectors select").first();
  // evaluateAll() does not wait: while the published catalog is loading it
  // returns [], silently skipping the entire old pack-addition loop.
  await expect(packSizes.locator("option")).toHaveCount(2);
  const sizes = await packSizes
    .locator("option")
    .evaluateAll((options) =>
      options.map((o) => (o as HTMLOptionElement).value),
    );
  expect(sizes.filter((size) => /mini/i.test(size))).toHaveLength(1);
  const config = await (await page.request.get("/api/checkout/config")).json();
  for (const [productId, priceFils] of [
    ["conchas-traditional-tricolor-mini-40-g", 1100],
    ["conchas-traditional-tricolor-individual-70-g", 1300],
  ] as const) {
    expect(
      config.products.find((p: { id: string }) => p.id === productId)
        ?.priceFils,
    ).toBe(priceFils);
  }
  for (const [i, pack] of fixedPacks.entries()) {
    expect(
      config.products.find((p: { id: string }) => p.id === pack.productId)
        ?.priceFils,
    ).toBe(pack.priceFils);
    const size = sizes.find((size) => /mini/i.test(size) === (i === 0))!;
    await packSizes.selectOption(size);
    await expect(packSizes).toHaveValue(size);
    await expect(page.locator(".b-menu-price")).toContainText(
      i === 0 ? /33|٣٣/ : /39|٣٩/,
    );
    await expect(page.locator(".b-pack-composition")).toContainText(
      tricolorCopy[lang].pack,
    );
    await page.screenshot({
      path: `${shots}/${info.project.name}-${width}-${lang}-pack-${i}.png`,
      fullPage: true,
    });
    expected.push({ productId: pack.productId, quantity: 1 });
    await addAndVerify(page, expected, info);
  }
}

for (const width of [390, 768, 1440])
  for (const lang of ["en", "es", "ar"] as const)
    test(`Tricolor ${width} ${lang}: singles, colors, fixed packs, cart persistence and checkout`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const copy = tricolorCopy[lang];
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const expected: CartLine[] = [];
      await page.goto(
        `/menu?product=conchas-traditional--tricolor&lang=${lang}`,
      );
      await expect(page.locator(".b-add-to-cart > button")).toBeDisabled();
      const sizes = page.locator(".b-menu-selectors select").first();
      await expect(sizes.locator("option")).toHaveCount(2);
      const ids = await sizes
        .locator("option")
        .evaluateAll((options) =>
          options.map((o) => (o as HTMLOptionElement).value),
        );
      for (const [i, sku] of ids.entries()) {
        await sizes.selectOption(sku);
        await expect(page.locator(".b-menu-price")).toContainText(
          /mini/i.test(sku) ? /11|١١/ : /13|١٣/,
        );
        const color = page.getByRole("combobox", {
          name: copy.color,
          exact: true,
        });
        await color.selectOption(i === 0 ? "red" : "white");
        await expect(page.locator(".b-add-to-cart > button")).toBeEnabled();
        await page.screenshot({
          path: `${shots}/${info.project.name}-${width}-${lang}-single-${i}.png`,
          fullPage: true,
        });
        expected.push({
          productId: /mini/i.test(sku)
            ? "conchas-traditional-tricolor-mini-40-g"
            : "conchas-traditional-tricolor-individual-70-g",
          quantity: 1,
          color: i === 0 ? "red" : "white",
        });
        await addAndVerify(page, expected, info);
      }
      await sizes.selectOption(ids[0]!);
      await page
        .getByRole("combobox", { name: copy.color, exact: true })
        .selectOption("green");
      expected.push({
        productId: /mini/i.test(ids[0]!)
          ? "conchas-traditional-tricolor-mini-40-g"
          : "conchas-traditional-tricolor-individual-70-g",
        quantity: 1,
        color: "green",
      });
      await addAndVerify(page, expected, info);
      await page.goto(`/menu?product=conchas-tricolor-pack&lang=${lang}`);
      await expect(
        page.getByRole("combobox", { name: copy.color, exact: true }),
      ).toHaveCount(0);
      await addFixedPacks(page, lang, expected, info, width);
      await page.goto(`/cart?lang=${lang}`);
      await expect(page.locator(".b-co-item")).toHaveCount(5);
      expect(await readCart(page)).toEqual(expected);
      const cartColor = page
        .getByRole("combobox", { name: copy.color, exact: true })
        .first();
      await cartColor.selectOption("white");
      await page.reload();
      await expect(cartColor).toHaveValue("white");
      await cartColor.selectOption("red");
      await page.reload();
      await expect(cartColor).toHaveValue("red");
      await expect(page.locator(".b-co-item")).toHaveCount(5);
      await expect(
        page.getByRole("combobox", { name: copy.color, exact: true }),
      ).toHaveCount(3);
      await page.screenshot({
        path: `${shots}/${info.project.name}-${width}-${lang}-cart.png`,
        fullPage: true,
      });
      await page.goto(`/checkout?lang=${lang}`);
      await expect(
        page.locator(".b-co-summary-items .b-pack-composition"),
      ).toHaveCount(5);
      await page.screenshot({
        path: `${shots}/${info.project.name}-${width}-${lang}-checkout.png`,
        fullPage: true,
      });
      expect(errors).toEqual([]);
    });
test("fixed packs wait for delayed published catalog and survive navigation", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let release!: () => void;
  let requested!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route("**/api/storefront/catalog", async (route) => {
    requested();
    await held;
    await route.continue();
  });
  await page.goto("/menu?product=conchas-tricolor-pack&lang=en");
  await started;
  const expected: CartLine[] = [];
  try {
    // Reproduces the empty immediate read which used to skip both packs.
    expect(await page.locator(".b-menu-selectors select option").count()).toBe(
      0,
    );
    const adding = addFixedPacks(page, "en", expected, info, 1280);
    release();
    await adding;
  } finally {
    release();
  }
  await page.goto("/cart?lang=en");
  await expect(page.locator(".b-co-item")).toHaveCount(2);
  expect(await readCart(page)).toEqual(expected);
  await page.reload();
  await expect(page.locator(".b-co-item")).toHaveCount(2);
  expect(await readCart(page)).toEqual(expected);
  expect(errors).toEqual([]);
});
for (const width of [390, 1440])
  test(`kitchen email ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.setContent(
      readFileSync("docs/tricolor/fictional-kitchen.html", "utf8"),
    );
    await expect(page.getByText(/^INSIDE (THIS|EACH) BOX:$/)).toHaveCount(2);
    await expect(page.getByText(/TOTAL: 6 pieces/)).toBeVisible();
    await page.screenshot({
      path: `${shots}/${info.project.name}-${width}-email.png`,
      fullPage: true,
    });
  });
test("paid synthetic order: confirmation and OMS retain color and physical-piece totals", async ({
  page,
  request,
}, info) => {
  const headers = {
    Origin: "http://127.0.0.1:3272",
    "Idempotency-Key": crypto.randomUUID(),
  };
  const lines = [
    {
      productId: "conchas-traditional-tricolor-mini-40-g",
      quantity: 2,
      color: "green",
    },
    { productId: "conchas-tricolor-pack-3-individuales", quantity: 2 },
  ];
  const config = await (await request.get("/api/checkout/config")).json();
  const quote = await (
    await request.post("/api/checkout/quote", {
      headers,
      data: { lines, fulfillmentMethod: "pickup" },
    })
  ).json();
  expect(quote.totalFils).toBe(10000);
  const response = await request.post("/api/checkout/web", {
    headers: { ...headers, "X-Checkout-Quote-Revision": quote.quoteRevision },
    data: {
      lines,
      fulfillmentMethod: "pickup",
      pickup: {
        pickupDate: config.dates.min,
        preferredTime: "4:00 PM – 9:00 PM",
      },
      customer: {
        firstName: "Fictional",
        lastName: "Tricolor QA",
        phone: "0500000000",
        email: "qa@example.invalid",
      },
      billing: {
        sameAsDelivery: false,
        name: "Fictional QA",
        address1: "Fixture street",
        city: "Dubai",
        country: "AE",
      },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  const order = await response.json();
  await request.post("/__fixture/paid");
  const reconciled = await request.post("/api/checkout/reconcile", {
    headers,
    data: { key: headers["Idempotency-Key"] },
  });
  expect((await reconciled.json()).paymentStatus).toBe("paid");
  await page.goto("/cart");
  await page.evaluate(
    (key) => sessionStorage.setItem("3l-checkout", JSON.stringify({ key })),
    headers["Idempotency-Key"],
  );
  await page.goto("/checkout/return");
  await expect(
    page.locator(".b-co-summary-items .b-pack-composition"),
  ).toHaveCount(2);
  await expect(
    page.getByText(/Total physical pieces: 6/).first(),
  ).toBeVisible();
  await page.screenshot({
    path: `${shots}/${info.project.name}-confirmation.png`,
    fullPage: true,
  });
  const login = await request.post("/api/login", {
    headers,
    data: { id: "admin", password: "pack-fixture-password" },
  });
  expect(login.status()).toBe(200);
  const cookie = login
    .headers()
    ["set-cookie"]!.split(";")[0]!
    .slice("tl_session=".length);
  await page.context().addCookies([
    {
      name: "tl_session",
      value: cookie,
      url: "http://127.0.0.1:3272",
      httpOnly: true,
      secure: false,
      sameSite: "Strict",
    },
  ]);
  await page.goto(`/operations/orders/${order.orderId}`);
  await expect(
    page.getByText(/Total physical pieces: 6/).first(),
  ).toBeVisible();
  await expect(page.getByText(/Green · Mini · 40 g/).first()).toBeVisible();
  await page.screenshot({
    path: `${shots}/${info.project.name}-oms.png`,
    fullPage: true,
  });
  await page.goto("/operations/print");
  await page
    .getByRole("combobox", { name: "Order", exact: true })
    .selectOption(order.orderId);
  await expect(
    page.getByText(/Total physical pieces: 6/).first(),
  ).toBeVisible();
  await page.screenshot({
    path: `${shots}/${info.project.name}-ticket.png`,
    fullPage: true,
  });
});
