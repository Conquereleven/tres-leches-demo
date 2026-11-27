import { test, expect, type Page } from "@playwright/test";
import { gotoWithCart } from "../helpers/storefront";
import { fillName } from "../fixtures/storefront-form";

const pan = "pan-de-muerto-traditional-azucar-mini-40-g";
const unavailablePan = "pan-de-muerto-traditional-azucar-individual-70-g";
const cart = (quantity: number) => [{ productId: pan, quantity }];
const quantityField = (page: Page) =>
  page.locator(".v32-new-cart-row").getByRole("spinbutton");
const storedCart = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("3l-cart") ?? "[]"));

async function typeQuantity(page: Page, quantity: string) {
  const input = quantityField(page);
  await input.fill("");
  await expect(input).toHaveValue("");
  let typed = "";
  for (const digit of quantity) {
    typed += digit;
    await input.pressSequentially(digit);
    await expect(input).toHaveValue(typed);
  }
}

async function pickupQuote(page: Page, quantity: number) {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/checkout/quote") &&
      r.request().postDataJSON().lines[0].quantity === quantity,
  );
  await page.getByRole("radio", { name: "PICKUP", exact: true }).check();
  const result = await response;
  expect(result.status()).toBe(200);
  expect(await result.json()).toMatchObject({
    eligible: true,
    subtotalFils: 1300 * quantity,
    feeFils: 0,
    totalFils: 1300 * quantity,
  });
}

for (const width of [390, 1440]) {
  test(`direct quantity edits, refresh and authoritative checkout totals at ${width}px`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await gotoWithCart(page, "/cart", cart(7), '[data-new-ui="cart"]');
    const input = quantityField(page);
    await expect(input).toHaveValue("7");
    await expect(input).toHaveAttribute("aria-valuemin", "6");
    await expect(input).toHaveAttribute("aria-valuemax", "100");

    // Clearing and typing the first digit must never delete or reset the row.
    await input.fill("");
    await expect(input).toHaveValue("");
    expect(await storedCart(page)).toEqual(cart(7));
    let previous = 7;
    for (const quantity of [90, 99, 100]) {
      await typeQuantity(page, String(quantity));
      expect(await storedCart(page)).toEqual(cart(previous));
      await input.press("Enter");
      await expect(input).toHaveValue(String(quantity));
      expect(await storedCart(page)).toEqual(cart(quantity));
      await expect(page.locator(".v32-new-total")).toContainText(
        new RegExp((13 * quantity).toLocaleString("en-US").replace(",", ",?")),
      );
      previous = quantity;
    }
    await page.reload();
    await expect(input).toHaveValue("100");
    await page.screenshot({ path: info.outputPath("cart-100.png") });
    await page.getByRole("link", { name: "Checkout", exact: false }).click();
    await pickupQuote(page, 100);
    await expect(page.locator(".b-shop-grand")).toHaveText(/Total\s*AED 1300/);

    await page.goto("/cart");
    await expect(input).toHaveValue("100");
    await typeQuantity(page, "6");
    await input.press("Tab");
    await expect(input).toHaveValue("6");
    expect(await storedCart(page)).toEqual(cart(6));
    await page.reload();
    await expect(input).toHaveValue("6");
    expect(await storedCart(page)).toEqual(cart(6));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const [lang, whole, range] of [
  [
    "en",
    "Enter a whole number for the quantity.",
    "Enter a quantity between 6 and 100.",
  ],
  [
    "es",
    "Ingresa un número entero para la cantidad.",
    "Ingresa una cantidad entre 6 y 100.",
  ],
  ["ar", "أدخل عدداً صحيحاً للكمية.", "أدخل كمية بين 6 و100."],
] as const) {
  test(`invalid quantities are editable, explained and never persisted in ${lang}`, async ({
    page,
  }) => {
    await gotoWithCart(
      page,
      `/cart?lang=${lang}`,
      cart(7),
      '[data-new-ui="cart"]',
    );
    const input = quantityField(page);
    const status = page.locator(".v32-new-cart-controls").getByRole("alert");
    for (const [invalid, message] of [
      ["", whole],
      ["abc", whole],
      ["-1", whole],
      ["6.5", whole],
      ["0", range],
      ["5", range],
      ["101", range],
    ]) {
      await input.fill(invalid);
      await input.press("Tab");
      await expect(input).toHaveValue(invalid);
      await expect(input).toHaveAttribute("aria-invalid", "true");
      await expect(status).toHaveText(message);
      await expect(
        page.locator('[aria-disabled="true"].v32-new-action'),
      ).toHaveCount(1);
      expect(await storedCart(page)).toEqual(cart(7));
    }
    if (lang === "ar")
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await input.fill(lang === "ar" ? "٩٩" : "99");
    await input.press("Enter");
    await expect(input).toHaveValue("99");
    await expect(status).toHaveCount(0);
    expect(await storedCart(page)).toEqual(cart(99));
    await expect(
      page.locator('[aria-disabled="true"].v32-new-action'),
    ).toHaveCount(0);
  });
}

test("quote requests enforce capacity, published availability and numeric quantities", async ({
  request,
  baseURL,
}) => {
  const post = (quantity: unknown, productId = pan) =>
    request.post("/api/checkout/quote", {
      headers: { origin: baseURL! },
      data: { lines: [{ productId, quantity }], fulfillmentMethod: "pickup" },
    });
  for (const quantity of [0, -1, 6.5, "90", "", 101]) {
    expect((await post(quantity)).status()).toBe(400);
  }
  expect((await post(5)).status()).toBe(422);
  for (const quantity of [6, 90, 99, 100]) {
    const response = await post(quantity);
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      eligible: true,
      subtotalFils: quantity * 1300,
      totalFils: quantity * 1300,
    });
  }
  const unavailable = await post(90, unavailablePan);
  expect(unavailable.status()).toBe(200);
  expect(await unavailable.json()).toMatchObject({ eligible: false });
});

