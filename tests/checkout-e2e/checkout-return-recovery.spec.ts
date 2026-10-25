import { test, expect } from "@playwright/test";
import { status, workspace } from "../fixtures/ux-states";
import AxeBuilder from "@axe-core/playwright";
const KEY = "00000000-0000-4000-8000-000000000000";
for (const stored of [null, "{bad", JSON.stringify({ key: "026" })])
  test(`safe return fallback for missing or malformed session ${stored}`, async ({
    page,
  }) => {
    let reconciles = 0;
    const writes: string[] = [];
    await page.route("**/api/checkout/reconcile", (r) => {
      reconciles++;
      return r.abort();
    });
    page.on("request", (r) => {
      if (r.method() === "POST" && /checkout\/(web|payment)/.test(r.url()))
        writes.push(r.url());
    });
    await page.addInitScript((stored) => {
      sessionStorage.clear();
      if (stored) sessionStorage.setItem("3l-checkout", stored);
    }, stored);
    await page.goto("/checkout/return?success=true&orderId=026");
    await expect(
      page.getByRole("heading", { name: "Check your order", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/does not mean your payment failed/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Contact Pastelerías 3L" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /PAY|TRY AGAIN|CONTINUE PAYMENT/ }),
    ).toHaveCount(0);
    expect(reconciles).toBe(0);
    expect(writes).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `work/qa/customer-paid/${test.info().project.name}-missing-session.png`,
      fullPage: true,
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Check your order", exact: true }),
    ).toBeVisible();
    expect(reconciles).toBe(0);
  });
for (const code of [404, 410])
  test(`unknown or expired capability ${code} reveals no private order`, async ({
    page,
  }) => {
    await page.addInitScript(
      (key) => sessionStorage.setItem("3l-checkout", JSON.stringify({ key })),
      KEY,
    );
    await page.route("**/api/checkout/reconcile", (r) =>
      r.fulfill({ status: code, json: { message: "Checkout not found" } }),
    );
    await page.goto("/checkout/return");
    await expect(
      page.getByRole("heading", { name: "Check your order", exact: true }),
    ).toBeVisible();
    await expect(page.locator("main")).not.toContainText("#026");
    await expect(page.locator("main")).not.toContainText("AED");
  });
for (const state of ["paid", "pending", "cancelled", "failed"])
  test(`existing capability retains authoritative ${state} behavior`, async ({
    page,
  }) => {
    let reads = 0;
    await page.addInitScript(
      (key) => sessionStorage.setItem("3l-checkout", JSON.stringify({ key })),
      KEY,
    );
    await page.route("**/api/checkout/reconcile", (r) => {
      reads++;
      expect(r.request().postDataJSON()).toEqual({ key: KEY });
      return r.fulfill({
        json: status({
          paymentStatus: state,
          status:
            state === "paid"
              ? "Confirmed"
              : state === "pending"
                ? "Awaiting Payment"
                : "Building",
        }),
      });
    });
    await page.goto("/checkout/return?success=true");
    await expect(
      page.locator(".b-co-status, .b-co-confirm").first(),
    ).toBeAttached();
    if (state === "paid")
      await expect(
        page.getByText("Your order is confirmed", { exact: false }).first(),
      ).toBeVisible();
    else
      await expect(
        page.getByRole("heading", { name: "Check your order", exact: true }),
      ).toHaveCount(0);
    expect(reads).toBeGreaterThan(0);
  });
test("authorized Operations sees confirmation provider acceptance and attempt metadata", async ({
  page,
}) => {
  const data = {
    ...workspace(),
    customerEmailProvider: "resend",
    customerNotifications: [
      {
        id: "synthetic-email",
        event: "ORDER_PAID",
        channel: "email",
        orderId: "TL-FIX00001",
        status: "sent",
        deliveryOutcome: "accepted",
        providerMessageId: "synthetic-provider-reference",
        lastAttemptAt: "2026-10-25T08:00:00Z",
        createdAt: "2026-10-25T08:00:00Z",
        sentAt: "2026-10-25T08:00:00Z",
        subject: "fixture",
        body: "fixture",
        recipient: "alex@example.invalid",
        attemptCount: 1,
      },
    ],
  };
  await page.route("**/api/workspace", (r) => r.fulfill({ json: data }));
  await page.goto("/operations/orders/TL-FIX00001");
  await expect(
    page.getByText("Email provider accepted — delivery unverified", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/synthetic-provider-reference/)).toBeVisible();
  await expect(page.getByText(/Last email attempt/)).toBeVisible();
  await page.screenshot({
    path: `work/qa/customer-paid/${test.info().project.name}-operations-confirmation.png`,
    fullPage: true,
  });
});

for (const [locale, title] of [
  ["es", "Consulta tu pedido"],
  ["ar", "تحقق من طلبك"],
])
  test(`missing-session fallback is localized: ${locale}`, async ({ page }) => {
    await page.goto(`/checkout/return?lang=${locale}`);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    if (locale === "ar")
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("main")).not.toContainText("Translation pending");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
