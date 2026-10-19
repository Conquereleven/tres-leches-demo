import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { Store, seed } from "../../server/db/store";
import { reportingOrder } from "../fixtures/analytics";
import { ThreeLReportingSource } from "../../server/analytics/three-l-source";
import {
  calculateReport,
  reportRange,
  reportCsv,
  dubaiDay,
} from "../../server/analytics/engine";
import { calculatePackPrice } from "../../shared/pack-pricing";
import { snapshotTricolor } from "../../shared/tricolor";
import { PACK_SPECS } from "../../shared/pack-composition";
import type { State } from "../../server/domain/model";
const range = { from: "2026-10-19", to: "2026-10-19" };
function fixture() {
  const s = seed(),
    { order, payment } = reportingOrder("fictional", 7000);
  s.orders.push(order);
  s.payments.push(payment);
  return { s, order, payment };
}
const report = (s: State) =>
  calculateReport(new ThreeLReportingSource(() => s).readFacts(), range);
test("verified capture, allocation, fee, quantity and immutable historical price survive current catalog edits; SQLite remains unchanged", () => {
  const { s, order, payment } = fixture();
  order.lines[0]!.quantity = 2;
  order.catalogSnapshot![0]!.priceFils = 3000;
  order.quote = {
    ...order.quote!,
    subtotalFils: 6000,
    feeFils: 1000,
    totalFils: 7000,
  };
  s.catalog = [{ id: "fixture-box", name: "CHANGED TODAY", priceFils: 99999 }];
  const store = new Store(":memory:", "test", s);
  try {
    const before = JSON.stringify(store.read());
    const r = calculateReport(
      new ThreeLReportingSource(() => store.read()).readFacts(),
      range,
    );
    assert.equal(r.current.capturedFils, payment.amountFils);
    assert.equal(r.current.productFils, 6000);
    assert.equal(r.current.feeFils, 1000);
    assert.equal(r.current.units, 2);
    assert.equal(r.current.products[0]!.name, "Fictional assortment box");
    assert.equal(JSON.stringify(store.read()), before);
    assert.doesNotMatch(
      JSON.stringify(r),
      /PRIVATE_CUSTOMER|private-fixture|conversation|fictional-checkout/,
    );
  } finally {
    store.close();
  }
});
test("pending, authorized, failed, cancelled, expired, mock and known TEST records never inflate captures", () => {
  for (const status of [
    "creating",
    "pending",
    "authorized",
    "failed",
    "cancelled",
    "expired",
    "pending_confirmation",
  ] as const) {
    const { s, payment } = fixture();
    payment.status = status;
    assert.equal(report(s).current.capturedFils, 0, status);
  }
  for (const provider of [undefined, "mock"] as const) {
    const { s, payment } = fixture();
    payment.provider = provider;
    assert.equal(report(s).current.paidOrders, 0);
  }
  const { s, payment } = fixture();
  payment.url = "https://pay.test.paymennt.com/x";
  assert.equal(report(s).current.paidOrders, 0);
});
test("refund and chargeback preserve gross original capture, expose counts but never fabricate adjustment amounts or net sales", () => {
  for (const status of [
    "refunded",
    "partially_refunded",
    "chargeback",
  ] as const) {
    const { s, payment, order } = fixture();
    payment.status = status;
    order.state = "Cancelled";
    const r = report(s);
    assert.equal(r.current.capturedFils, 7000);
    assert.equal(r.current.adjustments[status], 1);
    assert.equal(r.quality, "partial");
    assert.equal(r.current.states.Cancelled, 1);
    assert.equal("netSales" in r.current, false);
  }
});
test("duplicate callbacks/records deduplicated; conflicting IDs, reused provider references and multiple settled attempts quarantined", () => {
  const { s, payment } = fixture();
  s.payments.push(structuredClone(payment));
  assert.equal(report(s).current.paidOrders, 1);
  s.payments[1]!.amountFils = 9000;
  assert.equal(report(s).current.paidOrders, 0);
  const f = fixture();
  f.s.payments.push({ ...f.payment, id: "second" });
  assert.equal(report(f.s).current.paidOrders, 0);
  const g = fixture();
  const second = reportingOrder("other");
  second.payment.providerCheckoutId = g.payment.providerCheckoutId;
  g.s.orders.push(second.order);
  g.s.payments.push(second.payment);
  assert.equal(report(g.s).current.paidOrders, 0);
});
test("missing proof and missing paid timestamp never fall back to createdAt; missing snapshot remains explicitly unallocated", () => {
  const { s, payment, order } = fixture();
  delete payment.lastReconciledAt;
  assert.equal(report(s).current.paidOrders, 0);
  payment.lastReconciledAt = payment.updatedAt;
  delete payment.paidAt;
  delete order.paidAt;
  assert.equal(report(s).current.paidOrders, 0);
  order.paidAt = "2026-10-19T10:00:00Z";
  delete order.catalogSnapshot;
  const r = report(s);
  assert.equal(r.current.paidOrders, 1);
  assert.equal(r.current.unallocatedFils, 7000);
  assert.equal(r.current.units, null);
  assert.equal(r.quality, "partial");
});
test("invalid totals and ambiguous snapshot definitions never reconstructed from today's catalog", () => {
  for (const kind of [
    "duplicate",
    "wrong-total",
    "bad-quantity",
    "missing-item",
  ]) {
    const { s, order } = fixture();
    if (kind === "duplicate")
      order.catalogSnapshot!.push(order.catalogSnapshot![0]!);
    if (kind === "wrong-total") order.quote!.totalFils = 100;
    if (kind === "bad-quantity") order.lines[0]!.quantity = -1;
    if (kind === "missing-item") order.catalogSnapshot = [];
    assert.equal(report(s).current.unallocatedOrders, 1, kind);
  }
});
test("premium packs use accepted snapshot prices; boxes and distinct compositions retain exact line totals", () => {
  const { s, order, payment } = fixture();
  const spec = PACK_SPECS.find(
    (x) => x.packSkuId === "pan-de-muerto-traditional-pack-6-mini",
  )!;
  assert.ok(spec);
  order.catalogSnapshot = [
    { id: spec.packSkuId, name: "Historical premium box", priceFils: 6000 },
  ];
  // Old eligibility is irrelevant: use valid frozen preparation, not today's approvals.
  order.lines = [
    {
      productId: spec.packSkuId,
      quantity: 2,
      composition: [
        { componentSkuId: spec.components[0]!.componentSkuId, units: 6 },
      ],
    },
  ];
  // Non-premium frozen price still validates all financial invariants.
  order.quote = { ...order.quote!, subtotalFils: 12000, totalFils: 12000 };
  payment.amountFils = 12000;
  // Invalid/missing preparation snapshot must be unallocated, never guessed.
  assert.equal(report(s).current.unallocatedOrders, 1);
  // Price-snapshot contract itself is covered using a real premium identity.
  const premium = spec.components.find((c) =>
    c.componentSkuId.includes("chocolate-covering"),
  )!;
  const l = {
    productId: spec.packSkuId,
    quantity: 1,
    composition: [
      { componentSkuId: spec.components[0]!.componentSkuId, units: 4 },
      { componentSkuId: premium.componentSkuId, units: 2 },
    ],
  };
  const priceSnapshot = calculatePackPrice(l, 6000, {
    version: "pan-premium-v1",
    charges: { [premium.componentSkuId]: 500 },
  });
  assert.equal(priceSnapshot.unitPriceFils, 7000);
  const packSnapshot = {
    version: 1 as const,
    revision: "catalog-v1-" + "a".repeat(64),
    capacity: 6,
    components: l.composition.map((c) => ({
      ...c,
      name: "Historical preparation name",
    })),
  };
  order.lines = [
    { ...l, quantity: 2, priceSnapshot, packSnapshot },
    {
      ...l,
      composition: [
        { componentSkuId: spec.components[0]!.componentSkuId, units: 6 },
      ],
      quantity: 1,
      packSnapshot: {
        ...packSnapshot,
        components: [
          {
            componentSkuId: spec.components[0]!.componentSkuId,
            units: 6,
            name: "Original sugar",
          },
        ],
      },
    },
  ];
  payment.amountFils = 20000;
  order.quote = { ...order.quote!, subtotalFils: 20000, totalFils: 20000 };
  const r = report(s);
  assert.equal(r.current.units, 3);
  assert.equal(r.current.productFils, 20000);
  assert.equal(r.current.unallocatedOrders, 0);
});
test("Dubai midnight, financial vs creation date, inclusive dates and equal previous period", () => {
  assert.equal(dubaiDay("2026-10-18T19:59:59Z"), "2026-10-18");
  assert.equal(dubaiDay("2026-10-18T20:00:00Z"), "2026-10-19");
  const { s, payment, order } = fixture();
  payment.paidAt = order.paidAt = "2026-10-18T20:00:00Z";
  const r = report(s);
  assert.equal(r.current.paidOrders, 1);
  assert.deepEqual(r.previousRange, { from: "2026-10-18", to: "2026-10-18" });
  assert.equal(r.changePercent, null);
  for (const dates of [
    ["2026-02-30", "2026-03-01"],
    ["2026-10-20", "2026-10-19"],
    ["2024-01-01", "2026-10-19"],
  ])
    assert.throws(() => reportRange(dates[0]!, dates[1]!));
});
test("CSV BOM, quoting, newlines and formula neutralization match aggregates", () => {
  const { s, order } = fixture();
  order.catalogSnapshot![0]!.name = ' =HYPERLINK("unsafe")\nfictional';
  const r = report(s);
  const csv = reportCsv(r, "products");
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /' =HYPERLINK\(""unsafe""\)/);
  assert.match(csv, /"7000"/);
  assert.match(reportCsv(r, "sales"), /"2026-10-19","1","7000"/);
});
test("empty data unavailable averages; large synthetic dataset bounded performance and deterministic totals", () => {
  assert.equal(report(seed()).current.averageFils, null);
  const s = seed();
  for (let i = 0; i < 12000; i++) {
    const x = reportingOrder(String(i), 100);
    s.orders.push(x.order);
    s.payments.push(x.payment);
  }
  const start = performance.now();
  const r = report(s);
  assert.equal(r.current.capturedFils, 1200000);
  assert.equal(r.current.paidOrders, 12000);
  assert.ok(performance.now() - start < 5000);
});

