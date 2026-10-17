import { orderLines } from "../../src/commerce/order-view";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PACK_SPECS, type CommerceLine } from "../../shared/pack-composition";
import { acceptedLinePrice } from "../../shared/pack-pricing";
import { premiumFixture, premiumInput } from "../fixtures/premium-packs";
import {
  quoteWebCheckout,
  createWebCheckout,
  readWebCheckoutStatus,
} from "../../server/domain/web-checkout";
import { frozenCheckout } from "../../server/domain/frozen-checkout";
import { ticketSnapshot } from "../../src/commerce/ticket-snapshot";
import { packPricingPolicy } from "../../server/domain/pack-pricing";
import { publishedPackRules } from "../../server/domain/packs";
import {
  hubCommand,
  hubView,
  type HubFlags,
} from "../../server/catalog/product-hub";
const prior = {
  packs: process.env.PERSONALIZED_PACKS_ENABLED,
  premium: process.env.PAN_PACK_PREMIUM_PRICING_ENABLED,
};
process.env.PERSONALIZED_PACKS_ENABLED = "true";
process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "true";
after(() => {
  for (const [key, value] of [
    ["PERSONALIZED_PACKS_ENABLED", prior.packs],
    ["PAN_PACK_PREMIUM_PRICING_ENABLED", prior.premium],
  ]) {
    if (value === undefined) delete process.env[key!];
    else process.env[key!] = value;
  }
});
const admin = { id: "fixture-admin", role: "admin" } as const;
const flags: HubFlags = {
  enabled: true,
  publishEnabled: true,
  publishBlocked: null,
};
const makeLine = (
  spec: (typeof PACK_SPECS)[number],
  premium: number,
  quantity = 1,
): CommerceLine => {
  const standard = spec.components[0]!.componentSkuId;
  const extra = spec.components.find((c) =>
    spec.family === "traditional"
      ? c.componentSkuId.endsWith("-chocolate-covering")
      : c.componentSkuId.includes("filled-pistachio"),
  )!.componentSkuId;
  return {
    productId: spec.packSkuId,
    quantity,
    composition: [
      ...(premium < spec.capacity
        ? [{ componentSkuId: standard, units: spec.capacity - premium }]
        : []),
      ...(premium ? [{ componentSkuId: extra, units: premium }] : []),
    ],
  };
};
for (const spec of PACK_SPECS)
  test(`${spec.packSkuId}: exact 0/1/2/all-piece premium prices, fixed base, quantity and zone minimum`, () => {
    const f = premiumFixture();
    try {
      const base = f.store
        .read()
        .catalog!.find((p) => p.id === spec.packSkuId)!.priceFils;
      const rate =
        spec.family === "traditional"
          ? spec.size === "mini"
            ? 500
            : 600
          : spec.size === "mini"
            ? 2300
            : 2600;
      for (const units of [0, 1, 2, spec.capacity]) {
        const lines = [makeLine(spec, units, 2)];
        const q = quoteWebCheckout(f.service, {
          lines,
          fulfillmentMethod: "pickup",
        });
        assert.equal(q.totalFils, 2 * (base + units * rate));
        assert.equal(q.feeFils, 0);
        assert.ok(q.eligible);
        const zone = f.store
          .read()
          .zones.find((z) => z.active && z.minOrderAed === 300)!;
        const delivery = quoteWebCheckout(f.service, {
          lines: [makeLine(spec, units)],
          zoneId: zone.id,
        });
        assert.equal(delivery.minimumMet, base + units * rate >= 30000);
        assert.equal(delivery.feeFils, 0);
      }
      assert.equal(f.calls.length, 0);
    } finally {
      f.store.close();
    }
  });
