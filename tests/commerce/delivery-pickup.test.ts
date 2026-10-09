import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/db/store";
import { applyApprovedDeliveryRules } from "../../server/domain/delivery-rules";
import { zoneSeed, matchZone, quoteOrder } from "../../server/domain/zones";
import {
  normalizeCheckout,
  dubaiToday,
} from "../../server/domain/web-checkout";

test("94 approved zones, seven bands, no duplicates or unknown charges, useful aliases", () => {
  assert.equal(zoneSeed.length, 94);
  assert.equal(new Set(zoneSeed.map((z) => z.id)).size, 94);
  assert.equal(new Set(zoneSeed.map((z) => z.name.toLowerCase())).size, 94);
  assert.deepEqual(
    [30, 50, 100, 150, 200, 250, 300].map(
      (n) => zoneSeed.filter((z) => z.minOrderAed === n).length,
    ),
    [18, 18, 11, 16, 9, 2, 20],
  );
  assert.ok(
    zoneSeed.every((z) => z.active && z.freeDelivery && z.deliveryFeeAed === 0),
  );
  for (const [alias, id] of [
    ["Jumeirah Village Circle", "jvc"],
    ["Jumeirah Village Triangle", "jvt"],
    ["Dubai Production City", "impz-d-production-city"],
    ["IMPZ", "impz-d-production-city"],
    ["Dubai Investments Park", "dip"],
    ["Golden Mile", "palm-jumeirah-golden-mile"],
  ])
    assert.equal(matchZone(zoneSeed, alias)?.id, id);
});
for (const [id, min] of [
  ["jlt-cluster-c", 30],
  ["marina", 50],
  ["jvc", 100],
  ["dubai-hills", 150],
  ["dip", 200],
  ["damac-hills", 250],
  ["downtown", 300],
] as const) {
  test(`${id}: below minimum blocked; exact minimum allowed with total=subtotal`, () => {
    for (const value of [min - 1, min]) {
      const q = quoteOrder(
        zoneSeed,
        [{ productId: "threshold-fixture", quantity: 1 }],
        undefined,
        undefined,
        undefined,
        id,
        [{ id: "threshold-fixture", name: "Fixture", priceFils: value * 100 }],
      );
      assert.equal(q.eligible, value === min);
      assert.equal(q.feeFils, 0);
      assert.equal(q.totalFils, value * 100);
      if (value < min) assert.match(q.reason, /Minimum order/);
    }
  });
}
test("pickup rejects delivery fields, forged totals, missing billing/date and invalid calendar dates", () => {
  const valid = {
    fulfillmentMethod: "pickup",
    lines: [{ productId: "sku", quantity: 1 }],
    pickup: {
      pickupDate: new Date(Date.now() + 172800000).toISOString().slice(0, 10),
      preferredTime: "4:00 PM – 9:00 PM",
    },
    customer: {
      name: "Fixture Reviewer",
      phone: "0500000000",
      email: "fixture@example.invalid",
    },
    billing: {
      sameAsDelivery: false,
      name: "Fixture Reviewer",
      address1: "Fixture billing address",
      city: "Dubai",
      country: "AE",
    },
  };
  assert.equal(normalizeCheckout(valid).address, "");
  for (const patch of [
    { delivery: { zoneId: "marina" } },
    { amount: 1 },
    { billing: { sameAsDelivery: true } },
    {
      pickup: { pickupDate: "2026-02-30", preferredTime: "4:00 PM – 9:00 PM" },
    },
    { pickup: { pickupDate: dubaiToday(), preferredTime: "" } },
  ])
    assert.throws(() => normalizeCheckout({ ...valid, ...patch }));
});
test("rules migration is backed up, idempotent and preserves catalog/orders/payments/history", async () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-zone-migration-"));
  const store = new Store(join(dir, "state.sqlite"), "test");
  try {
    store.write((s) => {
      // Simulate an existing installation that already applied the prior migration.
      s.events["migration:approved-delivery-pickup-2026-10"] = "resolved";
      s.zones = s.zones.filter((z) => z.id !== "jlt-cluster-a");
      s.zones[0]!.deliveryFeeAed = null;
      s.zones[0]!.freeDelivery = false;
    });
    const before = store.read();
    const backup = await applyApprovedDeliveryRules(store, dir);
    assert.ok(backup);
    const restored = new Store(backup, "test");
    assert.deepEqual(restored.read(), before);
    restored.close();
    const after = store.read();
    for (const field of [
      "orders",
      "payments",
      "catalog",
      "conversations",
      "jobs",
      "audit",
      "commands",
    ] as const)
      assert.deepEqual(after[field], before[field]);
    assert.equal(after.zones.filter((z) => z.active).length, 94);
    assert.ok(
      after.zones.filter((z) => z.active).every((z) => z.deliveryFeeAed === 0),
    );
    assert.equal(await applyApprovedDeliveryRules(store, dir), null);
    assert.deepEqual(store.read(), after);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pickup fulfillment goes Ready → Delivered; cannot enter delivery transport; delivery keeps existing workflow", async () => {
  const { transition } = await import("../../server/domain/workflow");
  const base = {
    id: "fixture",
    conversationId: "fixture",
    state: "Ready" as const,
    version: 0,
    lines: [],
    quote: null,
    audit: [],
  };
  const pickup = {
    ...structuredClone(base),
    fulfillmentMethod: "pickup" as const,
  };
  assert.throws(() => transition(pickup, "Out for Delivery", "operator"));
  transition(pickup, "Delivered", "operator");
  assert.equal(pickup.state, "Delivered");
  assert.equal(pickup.audit.length, 1);
  const delivery = structuredClone(base);
  assert.throws(() => transition(delivery, "Delivered", "operator"));
  transition(delivery, "Out for Delivery", "operator");
});
