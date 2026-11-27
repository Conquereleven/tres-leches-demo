import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import type { CartLine } from "../../src/brand/cart";
import { tricolorCopy } from "../../shared/tricolor";
const shots = "docs/tricolor/screenshots";
mkdirSync(shots, { recursive: true });

/**
 * V3.2 Tricolor contract.
 *
 * The approved V3.2 customer front owns Home/Menu/Bakery/Contact/Cart while
 * the canonical Shop checkout intentionally retains `.b-shop` with valid
 * order/payment continuity. The legacy `/menu?product=…` selectors
 * (`.b-add-to-cart > button`, `.b-menu-selectors select`, `.b-menu-price`,
 * `.b-pack-composition`, `.b-co-item`) are therefore not
 * mounted on the customer path anymore; asserting them tested a UI that no
 * longer ships. This spec exercises the mounted V3.2 instead:
 *
 * - catalog: `/bakery?category=conchas&lang=…` cards
 *   `.ref32-product[data-product-id]`
 * - purchase: portal dialog `.ref32-dialog` with `[data-selected-sku]`,
 *   SKU buttons `button[data-sku]`, CTA `.ref32-buy` and — for single-piece
 *   tricolor only — a labelled color select under `.ref32-extra`
 * - cart: `/cart` rows `.v32-new-cart-row` with a localized color editor on
 *   individual pieces
 * - review: canonical `/checkout` Shop summary
 *   `.b-co-summary-items .b-pack-composition` plus a server quote
 *
 * No catalog, pricing, availability or payment rule changes: every price is
 * re-asserted against `/api/checkout/config` (server authority) and the
 * fixture catalog stays disposable.
 */
const SINGLE_MINI = "conchas-traditional-tricolor-mini-40-g" as const;
const SINGLE_IND = "conchas-traditional-tricolor-individual-70-g" as const;
const PACK_MINI = "conchas-tricolor-pack-3-mini" as const;
const PACK_IND = "conchas-tricolor-pack-3-individuales" as const;
const SINGLES_CARD = "conchas-traditional--tricolor" as const;
const PACKS_CARD = "conchas-tricolor-pack" as const;
const readCart = (page: Page): Promise<CartLine[]> =>
  page.evaluate(() => JSON.parse(localStorage.getItem("3l-cart") ?? "[]"));

async function expectServerPrices(page: Page) {
  const config = await (await page.request.get("/api/checkout/config")).json();
  const priceOf = (id: string) =>
    config.products.find((p: { id: string; priceFils: number }) => p.id === id)
      ?.priceFils;
  expect(priceOf(SINGLE_MINI)).toBe(1100);
  expect(priceOf(SINGLE_IND)).toBe(1300);
  expect(priceOf(PACK_MINI)).toBe(3300);
  expect(priceOf(PACK_IND)).toBe(3900);
}