test("Tricolor fixed packs and selected single colors use accepted price and never count preparation colors as sold units", () => {
  const { s, order, payment } = fixture();
  const lines = [
    { productId: "conchas-tricolor-pack-3-mini", quantity: 2 },
    {
      productId: "conchas-traditional-tricolor-mini-40-g",
      quantity: 1,
      color: "red" as const,
    },
  ];
  order.lines = lines.map((l) => ({ ...l, packSnapshot: snapshotTricolor(l) }));
  order.catalogSnapshot = [
    {
      id: lines[0]!.productId,
      name: "Recorded three-piece pack",
      priceFils: 3300,
    },
    { id: lines[1]!.productId, name: "Recorded mini", priceFils: 1100 },
  ];
  payment.amountFils = 7700;
  order.quote = { ...order.quote!, subtotalFils: 7700, totalFils: 7700 };
  const r = report(s);
  assert.equal(r.current.units, 3);
  assert.equal(r.current.capturedFils, 7700);
  assert.equal(r.current.unallocatedOrders, 0);
});

test("malformed timestamps, integer overflow and conflicting historical names fail safely", () => {
  assert.equal(dubaiDay("2026-02-30T10:00:00Z"), null);
  const { s, payment } = fixture();
  payment.url =
    "https://pay.paymennt.com/hosted/pay?checkoutKey=validtestsubstring";
  assert.equal(report(s).current.paidOrders, 1);
  const second = reportingOrder("another", Number.MAX_SAFE_INTEGER);
  s.orders.push(second.order);
  s.payments.push(second.payment);
  assert.throws(() => report(s), /precision/);
});
test("same SKU with changed historical definition remains separate; previous period comparison uses confirmation date", () => {
  const { s } = fixture();
  const other = reportingOrder("different", 3000);
  other.order.catalogSnapshot![0]!.name = "Original different definition";
  s.orders.push(other.order);
  s.payments.push(other.payment);
  const old = reportingOrder("prior", 5000, "2026-10-18T09:00:00Z");
  s.orders.push(old.order);
  s.payments.push(old.payment);
  const r = report(s);
  assert.equal(r.current.products.length, 2);
  assert.equal(r.changePercent, 100);
  assert.equal(r.previous.capturedFils, 5000);
});

