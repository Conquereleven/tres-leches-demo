import test from "node:test";
import assert from "node:assert/strict";
import type { Workspace } from "../../src/commerce/api";
import { overviewAgenda } from "../../src/commerce/operations-overview";
import {
  trendBuckets,
  categoryRanking,
  periodComparisons,
} from "../../src/commerce/analytics-presentation";
import { analyticsState } from "../fixtures/analytics";
import { ThreeLReportingSource } from "../../server/analytics/three-l-source";
import { calculateReport } from "../../server/analytics/engine";
const range = { from: "2026-10-01", to: "2026-10-19" };
const fixture = () =>
  calculateReport(
    new ThreeLReportingSource(() => analyticsState()).readFacts(),
    range,
  );
for (const grouping of ["day", "week", "month"] as const)
  test(`presentation ${grouping} buckets preserve exact server counts and fils`, () => {
    const report = fixture(),
      before = JSON.stringify(report);
    const buckets = trendBuckets(report.current.daily, grouping);
    assert.equal(
      buckets.reduce((sum, b) => sum + b.capturedFils, 0),
      report.current.capturedFils,
    );
    assert.equal(
      buckets.reduce((sum, b) => sum + b.paidOrders, 0),
      report.current.paidOrders,
    );
    assert.equal(JSON.stringify(report), before);
  });
test("week and month boundaries aggregate selected dates only, including year changes", () => {
  const rows = [
    { day: "2025-12-31", paidOrders: 1, capturedFils: 123 },
    { day: "2026-01-01", paidOrders: 2, capturedFils: 456 },
  ];
  assert.deepEqual(trendBuckets(rows, "week"), [
    { day: "2025-12-29", paidOrders: 3, capturedFils: 579 },
  ]);
  assert.equal(trendBuckets(rows, "month").length, 2);
});
test("historical category ranking reconciles to product allocations without current catalog or invented taxonomy", () => {
  const report = fixture();
  const categories = categoryRanking(report.current.products);
  assert.equal(
    categories.reduce((s, c) => s + c.amountFils, 0),
    report.current.productFils,
  );
  assert.equal(
    categories.reduce((s, c) => s + c.units, 0),
    report.current.units,
  );
  assert.equal(
    categoryRanking([
      {
        sku: "old",
        name: "Recorded",
        category: null,
        units: 2,
        amountFils: 1234,
      },
    ])[0]!.category,
    null,
  );
});
test("zero comparison baseline and unavailable averages stay unavailable", () => {
  const report = fixture();
  report.previous.capturedFils = 0;
  report.previous.paidOrders = 0;
  report.previous.averageFils = null;
  assert.ok(periodComparisons(report).every((x) => x.change === null));
});
test("current agenda excludes terminal orders, surfaces missing verification and failed email without inventing SLA", () => {
  const s = analyticsState();
  const order = s.orders[0]!;
  order.state = "Confirmed";
  order.fulfillmentMethod = "delivery";
  order.delivery = {
    date: "2026-10-25",
    slot: "4:00 PM – 9:00 PM",
    zoneId: "fixture",
    address: "Fixture",
    building: "Fixture",
  };
  s.customerNotifications = [
    {
      id: "failed-email",
      orderId: order.id,
      event: "ORDER_PRODUCTION_STARTED",
      status: "failed",
      channel: "email",
      recipient: "fixture@example.invalid",
      subject: "fixture",
      body: "fixture",
      attemptCount: 1,
      createdAt: "2026-10-25T00:00:00Z",
    },
  ];
  const data = {
    ...s,
    actor: { id: "fixture-admin", role: "admin" },
    agents: [],
    numbers: [],
  } as unknown as Workspace;
  const before = JSON.stringify(data);
  const agenda = overviewAgenda(data, "2026-10-25");
  const priority = agenda.priorities.find((p) => p.order.id === order.id)!;
  assert.ok(priority.reasons.includes("Scheduled today"));
  assert.ok(priority.reasons.includes("Manual address review"));
  assert.ok(priority.reasons.includes("Customer email needs review"));
  assert.equal(agenda.emailIssues, 1);
  assert.ok(!agenda.priorities.some((p) => p.order.state === "Delivered"));
  assert.equal(JSON.stringify(data), before);
  s.customerNotifications![0]!.status = "sending";
  assert.equal(overviewAgenda(data, "2026-10-25").emailIssues, 0);
});
test("empty reporting and empty operational data do not fabricate observations", () => {
  assert.deepEqual(trendBuckets([], "month"), []);
  assert.deepEqual(categoryRanking([]), []);
  const d = {
    orders: [],
    payments: [],
    jobs: [],
    customerNotifications: [],
  } as unknown as Workspace;
  const a = overviewAgenda(d, "2026-10-25");
  assert.equal(a.priorities.length, 0);
  assert.equal(a.scheduledToday, 0);
  assert.equal(a.emailIssues, 0);
  assert.ok(a.pipeline.every((s) => s.count === 0));
});

test("captured comparison preserves the server percentage precision", () => {
  const report = fixture();
  report.previous.capturedFils = 300;
  report.current.capturedFils = 400;
  report.changePercent = 33.33;
  assert.equal(periodComparisons(report)[0]!.change, report.changePercent);
});