test("approved examples are AED70 traditional and AED123/AED146 filled, with no extra pieces", () => {
  const f = premiumFixture();
  try {
    for (const [spec, n, total] of [
      [PACK_SPECS[0]!, 2, 7000],
      [PACK_SPECS[4]!, 1, 12300],
      [PACK_SPECS[4]!, 2, 14600],
    ] as const) {
      const line = makeLine(spec, n);
      assert.equal(
        line.composition!.reduce((a, c) => a + c.units, 0),
        6,
      );
      assert.equal(
        quoteWebCheckout(f.service, {
          lines: [line],
          fulfillmentMethod: "pickup",
        }).totalFils,
        total,
      );
    }
  } finally {
    f.store.close();
  }
});
test("same SKU compositions freeze independent prices; fake hosted payment, paid email, ticket and historical snapshots agree", async () => {
  const f = premiumFixture();
  try {
    const lines = [
      makeLine(PACK_SPECS[0]!, 0),
      makeLine(PACK_SPECS[0]!, 2, 2),
      makeLine(PACK_SPECS[4]!, 2),
    ];
    const input = {
      ...premiumInput(lines),
      customer: {
        ...premiumInput(lines).customer,
        instructions: "ALLERGY: fictional nuts. Keep each box separate.",
      },
    };
    const key = randomUUID();
    const result = await createWebCheckout(
      f.service,
      input,
      key,
      "web",
      "https://fixture.invalid",
    );
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0]!.amount, 346); // 60 + 2*70 + 146
    const s = f.store.read(),
      o = s.orders.find((o) => o.id === result.orderId)!,
      p = s.payments.find((p) => p.orderId === o.id)!;
    assert.deepEqual(
      frozenCheckout(o, p).items.map((i) => i.unitPriceFils),
      [6000, 7000, 14600],
    );
    assert.deepEqual(
      ticketSnapshot(o)!.map((i) => i.priceFils),
      [6000, 7000, 14600],
    );
    assert.equal(
      o.catalogSnapshot!.find((p) => p.id === lines[0]!.productId)!.priceFils,
      6000,
    );
    assert.deepEqual(
      orderLines({ catalog: s.catalog! }, o).map((l) => l.unitFils),
      [6000, 7000, 14600],
    );
    assert.ok(
      orderLines(
        { catalog: s.catalog! },
        { ...o, catalogSnapshot: undefined },
      ).every((l) => l.unitFils === null),
    );
    assert.equal(
      await createWebCheckout(
        f.service,
        input,
        key,
        "web",
        "https://fixture.invalid",
      ).then((r) => r.orderId),
      o.id,
    );
    assert.equal(f.calls.length, 1);
    f.paid();
    await f.service.reconcile(p.id, admin);
    await f.service.reconcile(p.id, admin);
    const paid = f.store.read();
    assert.equal(paid.operationsEmailNotifications!.length, 1);
    const email = paid.operationsEmailNotifications![0]!;
    assert.match(email.body, /AED 70.00 per box · AED 140.00 line total/);
    assert.match(email.html!, /Total paid: AED 346.00/);
    assert.match(email.body, /ALLERGY: fictional nuts/);
    const orders = structuredClone(paid.orders),
      payments = structuredClone(paid.payments),
      notifications = structuredClone(paid.operationsEmailNotifications);
    f.store.write((s) => {
      s.catalog!.find((c) => c.id === lines[0]!.productId)!.priceFils = 9900;
    });
    process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "false";
    const frozen = frozenCheckout(
      orders.find((x) => x.id === o.id)!,
      payments.find((x) => x.id === p.id)!,
    );
    assert.equal(frozen.totalFils, 34600);
    assert.equal(readWebCheckoutStatus(f.service, key).amountFils, 34600);
    assert.deepEqual(f.store.read().orders, orders);
    assert.deepEqual(f.store.read().payments, payments);
    assert.deepEqual(
      f.store.read().operationsEmailNotifications,
      notifications,
    );
  } finally {
    process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "true";
    f.store.close();
  }
});
test("policy activation invalidates old quotes atomically before any fake provider action; unpaid carts reprice safely", async () => {
  const f = premiumFixture();
  try {
    process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "false";
    const lines = [makeLine(PACK_SPECS[4]!, 2)];
    const old = quoteWebCheckout(f.service, {
      lines,
      fulfillmentMethod: "pickup",
    });
    assert.equal(old.totalFils, 10000);
    process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "true";
    assert.equal(
      quoteWebCheckout(f.service, { lines, fulfillmentMethod: "pickup" })
        .totalFils,
      14600,
    );
    await assert.rejects(
      createWebCheckout(
        f.service,
        premiumInput(lines),
        randomUUID(),
        "web",
        "https://fixture.invalid",
        old.quoteRevision,
      ),
      /price|quote|changed|review/i,
    );
    assert.equal(f.calls.length, 0);
    assert.equal(f.store.read().orders.length, 0);
  } finally {
    process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "true";
    f.store.close();
  }
});
test("missing or conflicting published Pistachio rates fail closed, never substituting a lower rate", () => {
  const f = premiumFixture();
  try {
    for (const rate of [0, 1800, 2200, 9999]) {
      const products = structuredClone(f.store.read().catalog!);
      products.find(
        (p) => p.id === "pan-de-muerto-filled-pistachio-mini",
      )!.priceFils = rate;
      assert.throws(() => packPricingPolicy(products), /conflicts/);
    }
    assert.throws(() => packPricingPolicy([]), /conflicts/);
  } finally {
    f.store.close();
  }
});
test("covering cannot be selected or newly published under fixed pricing; admin may publish only with premium policy verified", () => {
  const f = premiumFixture(false);
  try {
    process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "false";
    const line = makeLine(PACK_SPECS[0]!, 2);
    const rules = PACK_SPECS.map((s) => ({
      packSkuId: s.packSkuId,
      componentSkuIds: s.components.map((c) => c.componentSkuId),
    }));
    let view = hubView(f.store.read(), admin, flags);
    assert.ok(view.available);
    hubCommand(
      f.store,
      admin,
      randomUUID(),
      { type: "savePackEligibility", expectedVersion: view.version, rules },
      flags,
    );
    view = hubView(f.store.read(), admin, flags);
    assert.ok(view.available);
    const command = {
      type: "publish" as const,
      expectedVersion: view.version,
      expectedPublishedRevision: view.published.id,
    };
    assert.throws(
      () => hubCommand(f.store, admin, randomUUID(), command, flags),
      /requires verified premium/,
    );
    process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "true";
    hubCommand(f.store, admin, randomUUID(), command, flags);
    assert.equal(
      publishedPackRules(f.store.read()).reduce(
        (n, r) => n + r.componentSkuIds.length,
        0,
      ),
      32,
    );
    assert.equal(
      quoteWebCheckout(f.service, {
        lines: [line],
        fulfillmentMethod: "pickup",
      }).totalFils,
      7000,
    );
    process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "false";
    assert.throws(
      () =>
        quoteWebCheckout(f.service, {
          lines: [line],
          fulfillmentMethod: "pickup",
        }),
      /unavailable/,
    );
  } finally {
    process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "true";
    f.store.close();
  }
});
test("tampered frozen per-composition financial facts and missing premium rows never fall back to base price", async () => {
  const f = premiumFixture();
  try {
    const r = await createWebCheckout(
      f.service,
      premiumInput([makeLine(PACK_SPECS[4]!, 2)]),
      randomUUID(),
      "web",
      "https://fixture.invalid",
    );
    const s = f.store.read();
    const o = s.orders.find((o) => o.id === r.orderId)!,
      p = s.payments.find((p) => p.orderId === o.id)!;
    for (const mutate of [
      (o: (typeof s.orders)[number]) => {
        o.lines[0]!.priceSnapshot!.unitPriceFils = 10000;
      },
      (o: (typeof s.orders)[number]) => {
        o.lines[0]!.priceSnapshot!.premiums = [];
      },
    ]) {
      const bad = structuredClone(o);
      mutate(bad);
      assert.equal(acceptedLinePrice(bad.lines[0]!, 10000), null);
      assert.throws(() => frozenCheckout(bad, p), /review required/);
      assert.equal(ticketSnapshot(bad), null);
    }
  } finally {
    f.store.close();
  }
});