test("internally consistent captures never imply independently certified LIVE provenance", () => {
  const { s, payment } = fixture();
  payment.url = "https://pay.paymennt.com/hosted/pay?checkoutKey=fictional";
  const r = report(s);
  assert.equal(r.current.capturedFils, 7000);
  assert.equal(r.quality, "internally_consistent");
  assert.equal(r.qualityScope, "financial_consistency");
  assert.equal(r.provenance, "unverified");
  assert.doesNotMatch(JSON.stringify(r), /"reliable"|live_certified/);
});
test("partial and empty financial reports retain explicit unverified provenance", () => {
  const { s, order } = fixture();
  delete order.catalogSnapshot;
  const partial = report(s);
  assert.equal(partial.quality, "partial");
  assert.equal(partial.provenance, "unverified");
  assert.equal(partial.current.unallocatedFils, 7000);
  const empty = report(seed());
  assert.equal(empty.quality, "internally_consistent");
  assert.equal(empty.current.paidOrders, 0);
  assert.equal(empty.provenance, "unverified");
});
test("both CSV exports distinguish financial consistency from historical provenance", () => {
  const { s } = fixture();
  for (const kind of ["sales", "products"] as const) {
    const csv = reportCsv(report(s), kind);
    assert.match(csv, /"Financial consistency","LIVE\/TEST provenance"/);
    assert.match(csv, /"internally_consistent","unverified"/);
    assert.match(csv, /not independently certify LIVE origin/);
    assert.match(csv, /not net sales/);
  }
});
