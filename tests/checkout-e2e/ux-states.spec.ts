/**
 * Customer payment states, the paid confirmation and the operations orders
 * board, rendered from mocked API responses only. No order is created, no
 * provider is called and no payment is attempted.
 */
import { test, expect, type Page } from "@playwright/test";
import { FRAMES_STUB, status, workspace } from "../fixtures/ux-states";

const SHOTS = "work/qa/ux";
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

async function mockReturn(page: Page, body: Record<string, unknown>) {
  await page.route("**/api/checkout/reconcile", (r) =>
    r.fulfill({ json: body }),
  );
  await page.goto("/");
  await page.evaluate(() =>
    sessionStorage.setItem(
      "3l-checkout",
      JSON.stringify({ key: "00000000-0000-4000-8000-000000000000" }),
    ),
  );
  await page.goto("/checkout/return");
}

test.describe("customer payment states", () => {
  test("paid confirmation only from an authoritative PAID + Confirmed record", async ({
    page,
  }) => {
    await mockReturn(
      page,
      status({ status: "Confirmed", paymentStatus: "paid" }),
    );
    await expect(
      page.getByRole("heading", { name: "Thank you, Layla" }),
    ).toBeVisible();
    const main = page.locator("main");
    await expect(main).toContainText("Your order is confirmed");
    await expect(main).toContainText("TL-FIXTURE1");
    await expect(main).toContainText("AED 50");
    for (const section of ["Order", "Delivery", "Payment", "What happens next"])
      await expect(
        page.getByRole("heading", { name: section, exact: true }),
      ).toBeVisible();
    await expect(main).toContainText("JLT Cluster C");
    await expect(main).toContainText("Afternoon, after 4 pm");
    await expect(
      page.getByRole("link", { name: /Contact Pastelerías 3L/ }),
    ).toHaveAttribute("href", /wa\.me\/971521683319/);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, "paid-confirmation-390");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await shot(page, "paid-confirmation-1440");
  });

  test("paid payment on an order not yet confirmed is still processing", async ({
    page,
  }) => {
    await mockReturn(page, status({ status: "Paid", paymentStatus: "paid" }));
    await expect(
      page.getByRole("heading", { name: "Confirming your payment…" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /Thank you/ })).toHaveCount(
      0,
    );
    await shot(page, "processing-return-390");
  });

  test("held for review never invites a second payment", async ({ page }) => {
    await mockReturn(page, status({ actionRequired: "review_payment" }));
    await expect(
      page.getByRole("heading", { name: "We're confirming your payment" }),
    ).toBeVisible();
    await expect(page.locator("main")).toContainText(
      "Your order is saved while we verify the payment. Please don't pay again.",
    );
    await expect(page.getByRole("link", { name: "TRY AGAIN" })).toHaveCount(0);
    await shot(page, "held-for-review-390");
  });

  for (const [paymentStatus, name] of [
    ["failed", "declined"],
    ["expired", "failed"],
  ] as const)
    test(`confirmed ${name} payment`, async ({ page }) => {
      await mockReturn(page, status({ paymentStatus }));
      await expect(
        page.getByRole("heading", { name: "Payment wasn't completed" }),
      ).toBeVisible();
      await expect(page.locator("main")).toContainText(
        "Your card has not been confirmed as charged.",
      );
      await expect(page.getByRole("link", { name: "TRY AGAIN" })).toBeVisible();
      await shot(page, `${name}-390`);
    });

  test("3-D Secure step keeps the customer on the bank's page", async ({
    page,
  }) => {
    await mockReturn(page, status({ url: "https://bank.fixture.invalid/3ds" }));
    await expect(
      page.getByRole("heading", { name: "Verify with your bank" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "CONTINUE PAYMENT" }),
    ).toHaveAttribute("href", "https://bank.fixture.invalid/3ds");
    await shot(page, "3ds-redirect-390");
  });
});

