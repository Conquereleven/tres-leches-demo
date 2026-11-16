import { test, expect } from "@playwright/test";
import { omsWorkspace } from "../fixtures/oms";
import { status } from "../fixtures/ux-states";

// UI contract only; the real decision/reconciliation is covered by the SQLite tests.
test("P0 legacy proposal remains on review hold", async ({
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
    "Fulfillment review required",
  );
  await page.goto(`/operations/orders/${o.id}`);
  const notice = page
    .getByRole("alert")
    .filter({ hasText: "Fulfillment review required" });
  await expect(notice).toContainText("Original: 2026-11-13");
  await expect(notice).toContainText("Proposed: 2026-11-14");
  await page.screenshot({
    path: `${process.env.PAYMENT_TIME_EVIDENCE_DIR ?? "/tmp/payment-contract-browser"}/${browserName}-operations.png`,
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
      path: `${process.env.PAYMENT_TIME_EVIDENCE_DIR ?? "/tmp/payment-contract-browser"}/${browserName}-return-${width}.png`,
      fullPage: true,
    });
  });

for (const decision of [
  "auto-rescheduled",
  "review-required",
  "proposed",
  "unknown",
  "missing-effective",
  "mismatch",
  "historical",
])
  test(`P0 capabilities and PrintCenter: ${decision}`, async ({
    page,
    browserName,
  }) => {
    const data = omsWorkspace(),
      o = data.orders[0]!;
    o.fulfillmentMethod = "pickup";
    o.state = "Confirmed";
    o.pickup = { pickupDate: "2026-11-14", preferredTime: "4:00 PM – 9:00 PM" };
    o.paymentFulfillment = {
      paymentId: o.paymentId,
      acknowledgedAt: "2026-11-13T12:51:00Z",
      actor: "synthetic",
      source: "authoritative-checkout",
      reason: "Synthetic policy check",
      status: "auto-rescheduled",
      original: {
        method: "pickup",
        date: "2026-11-13",
        slot: o.pickup.preferredTime,
      },
      effective: {
        method: "pickup",
        date: "2026-11-14",
        slot: o.pickup.preferredTime,
      },
    };
    if (["review-required", "proposed", "unknown"].includes(decision))
      o.paymentFulfillment.status = decision;
    if (decision === "missing-effective") delete o.paymentFulfillment.effective;
    if (decision === "mismatch")
      o.paymentFulfillment.effective.date = "2026-11-15";
    if (decision === "historical") delete o.paymentFulfillment;
    const held = !["auto-rescheduled", "historical"].includes(decision);
    await page.route("**/api/**", (r) => r.fulfill({ json: data }));
    await page.goto(`/operations/orders/${o.id}`);
    const notice = page
      .getByRole("alert")
      .filter({ hasText: "Fulfillment review required" });
    await expect(notice).toHaveCount(held ? 1 : 0);
    await expect(
      page.getByRole("button", { name: "Start preparation", exact: true }),
    ).toHaveCount(held ? 0 : 1);
    // Navigate through the hydrated shell; an absent action alone is not readiness.
    await page
      .getByRole("button", { name: "Kitchen / Production", exact: true })
      .click();
    await expect(page).toHaveURL(/\/operations\/production$/);
    await expect(
      page.getByRole("button", { name: "Kitchen / Production", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    const card = page.getByRole("article", { name: "Order #012", exact: true });
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Start preparation", exact: true }),
    ).toHaveCount(held ? 0 : 1);
    await page
      .getByRole("button", { name: "Print Center", exact: true })
      .click();
    await expect(page).toHaveURL(/\/operations\/print$/);
    await expect(page.locator(".ops-print")).toBeVisible();
    await page.locator(".ops-print select").first().selectOption(o.id);
    if (held) {
      await expect(page.getByRole("alert")).toContainText(
        "Fulfillment review required",
      );
      await expect(page.locator(".ops-ticket")).toHaveCount(0);
      await expect(page.locator(".ops-print")).not.toContainText("4:00 PM");
    } else {
      await expect(page.locator(".ops-ticket")).toContainText(
        "4:00 PM – 9:00 PM",
      );
      await expect(page.locator(".ops-ticket")).toContainText("14");
    }
    await page.screenshot({
      path: `${process.env.PAYMENT_TIME_EVIDENCE_DIR ?? "/tmp/payment-contract-browser"}/${browserName}-${decision}-print.png`,
      fullPage: true,
    });
  });

// Executable regression for the false-negative readiness seam shown in CI's
// empty <main> snapshot: zero actions says nothing while workspace is loading.
test("P0 held checks require a rendered card after deferred workspace hydration", async ({
  page,
}) => {
  const data = omsWorkspace(),
    o = data.orders[0]!;
  o.state = "Confirmed";
  o.paymentFulfillment = {
    status: "review-required",
    reason: "Synthetic missing intent",
  };
  let release!: () => void, requested!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requestSeen = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/workspace") {
      requested();
      await gate;
    }
    await route.fulfill({ json: data });
  });
  try {
    await page.goto("/operations/production");
    await requestSeen;
    // The old zero-count condition succeeds here even though no card exists.
    await expect(
      page.getByRole("button", { name: "Start preparation", exact: true }),
    ).toHaveCount(0);
    const card = page.getByRole("article", { name: "Order #012", exact: true });
    await expect(card).toHaveCount(0);
    release();
    await expect(card).toBeVisible();
    await expect(card).toContainText("Fulfillment review required");
    await expect(
      card.getByRole("button", { name: "Start preparation", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Print Center", exact: true })
      .click();
    await expect(page).toHaveURL(/\/operations\/print$/);
    await page.locator(".ops-print select").first().selectOption(o.id);
    await expect(page.getByRole("alert")).toContainText(
      "Fulfillment review required",
    );
    await expect(page.locator(".ops-ticket")).toHaveCount(0);
  } finally {
    release();
  }
});
