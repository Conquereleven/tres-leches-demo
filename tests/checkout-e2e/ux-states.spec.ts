/**
 * Customer payment states, the paid confirmation and the operations orders
 * board, rendered from mocked API responses only. No order is created, no
 * provider is called and no payment is attempted.
 */
import { test, expect, type Page } from "@playwright/test";
import { clickStableControl } from "../helpers/stable-control";
import { status, workspace } from "../fixtures/ux-states";

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
    ).toHaveAttribute("href", /wa\.me\/971585943319/);
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
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/checkout/status", (r) =>
      r.fulfill({ status: 404, json: {} }),
    );
    await page.route("**/api/checkout/web", (r) =>
      r.fulfill({
        json: status({
          orderId: "TL-FIXTURE1",
          actionRequired: "complete_payment",
        }),
      }),
    );
    // Complete homepage config hydration before replacing the document. The
    // retained CI trace otherwise reports an aborted config fetch/access-control
    // page error during goto('/cart'), before this payment scenario even starts.
    const configReady = page.waitForResponse((response) =>
      response.url().endsWith("/api/checkout/config"),
    );
    await page.goto("/");
    const config = await configReady;
    expect(config.status()).toBe(200);
    expect(await config.finished()).toBeNull();
    await page.evaluate(() => {
      const date = new Date(Date.now() + 172_800_000)
        .toISOString()
        .slice(0, 10);
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
            slot: "4:00 PM – 9:00 PM",
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
    await page.getByRole("link", { name: "CONTINUE TO FULFILLMENT" }).click();
    await expect(page.locator(".b-co-fee")).toHaveCount(0);
    await expect(page.locator(".b-shop-totals")).not.toContainText("Delivery");
    await shot(page, "checkout-delivery-390");
    await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();
    // Traced WebKit failures leave Details unchanged if this click races scrolling.
    await clickStableControl(
      page.getByRole("button", { name: "REVIEW ORDER" }),
    );
    await expect(page.getByLabel(/I've reviewed my order/)).toBeVisible();
    await page.getByLabel(/I've reviewed my order/).check();
  });

  test("ready, then processing locks the pay button", async ({ page }) => {
    const pay = page.getByRole("button", { name: "PAY AED 50", exact: true });
    await expect(pay).toBeEnabled();
    await shot(page, "checkout-payment-ready-390");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await shot(page, "checkout-payment-ready-1440");
    await page.setViewportSize({ width: 390, height: 844 });
    // Hold the mocked web creation response; no provider request occurs.
    await page.route("**/api/checkout/web", () => {});
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
    await page.route("**/api/checkout/web", (r) =>
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

  test("a rejected checkout creation shows a recoverable failure", async ({
    page,
  }) => {
    await page.route("**/api/checkout/web", (r) =>
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

test.describe("operations orders list", () => {
  for (const width of [390, 768, 1440])
    test(`all orders at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.route("**/api/workspace", (r) =>
        r.fulfill({ json: workspace() }),
      );
      await page.goto("/operations/orders");
      const rows = page.locator(".oms-table tbody tr");
      // Every order is listed; the unpaid one is marked, not hidden.
      await expect(rows).toHaveCount(7);
      const unpaid = rows.filter({ hasText: "Hana Pending" });
      await expect(unpaid).toHaveAttribute("data-unpaid", "true");
      await expect(unpaid).toContainText("Not in the kitchen queue");
      await expect(
        rows
          .filter({ hasText: "Layla Fixture" })
          .locator('[data-kind="payment"]'),
      ).toHaveText("Paid");
      await page.getByRole("button", { name: /^Delivered/ }).click();
      await expect(rows).toHaveCount(1);
      await page.getByRole("button", { name: /^Awaiting payment/ }).click();
      await expect(rows).toHaveCount(1);
      await page.getByRole("button", { name: /^All/ }).click();
      await expect(rows).toHaveCount(7);
      expect(await noOverflow(page)).toBe(true);
      await shot(page, `operations-orders-${width}`);
      // Fulfilment actions are on the order page, for paid orders only.
      await rows.filter({ hasText: "Layla Fixture" }).locator("a").click();
      await expect(
        page.getByRole("button", { name: "Start preparation" }),
      ).toBeVisible();
      expect(await noOverflow(page)).toBe(true);
      // The kitchen queue still excludes the unpaid order.
      await page.goto("/operations/production");
      await expect(page.locator(".ops-order-card").first()).toBeVisible();
      await expect(page.locator(".ops-content")).not.toContainText(
        "Hana Pending",
      );
    });
});