test("old fixed-price hosted link is hidden after activation; a natural late underpriced payment is preserved for manual review without ORDER_PAID email", async () => {
  const f = premiumFixture();
  try {
    process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "false";
    const key = randomUUID();
    const lines = [makeLine(PACK_SPECS[4]!, 2)];
    const r = await createWebCheckout(
      f.service,
      premiumInput(lines),
      key,
      "web",
      "https://fixture.invalid",
    );
    assert.ok(readWebCheckoutStatus(f.service, key).url);
    process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "true";
    const held = readWebCheckoutStatus(f.service, key);
    assert.equal(held.url, null);
    assert.equal(held.actionRequired, "review_payment");
    f.paid();
    const p = f.store.read().payments.find((p) => p.orderId === r.orderId)!;
    await f.service.reconcile(p.id, admin);
    const s = f.store.read();
    assert.equal(s.payments.find((x) => x.id === p.id)!.status, "paid");
    assert.equal(s.payments.find((x) => x.id === p.id)!.amountFils, 10000);
    assert.equal(
      s.orders.find((o) => o.id === r.orderId)!.state,
      "Awaiting Payment",
    );
    assert.equal(s.operationsEmailNotifications?.length ?? 0, 0);
    assert.equal(
      readWebCheckoutStatus(f.service, key).actionRequired,
      "review_payment",
    );
  } finally {
    process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "true";
    f.store.close();
  }
});
test("refund and partial-refund reconciliations retain accepted premium prices and never requeue a paid email", async () => {
  for (const status of ["PARTIALLY_REFUNDED", "REFUNDED"]) {
    const f = premiumFixture();
    try {
      const r = await createWebCheckout(
        f.service,
        premiumInput([makeLine(PACK_SPECS[4]!, 2)]),
        randomUUID(),
        "web",
        "https://fixture.invalid",
      );
      const p = f.store.read().payments.find((p) => p.orderId === r.orderId)!;
      f.paid();
      await f.service.reconcile(p.id, admin);
      const order = structuredClone(
        f.store.read().orders.find((o) => o.id === r.orderId)!,
      );
      f.status(status);
      await f.service.reconcile(p.id, admin);
      await f.service.reconcile(p.id, admin);
      const s = f.store.read();
      assert.equal(s.payments.find((x) => x.id === p.id)!.amountFils, 14600);
      assert.deepEqual(
        s.orders.find((o) => o.id === r.orderId),
        order,
      );
      assert.equal(s.operationsEmailNotifications!.length, 1);
      assert.equal(
        frozenCheckout(
          order,
          s.payments.find((x) => x.id === p.id)!,
        ).totalFils,
        14600,
      );
    } finally {
      f.store.close();
    }
  }
});

