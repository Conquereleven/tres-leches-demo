import { test, expect, type Page } from "@playwright/test";
import { omsWorkspace } from "../fixtures/oms";
import { status } from "../fixtures/ux-states";

// A loaded, identified held order must be positively observed before absence checks.
async function loadedHold(page: Page, id: string) {
  await page.goto("/operations/orders");
  const row = page.locator(`[data-order="${id}"]`);
  await expect(row).toBeVisible();
  await expect(row).toContainText("#012");
  await expect(row).toContainText("Fulfillment review required");
  await expect(row).not.toContainText("4:00 PM");
  await page.goto(`/operations/orders/${id}`);
  await expect(
    page.getByRole("heading", { name: "#012", exact: true }),
  ).toBeVisible();
  const region = page.getByRole("region", { name: "Fulfillment", exact: true });
  await expect(region.getByRole("alert")).toContainText(
    "Fulfillment review required",
  );
  await expect(region).not.toContainText(
    /Original:|Proposed:|2026-11-1[345]|4:00 PM|Synthetic policy check|Synthetic missing intent/,
  );
  for (const action of ["Start preparation", "Mark ready", "Send for delivery"])
    await expect(
      page.getByRole("button", { name: action, exact: true }),
    ).toHaveCount(0);
  await page.goto("/operations/overview");
  const attention = page
    .locator(".ops-v2-priorities > li")
    .filter({ has: page.locator(`a[href="/operations/orders/${id}"]`) });
  await expect(attention).toBeVisible();
  await expect(attention).toContainText("Fulfillment review required");
  await expect(attention).not.toContainText(/2026-11-1[345]|4:00 PM/);
}
async function loadedProduction(page: Page) {
  await page
    .getByRole("button", { name: "Kitchen / Production", exact: true })
    .click();
  await expect(page).toHaveURL(/\/operations\/production$/);
  await expect(
    page.getByRole("button", { name: "Kitchen / Production", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".co-board")).toBeVisible();
  await expect(page.locator(".co-skeleton")).toHaveCount(0);
}

// UI contract only; the real decision/reconciliation is covered by the SQLite tests.
test("P0 legacy proposal remains on review hold", async ({
  page,
  browserName,
}) => {
  const data = omsWorkspace();
  const o = data.orders[0]!;
  data.orders = [o];
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
  await loadedHold(page, o.id);
  await loadedProduction(page);
  await expect(page.locator(".ops-board-empty")).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Order #012", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start preparation", exact: true }),
  ).toHaveCount(0);
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
  "auto-rescheduled-delivery",
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
    data.orders = [o];
    const delivery = decision === "auto-rescheduled-delivery";
    o.fulfillmentMethod = delivery ? "delivery" : "pickup";
    o.state = "Confirmed";
    o.pickup = { pickupDate: "2026-11-14", preferredTime: "4:00 PM – 9:00 PM" };
    if (delivery)
      o.delivery = {
        ...o.delivery,
        date: "2026-11-14",
        slot: "4:00 PM – 9:00 PM",
      };
    o.paymentFulfillment = {
      paymentId: o.paymentId,
      acknowledgedAt: "2026-11-13T12:51:00Z",
      actor: "synthetic",
      source: "authoritative-checkout",
      reason: "Synthetic policy check",
      status: "auto-rescheduled",
      original: {
        method: delivery ? "delivery" : "pickup",
        date: "2026-11-13",
        slot: o.pickup.preferredTime,
      },
      effective: {
        method: delivery ? "delivery" : "pickup",
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
    const held = ![
      "auto-rescheduled",
      "auto-rescheduled-delivery",
      "historical",
    ].includes(decision);
    await page.route("**/api/**", (r) => r.fulfill({ json: data }));
    if (held) await loadedHold(page, o.id);
    await page.goto(`/operations/orders/${o.id}`);
    await expect(
      page.getByRole("heading", { name: "#012", exact: true }),
    ).toBeVisible();
    const notice = page
      .getByRole("alert")
      .filter({ hasText: "Fulfillment review required" });
    await expect(notice).toHaveCount(held ? 1 : 0);
    await expect(
      page.getByRole("button", { name: "Start preparation", exact: true }),
    ).toHaveCount(held ? 0 : 1);
    await loadedProduction(page);
    const card = page.getByRole("article", { name: "Order #012", exact: true });
    if (held) {
      await expect(page.locator(".ops-board-empty")).toBeVisible();
      await expect(card).toHaveCount(0);
      for (const action of [
        "Start preparation",
        "Mark ready",
        "Send for delivery",
      ])
        await expect(
          page.getByRole("button", { name: action, exact: true }),
        ).toHaveCount(0);
    } else {
      await expect(card).toBeVisible();
      await expect(
        card.getByRole("button", { name: "Start preparation", exact: true }),
      ).toHaveCount(1);
      await expect(card).toContainText("4:00 PM");
    }
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
      await expect(page.locator(".ops-ticket")).toContainText("14 Nov 2026");
      await expect(page.locator(".ops-ticket")).not.toContainText(
        "13 Nov 2026",
      );
    }
    await page.screenshot({
      path: `${process.env.PAYMENT_TIME_EVIDENCE_DIR ?? "/tmp/payment-contract-browser"}/${browserName}-${decision}-print.png`,
      fullPage: true,
    });
  });

// Executable regression for the false-negative readiness seam shown in CI's
// empty <main> snapshot: zero actions says nothing while workspace is loading.
test("P0 held checks require an identified held order after deferred workspace hydration", async ({
  page,
}) => {
  const data = omsWorkspace(),
    o = data.orders[0]!;
  data.orders = [o];
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
    await page.goto("/operations/orders");
    await requestSeen;
    await expect(page.locator(".co-skeleton[aria-busy=true]")).toBeVisible();
    const row = page.locator(`[data-order="${o.id}"]`);
    await expect(row).toHaveCount(0); // deliberately not considered a passed hold check
    release();
    await expect(row).toBeVisible();
    await expect(row).toContainText("Fulfillment review required");
    await loadedHold(page, o.id);
    await loadedProduction(page);
    await expect(page.locator(".ops-board-empty")).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Order #012", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Start preparation", exact: true }),
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