test("an older quote arriving after a cross-tab quantity edit never replaces the current total", async ({
  page,
  context,
}) => {
  await gotoWithCart(page, "/cart", cart(90));
  await expect(quantityField(page)).toHaveValue("90");
  const checkout = await context.newPage();
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const replied = Promise.withResolvers<void>();
  await checkout.route("**/api/checkout/quote", async (route) => {
    if (route.request().postDataJSON().lines[0].quantity !== 90) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    held.resolve();
    await release.promise;
    try {
      await route.fulfill({ response });
    } finally {
      replied.resolve();
    }
  });
  try {
    await checkout.goto("/checkout");
    await checkout.getByRole("radio", { name: "PICKUP", exact: true }).check();
    await held.promise;
    await expect(checkout.locator(".b-shop-grand")).toHaveCount(0);
    const newest = checkout.waitForResponse(
      (r) =>
        r.url().endsWith("/api/checkout/quote") &&
        r.request().postDataJSON().lines[0].quantity === 100,
    );
    await typeQuantity(page, "100");
    await quantityField(page).press("Enter");
    await newest;
    await expect(checkout.locator(".b-shop-grand")).toHaveText(
      /Total\s*AED 1300/,
    );

    const older = checkout.waitForResponse(
      (r) =>
        r.url().endsWith("/api/checkout/quote") &&
        r.request().postDataJSON().lines[0].quantity === 90,
    );
    release.resolve();
    await replied.promise;
    expect(await (await older).json()).toMatchObject({ totalFils: 117_000 });
    await checkout.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expect(checkout.locator(".b-shop-grand")).toHaveText(
      /Total\s*AED 1300/,
    );
    expect(await storedCart(page)).toEqual(cart(100));
  } finally {
    release.resolve();
  }
});

test("checkout requires a fresh review when a cart edit changes the amount to pay", async ({
  page,
  context,
}) => {
  await gotoWithCart(page, "/cart", cart(90));
  await expect(quantityField(page)).toHaveValue("90");
  const checkout = await context.newPage();
  await checkout.goto("/checkout");
  await pickupQuote(checkout, 90);
  const date = checkout.getByLabel("Pickup date");
  await date.fill((await date.getAttribute("min"))!);
  await checkout
    .getByRole("combobox", { name: "Pickup time", exact: true })
    .selectOption("4:00 PM – 9:00 PM");
  await checkout.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();
  await fillName(checkout, "Quantity", "Fixture");
  await checkout
    .getByLabel("Email for payment receipt")
    .fill("quantity@example.invalid");
  await checkout.getByLabel("Mobile number").fill("0500000000");
  await checkout
    .getByLabel("Street address", { exact: true })
    .fill("Synthetic fixture street");
  await checkout.getByLabel("City", { exact: true }).fill("Dubai");
  await checkout.getByRole("button", { name: "REVIEW ORDER" }).click();
  const review = checkout.getByLabel(/I've reviewed my order/);
  await review.check();
  await expect(
    checkout.getByRole("button", { name: "PAY AED 1170" }),
  ).toBeEnabled();

  await typeQuantity(page, "100");
  await quantityField(page).press("Enter");
  const next = checkout.getByRole("button", { name: "PAY AED 1300" });
  await expect(next).toBeDisabled();
  await expect(review).not.toBeChecked();
  await review.check();
  await expect(next).toBeEnabled();
});