async function openDialog(page: Page, cardProductId: string) {
  await page
    .locator(`.ref32-product[data-product-id="${cardProductId}"]`)
    .first()
    .click();
  const dialog = page.locator(".ref32-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function chooseSku(
  dialog: ReturnType<Page["locator"]>,
  sku: string,
) {
  await dialog.locator(`button[data-sku="${sku}"]`).click();
  await expect(dialog).toHaveAttribute("data-selected-sku", sku);
}

async function buyAndVerify(
  page: Page,
  dialog: ReturnType<Page["locator"]>,
  expected: CartLine[],
  info: TestInfo,
) {
  const before = await readCart(page);
  const buy = dialog.locator(".ref32-buy");
  await expect(buy).toBeEnabled();
  await buy.scrollIntoViewIfNeeded();
  await buy.click();
  // A dispatched click alone does not establish the accepted cart state.
  await expect.poll(() => readCart(page)).toEqual(expected);
  await expect(page.locator(".ref32-dialog")).toHaveCount(0);
  await info.attach(`cart-add-${expected.length}.json`, {
    body: JSON.stringify({ before, after: await readCart(page) }),
    contentType: "application/json",
  });
}

for (const width of [390, 768, 1440])
  for (const lang of ["en", "es", "ar"] as const)
    test(`Tricolor ${width} ${lang}: singles, colors, fixed packs, cart persistence and checkout`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const expected: CartLine[] = [];
      // Server is the price authority; the dialog must echo it, never invent it.
      await expectServerPrices(page);
      await page.goto(`/bakery?category=conchas&lang=${lang}`);
      await expect(
        page.locator(
          `.ref32-product[data-product-id="${SINGLES_CARD}"]`,
        ),
      ).toBeVisible();
      await expect(
        page.locator(`.ref32-product[data-product-id="${PACKS_CARD}"]`),
      ).toBeVisible();

      // Two single SKUs (Mini 40 g AED 11, Individual 70 g AED 13): the CTA
      // stays disabled until a color is chosen, for each SKU in turn.
      const singles = [
        { sku: SINGLE_MINI, color: "red", price: lang === "ar" ? /١١/ : /11/ },
        { sku: SINGLE_IND, color: "white", price: lang === "ar" ? /١٣/ : /13/ },
      ] as const;
      for (const [i, single] of singles.entries()) {
        const dialog = await openDialog(page, SINGLES_CARD);
        await chooseSku(dialog, single.sku);
        await expect(dialog.locator(".ref32-buy")).toBeDisabled();
        await expect(dialog.locator(".ref32-price strong")).toContainText(
          single.price,
        );
        await dialog
          .locator(".ref32-extra select")
          .selectOption(single.color);
        await expect(dialog.locator(".ref32-buy")).toBeEnabled();
        await page.screenshot({
          path: `${shots}/${info.project.name}-${width}-${lang}-single-${i}.png`,
          fullPage: true,
        });
        expected.push({
          productId: single.sku,
          quantity: 1,
          color: single.color,
        });
        await buyAndVerify(page, dialog, expected, info);
      }

      // Third exact color on the Mini SKU; reopening resets the color, so the
      // negative holds again before the green selection.
      {
        const dialog = await openDialog(page, SINGLES_CARD);
        await chooseSku(dialog, SINGLE_MINI);
        await expect(dialog.locator(".ref32-buy")).toBeDisabled();
        await dialog.locator(".ref32-extra select").selectOption("green");
        await expect(dialog.locator(".ref32-buy")).toBeEnabled();
        expected.push({
          productId: SINGLE_MINI,
          quantity: 1,
          color: "green",
        });
        await buyAndVerify(page, dialog, expected, info);
      }

      // Fixed 3-piece packs (AED 33/39): no editable color by design.
      const packs = [
        { sku: PACK_MINI, price: lang === "ar" ? /٣٣/ : /33/ },
        { sku: PACK_IND, price: lang === "ar" ? /٣٩/ : /39/ },
      ] as const;
      for (const [i, pack] of packs.entries()) {
        const dialog = await openDialog(page, PACKS_CARD);
        await expect(dialog.locator(".ref32-extra")).toHaveCount(0);
        await chooseSku(dialog, pack.sku);
        await expect(dialog.locator(".ref32-price strong")).toContainText(
          pack.price,
        );
        await page.screenshot({
          path: `${shots}/${info.project.name}-${width}-${lang}-pack-${i}.png`,
          fullPage: true,
        });
        expected.push({ productId: pack.sku, quantity: 1 });
        await buyAndVerify(page, dialog, expected, info);
      }

      // V3.2 cart: five rows with the exact identities above.
      await page.goto(`/cart?lang=${lang}`);
      const rows = page.locator(".v32-new-cart-row");
      const colors = rows.locator(".v32-new-tricolor select");
      await expect(rows).toHaveCount(5);
      expect(await readCart(page)).toEqual(expected);
      await expect(colors).toHaveCount(3);
      for (const [index, color] of (["red", "white", "green"] as const).entries()) {
        const editor = rows.nth(index).locator(".v32-new-tricolor select");
        await expect(editor).toHaveValue(color);
        await expect(
          editor.locator("option:checked"),
        ).toHaveText(tricolorCopy[lang][color]);
      }
      await expect(rows.nth(3).locator("select")).toHaveCount(0);
      await expect(rows.nth(4).locator("select")).toHaveCount(0);
      await page.screenshot({
        path: `${shots}/${info.project.name}-${width}-${lang}-cart.png`,
        fullPage: true,
      });

      // Quantity via the real V3.2 number controls, persisted across reload.
      const quantities = rows.getByRole("spinbutton");
      await expect(quantities).toHaveCount(5);
      await quantities.first().fill("2");
      await quantities.first().blur();
      expected[0]!.quantity = 2;
      await expect.poll(() => readCart(page)).toEqual(expected);
      await page.reload();
      await expect(page.locator(".v32-new-cart-row")).toHaveCount(5);
      expect(await readCart(page)).toEqual(expected);
      await quantities.first().fill("1");
      await quantities.first().blur();
      expected[0]!.quantity = 1;
      await expect.poll(() => readCart(page)).toEqual(expected);
      await page.reload();
      expect(await readCart(page)).toEqual(expected);

      // Editing Mini to white keeps it distinct from the white Individual.
      const edited: CartLine[] = expected.map((line, i) =>
        i === 0 ? { ...line, color: "white" as const } : line,
      );
      await colors.first().selectOption("white");
      await expect.poll(() => readCart(page)).toEqual(edited);
      await page.reload();
      await expect(rows).toHaveCount(5);
      await expect(colors.first()).toHaveValue("white");
      expect(await readCart(page)).toEqual(edited);
      await colors.first().selectOption("red");
      await expect.poll(() => readCart(page)).toEqual(expected);
      await page.reload();
      await expect(colors.first()).toHaveValue("red");
      expect(await readCart(page)).toEqual(expected);

      // Server quote for the exact five lines, then the real Shop review.
      const quote = await (
        await page.request.post("/api/checkout/quote", {
          headers: {
            Origin: "http://127.0.0.1:3272",
            "Idempotency-Key": crypto.randomUUID(),
          },
          data: { lines: expected, fulfillmentMethod: "pickup" },
        })
      ).json();
      expect(quote.totalFils).toBe(1100 + 1300 + 1100 + 3300 + 3900);
      await page.goto(`/checkout?lang=${lang}`);
      const compositions = page.locator(
        ".b-co-summary-items .b-pack-composition",
      );
      await expect(compositions).toHaveCount(5);
      const texts = await compositions.allTextContents();
      // Accurate physical piece totals per line: 3 singles × 1, 2 packs × 3.
      expect(texts.filter((text) => /:\s*1\s*$/.test(text))).toHaveLength(3);
      expect(texts.filter((text) => /:\s*3\s*$/.test(text))).toHaveLength(2);
      await page.screenshot({
        path: `${shots}/${info.project.name}-${width}-${lang}-checkout.png`,
        fullPage: true,
      });
      expect(errors).toEqual([]);
    });