test("an accepted new-model pending checkout keeps its frozen premium amount after a later catalog edit", async () => {
  const f = premiumFixture();
  try {
    const key = randomUUID();
    const r = await createWebCheckout(
      f.service,
      premiumInput([makeLine(PACK_SPECS[4]!, 2)]),
      key,
      "web",
      "https://fixture.invalid",
    );
    const p = f.store.read().payments.find((p) => p.orderId === r.orderId)!;
    const before = structuredClone(
      f.store.read().orders.find((o) => o.id === r.orderId)!,
    );
    f.store.write((s) => {
      s.catalog!.find((c) => c.id === PACK_SPECS[4]!.packSkuId)!.priceFils =
        19000;
    });
    assert.ok(readWebCheckoutStatus(f.service, key).url);
    assert.equal(readWebCheckoutStatus(f.service, key).amountFils, 14600);
    f.paid();
    await f.service.reconcile(p.id, admin);
    assert.equal(
      f.store.read().orders.find((o) => o.id === r.orderId)!.quote!.totalFils,
      14600,
    );
    assert.deepEqual(
      f.store.read().orders.find((o) => o.id === r.orderId)!.lines,
      before.lines,
    );
  } finally {
    f.store.close();
  }
});

test("a missing new-model price snapshot cannot make a ticket silently display the lower base amount", async () => {
  const f = premiumFixture();
  try {
    const r = await createWebCheckout(
      f.service,
      premiumInput([makeLine(PACK_SPECS[4]!, 2)]),
      randomUUID(),
      "web",
      "https://fixture.invalid",
    );
    const s = f.store.read();
    const o = s.orders.find((o) => o.id === r.orderId)!,
      p = s.payments.find((p) => p.orderId === o.id)!;
    delete o.lines[0]!.priceSnapshot;
    assert.throws(() => frozenCheckout(o, p), /review required/);
    assert.equal(ticketSnapshot(o), null);
  } finally {
    f.store.close();
  }
});
