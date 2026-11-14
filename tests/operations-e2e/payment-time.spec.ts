import { test, expect } from "@playwright/test";
import { omsWorkspace } from "../fixtures/oms";
import { status } from "../fixtures/ux-states";

// UI contract only; the real decision/reconciliation is covered by the SQLite tests.
test("P0 operations shows original and proposed schedule without acceptance", async ({
  page,
  browserName,
}) => {
  const data = omsWorkspace();
  const o = data.orders[0]!;
  o.fulfillmentMethod = "pickup";
  o.pickup = { pickupDate: "2026-11-14", preferredTime: "4:00 PM – 9:00 PM" };
  o.paymentFulfillment = {
    paymentId: o.paymentId!,
    acknowledgedAt: "2026-11-13T12:51:00.000Z",
    actor: "synthetic-reviewer",
    source: "authoritative-checkout",
    status: "proposed",
    reason:
      "Earliest same-slot proposal; pending customer and team confirmation",
    original: {
      method: "pickup",
      date: "2026-11-13",
      slot: "4:00 PM – 9:00 PM",
    },
    effective: {
      method: "pickup",
      date: "2026-11-14",
      slot: "4:00 PM – 9:00 PM",
    },
  };
  await page.route("**/api/**", (r) => r.fulfill({ json: data }));
  await page.goto("/operations/orders");
  await expect(page.locator(`[data-order="${o.id}"]`)).toContainText(
    "Fulfillment pending confirmation",
  );
  await page.goto(`/operations/orders/${o.id}`);
  const notice = page
    .getByRole("alert")
    .filter({ hasText: "Fulfillment pending customer" });
  await expect(notice).toContainText("Original: 2026-11-13");
  await expect(notice).toContainText("Proposed: 2026-11-14");
  await page.screenshot({
    path: `work/qa/payment-time/${browserName}-operations.png`,
    fullPage: true,
  });
});

for (const width of [390, 1440])
  test(`P0 paid return is explicitly pending, no second payment ${width}`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/checkout/reconcile", (r) =>
      r.fulfill({
        json: {
          ...status({ status: "Confirmed", paymentStatus: "paid" }),
          fulfillmentPending: true,
          fulfillmentProposal: {
            date: "2026-11-14",
            slot: "4:00 PM – 9:00 PM",
          },
        },
      }),
    );
    await page.goto("/");
    await page.evaluate(() =>
      sessionStorage.setItem(
        "3l-checkout",
        JSON.stringify({ key: "00000000-0000-4000-8000-000000000000" }),
      ),
    );
    await page.goto("/checkout/return");
    await expect(page.locator("main")).toContainText(
      "Fulfillment is pending confirmation",
    );
    await expect(page.locator("main")).not.toContainText(
      "Your order is confirmed",
    );
    await expect(
      page.getByRole("link", { name: "TRY AGAIN", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `work/qa/payment-time/${browserName}-return-${width}.png`,
      fullPage: true,
    });
  });