test("active scroll retains three chosen colours and both fixed packs through navigation", async ({
  page,
}, info) => {
  const lang = "ar" as const;
  await page.setViewportSize({ width: 768, height: 900 });
  await expectServerPrices(page);
  await page.goto(`/bakery?category=conchas&lang=${lang}`);
  const expected: CartLine[] = [];
  for (const [i, color] of (["red", "white", "green"] as const).entries()) {
    const sku = i % 2 === 0 ? SINGLE_MINI : SINGLE_IND;
    const dialog = await openDialog(page, SINGLES_CARD);
    await chooseSku(dialog, sku);
    await dialog.locator(".ref32-extra select").selectOption(color);
    expected.push({ productId: sku, quantity: 1, color });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await buyAndVerify(page, dialog, expected, info);
  }
  for (const sku of [PACK_MINI, PACK_IND] as const) {
    const dialog = await openDialog(page, PACKS_CARD);
    await expect(dialog.locator(".ref32-extra")).toHaveCount(0);
    await chooseSku(dialog, sku);
    expected.push({ productId: sku, quantity: 1 });
    await buyAndVerify(page, dialog, expected, info);
  }
  await page.goto(`/cart?lang=${lang}`);
  await expect(page.locator(".v32-new-cart-row")).toHaveCount(5);
  expect(await readCart(page)).toEqual(expected);
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
  await page.goto("/bakery?category=conchas&lang=en");
  await started;
  const expected: CartLine[] = [];
  try {
    // While the published catalog is held, V3.2 mounts no product cards:
    // the previous empty-select read that silently skipped packs is now an
    // explicit zero-card assertion on the mounted UI.
    expect(await page.locator(".ref32-product").count()).toBe(0);
    const adding = (async () => {
      const dialog = await openDialog(page, PACKS_CARD);
      await chooseSku(dialog, PACK_MINI);
      expected.push({ productId: PACK_MINI, quantity: 1 });
      await buyAndVerify(page, dialog, expected, info);
      const second = await openDialog(page, PACKS_CARD);
      await chooseSku(second, PACK_IND);
      expected.push({ productId: PACK_IND, quantity: 1 });
      await buyAndVerify(page, second, expected, info);
    })();
    release();
    await adding;
  } finally {
    release();
  }
  await page.goto("/cart?lang=en");
  await expect(page.locator(".v32-new-cart-row")).toHaveCount(2);
  expect(await readCart(page)).toEqual(expected);
  await page.reload();
  await expect(page.locator(".v32-new-cart-row")).toHaveCount(2);
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