test.describe("payment step", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.route("https://pay.paymennt.com/**", (r) =>
      r.fulfill({ body: FRAMES_STUB, contentType: "application/javascript" }),
    );
    await page.route("**/api/checkout/status", (r) =>
      r.fulfill({ status: 404, json: {} }),
    );
    await page.route("**/api/checkout/prepare", (r) =>
      r.fulfill({
        json: status({
          orderId: "TL-FIXTURE1",
          actionRequired: "complete_payment",
        }),
      }),
    );
    await page.goto("/");
    await page.evaluate(() => {
      const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      localStorage.setItem(
        "3l-cart",
        JSON.stringify([{ productId: "pan-de-muerto", quantity: 2 }]),
      );
      sessionStorage.setItem(
        "3l-checkout-draft",
        JSON.stringify({
          delivery: {
            zoneId: "jlt-cluster-c",
            address: "Jumeirah Lakes Towers, Cluster C",
            building: "Fixture Tower",
            date,
            slot: "Afternoon",
          },
          customer: {
            name: "Layla Fixture",
            phone: "050 000 0000",
            email: "layla@example.com",
          },
          billing: { sameAsDelivery: true },
        }),
      );
    });
    await page.goto("/cart");
    await shot(page, "cart-390");
    await page.getByRole("link", { name: "CONTINUE TO DELIVERY" }).click();
    await expect(page.locator(".b-co-fee")).toContainText("Free");
    await shot(page, "checkout-delivery-390");
    await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();
    await page.getByRole("button", { name: "REVIEW ORDER" }).click();
    await page.getByLabel(/I've reviewed my order/).check();
  });

  test("ready, then processing locks the pay button", async ({ page }) => {
    const pay = page.getByRole("button", { name: "PAY AED 50", exact: true });
    await expect(pay).toBeEnabled();
    await shot(page, "checkout-payment-ready-390");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await shot(page, "checkout-payment-ready-1440");
    await page.setViewportSize({ width: 390, height: 844 });
    // The stub never tokenises here, so the payment stays in flight.
    await pay.click();
    const locked = page.getByRole("button", { name: /PROCESSING/ });
    await expect(locked).toBeDisabled();
    await expect(page.getByText("Processing your payment…")).toBeVisible();
    await expect(page.getByLabel(/I've reviewed my order/)).toBeDisabled();
    await shot(page, "checkout-processing-390");
  });

  test("an unverifiable result is held and the pay button disappears", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __tokenize: boolean }).__tokenize = true;
    });
    await page.evaluate(() => {
      (window as unknown as { __tokenize: boolean }).__tokenize = true;
    });
    await page.route("**/api/checkout/token", (r) =>
      r.fulfill({
        status: 503,
        json: {
          error:
            "The payment result could not be verified. Your order is held for review.",
        },
      }),
    );
    await page.getByRole("button", { name: "PAY AED 50", exact: true }).click();
    await expect(page.getByText("We're confirming your payment")).toBeVisible();
    await expect(page.getByRole("button", { name: /^PAY / })).toHaveCount(0);
    await shot(page, "checkout-held-390");
  });

  test("a declined card shows the failure state and allows a new attempt", async ({
    page,
  }) => {
    await page.evaluate(() => {
      (window as unknown as { __tokenize: boolean }).__tokenize = true;
    });
    await page.route("**/api/checkout/token", (r) =>
      r.fulfill({
        status: 422,
        json: {
          error:
            "Payment could not be processed. Please check your details or try again.",
        },
      }),
    );
    await page.getByRole("button", { name: "PAY AED 50", exact: true }).click();
    await expect(page.getByText("Payment wasn't completed")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "PAY AED 50", exact: true }),
    ).toBeVisible();
    await shot(page, "checkout-declined-390");
  });
});

test.describe("operations orders board", () => {
  for (const width of [390, 768, 1440])
    test(`paid queue at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.route("**/api/workspace", (r) =>
        r.fulfill({ json: workspace() }),
      );
      await page.goto("/operations/orders");
      const board = page.locator(".ops-orders");
      await expect(board.getByText("Pedidos de hoy")).toBeVisible();
      // Today: every paid, due-today order; never the unpaid one.
      const cards = board.locator(".ops-order-list").first().locator("article");
      await expect(cards).toHaveCount(5);
      await expect(board.locator(".ops-order-list").first()).not.toContainText(
        "Hana Pending",
      );
      await expect(board.locator(".ops-pay-paid").first()).toHaveText("Pagado");
      await expect(
        page.getByRole("button", { name: "Empezar preparación" }),
      ).toBeVisible();
      await expect(board.locator(".ops-unpaid > summary")).toContainText(
        "Sin pago confirmado · 1",
      );
      await page.getByRole("button", { name: /^Próximos/ }).click();
      await expect(
        board.locator(".ops-order-list").first().locator("article"),
      ).toHaveCount(1);
      await page.getByRole("button", { name: /^Todos los pedidos/ }).click();
      await page.getByRole("button", { name: /^Completados/ }).click();
      await expect(
        board.locator(".ops-order-list").first().locator("article"),
      ).toHaveCount(1);
      await page.getByRole("button", { name: /^Hoy/ }).click();
      await page.getByRole("button", { name: /^Todos ·/ }).click();
      expect(await noOverflow(page)).toBe(true);
      await shot(page, `operations-orders-${width}`);
    });
});
