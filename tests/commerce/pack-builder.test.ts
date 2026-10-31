import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store, seed } from "../../server/db/store";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import {
  hubCommand,
  hubView,
  type HubFlags,
} from "../../server/catalog/product-hub";
import {
  revisionFingerprint,
  validateFoundation,
} from "../../server/catalog/contract";
import { CommerceService } from "../../server/domain/service";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import {
  createWebCheckout,
  quoteWebCheckout,
  canonicalCartHash,
  resumeWebCheckout,
  addDays,
  dubaiToday,
} from "../../server/domain/web-checkout";
import { frozenCheckout } from "../../server/domain/frozen-checkout";
import {
  packBuilderEnabled,
  publishedPackRules,
} from "../../server/domain/packs";
import {
  PACK_SPECS,
  lineKey,
  preparationText,
  commerceLineSchema,
  type Composition,
  type CommerceLine,
} from "../../shared/pack-composition";
import { availableSku } from "../../shared/commerce-policy";
import { ticketSnapshot } from "../../src/commerce/ticket-snapshot";
import type { Actor } from "../../server/domain/model";
const original = process.env.PERSONALIZED_PACKS_ENABLED;
process.env.PERSONALIZED_PACKS_ENABLED = "true";
after(() => {
  if (original === undefined) delete process.env.PERSONALIZED_PACKS_ENABLED;
  else process.env.PERSONALIZED_PACKS_ENABLED = original;
});
const admin: Actor = { id: "fixture-admin", role: "admin" },
  manager: Actor = { id: "fixture-manager", role: "manager" };
const flags: HubFlags = {
  enabled: true,
  publishEnabled: true,
  publishBlocked: null,
};
const sources = loadBootstrapSources(process.cwd());
function fixture(approved = true) {
  const initial = seed();
  initial.catalog = structuredClone(sources.approved);
  initial.catalogFoundation = planCatalogBootstrap(
    initial.catalog,
    sources,
  ).foundation!;
  if (approved) {
    initial.catalogFoundation.packEligibility = PACK_SPECS.map((p) => ({
      packSkuId: p.packSkuId,
      componentSkuIds: p.components
        .map((c) => c.componentSkuId)
        .filter((id) => !id.endsWith("-chocolate-covering")),
    }));
    const { revision: _r, ...meta } = initial.catalogFoundation;
    const hash = revisionFingerprint(meta, initial.catalog);
    initial.catalogFoundation.revision = {
      id: `catalog-v1-${hash}`,
      fingerprint: hash,
      publishedAt: null,
    };
  }
  const store = new Store(":memory:", "test", initial);
  const calls: Record<string, unknown>[] = [];
  const records = new Map<string, Record<string, unknown>>();
  let status = "PENDING";
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        calls.push(body);
        const id = randomUUID();
        records.set(id, {
          ...body,
          id,
          status,
          redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
        });
        return Response.json({ success: true, result: records.get(id) });
      }
      return Response.json({
        success: true,
        result: { ...records.get(String(url).split("/").at(-1)!), status },
      });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
  );
  service.operationsEmailRecipients = ["ops@example.invalid"];
  return {
    store,
    service,
    calls,
    expired: () => {
      status = "EXPIRED";
    },
    paid: () => {
      status = "PAID";
    },
  };
}
const input = (lines: CommerceLine[]) => ({
  lines,
  fulfillmentMethod: "pickup",
  pickup: {
    pickupDate: addDays(dubaiToday(), 2),
    preferredTime: "4:00 PM – 9:00 PM",
  },
  customer: {
    name: "Pack fixture",
    phone: "0500000000",
    email: "pack@example.invalid",
  },
  billing: {
    sameAsDelivery: false,
    name: "Pack fixture",
    address1: "Fixture street",
    city: "Dubai",
    country: "AE",
  },
});
const quote = (f: ReturnType<typeof fixture>, lines: CommerceLine[]) =>
  quoteWebCheckout(f.service, { lines, fulfillmentMethod: "pickup" });
const price = (sku: string) =>
  sources.approved.find((p) => p.id === sku)!.priceFils;
const single = (spec: (typeof PACK_SPECS)[number], i = 0): Composition => [
  { componentSkuId: spec.components[i]!.componentSkuId, units: spec.capacity },
];
function publish(
  f: ReturnType<typeof fixture>,
  rules: ReturnType<typeof publishedPackRules>,
) {
  const v = hubView(f.store.read(), admin, flags);
  assert.ok(v.available);
  hubCommand(
    f.store,
    manager,
    randomUUID(),
    { type: "savePackEligibility", expectedVersion: v.version, rules },
    flags,
  );
  hubCommand(
    f.store,
    admin,
    randomUUID(),
    {
      type: "publish",
      expectedVersion: v.version + 1,
      expectedPublishedRevision: v.published.id,
    },
    flags,
  );
}
for (const spec of PACK_SPECS)
  test(`${spec.packSkuId}: fixed price, arbitrary mix, one flavor, all flavors, multiple boxes`, () => {
    const f = fixture();
    try {
      for (const c of spec.components.filter(
        (c) => !c.componentSkuId.endsWith("-chocolate-covering"),
      )) {
        const result = quote(f, [
          {
            productId: spec.packSkuId,
            quantity: 3,
            composition: [
              { componentSkuId: c.componentSkuId, units: spec.capacity },
            ],
          },
        ]);
        assert.equal(result.totalFils, price(spec.packSkuId) * 3);
        assert.ok(result.eligible);
      }
      const components = spec.components.filter(
        (c) => !c.componentSkuId.endsWith("-chocolate-covering"),
      );
      const composition = components.map((c, i) => ({
        componentSkuId: c.componentSkuId,
        units: i === 0 ? spec.capacity - components.length + 1 : 1,
      }));
      assert.equal(
        quote(f, [{ productId: spec.packSkuId, quantity: 1, composition }])
          .totalFils,
        price(spec.packSkuId),
      );
      assert.equal(
        quote(f, [
          {
            productId: spec.packSkuId,
            quantity: 1,
            composition: [
              { componentSkuId: spec.components[0]!.componentSkuId, units: 2 },
              {
                componentSkuId: spec.components[1]!.componentSkuId,
                units: spec.capacity - 2,
              },
            ],
          },
        ]).totalFils,
        price(spec.packSkuId),
      );
    } finally {
      f.store.close();
    }
  });
test("new eligibility is unavailable until explicit draft and admin publication; roles cannot be injected", () => {
  const f = fixture(false);
  try {
    assert.deepEqual(publishedPackRules(f.store.read()), []);
    assert.throws(() =>
      quote(f, [
        {
          productId: PACK_SPECS[0]!.packSkuId,
          quantity: 1,
          composition: single(PACK_SPECS[0]!),
        },
      ]),
    );
    const rules = PACK_SPECS.map((p) => ({
      packSkuId: p.packSkuId,
      componentSkuIds: p.components
        .map((c) => c.componentSkuId)
        .filter((id) => !id.endsWith("-chocolate-covering")),
    }));
    const before = structuredClone(f.store.read());
    const v = hubView(before, manager, flags);
    assert.ok(v.available);
    const key = randomUUID();
    hubCommand(
      f.store,
      manager,
      key,
      { type: "savePackEligibility", expectedVersion: 0, rules },
      flags,
    );
    assert.deepEqual(publishedPackRules(f.store.read()), []);
    assert.deepEqual(f.store.read().catalog, before.catalog);
    assert.deepEqual(f.store.read().orders, before.orders);
    const draft = hubView(f.store.read(), manager, flags);
    assert.ok(draft.available);
    assert.equal(draft.changes.length, 8);
    assert.equal(draft.issues.filter((i) => i.level === "error").length, 0);
    for (const role of ["manager", "operator", "agent"] as const)
      assert.throws(
        () =>
          hubCommand(
            f.store,
            { id: "fixture", role },
            randomUUID(),
            {
              type: "publish",
              expectedVersion: 1,
              expectedPublishedRevision: v.published.id,
            },
            flags,
          ),
        { status: 403 },
      );
    hubCommand(
      f.store,
      admin,
      randomUUID(),
      {
        type: "publish",
        expectedVersion: 1,
        expectedPublishedRevision: v.published.id,
      },
      flags,
    );
    assert.equal(publishedPackRules(f.store.read()).length, 8);
    assert.deepEqual(f.store.read().catalog, before.catalog);
    validateFoundation(
      f.store.read().catalogFoundation,
      f.store.read().catalog!,
    );
    assert.throws(() =>
      hubCommand(
        f.store,
        admin,
        randomUUID(),
        {
          type: "savePackEligibility",
          expectedVersion: 2,
          rules: [
            {
              packSkuId: PACK_SPECS[0]!.packSkuId,
              componentSkuIds: [
                "pan-de-muerto-traditional-ajonjoli-mini-40-g-chocolate-covering",
              ],
            },
          ],
        },
        flags,
      ),
    );
  } finally {
    f.store.close();
  }
});
test("reject malformed, duplicate, retired, disabled, wrong size, cross family and incomplete compositions before provider actions", async () => {
  const f = fixture(),
    spec = PACK_SPECS[0]!;
  const base = { productId: spec.packSkuId, quantity: 1 };
  try {
    const wrong = [
      undefined,
      [],
      [{ componentSkuId: spec.components[0]!.componentSkuId, units: 5 }],
      [{ componentSkuId: spec.components[0]!.componentSkuId, units: 7 }],
      [{ componentSkuId: spec.components[0]!.componentSkuId, units: -6 }],
      [{ componentSkuId: spec.components[0]!.componentSkuId, units: 6.5 }],
      [...single(spec), ...single(spec)],
      [
        {
          componentSkuId: PACK_SPECS.at(-1)!.components[0]!.componentSkuId,
          units: 6,
        },
      ],
      [
        {
          componentSkuId:
            "pan-de-muerto-traditional-ajonjoli-mini-40-g-chocolate-covering",
          units: 6,
        },
      ],
    ];
    for (const composition of wrong)
      assert.throws(() => quote(f, [{ ...base, composition } as CommerceLine]));
    assert.throws(() =>
      quote(f, [
        { productId: "candles-", quantity: 1, composition: single(spec) },
      ]),
    );
    assert.throws(() =>
      commerceLineSchema.parse({
        ...base,
        composition: single(spec),
        packSnapshot: { version: 1 },
      }),
    );
    assert.throws(() =>
      quote(f, [
        { ...base, quantity: 51, composition: single(spec) },
        { ...base, quantity: 50, composition: single(spec, 1) },
      ]),
    );
    publish(f, []);
    assert.throws(() => quote(f, [{ ...base, composition: single(spec) }]));
    assert.equal(f.calls.length, 0);
  } finally {
    f.store.close();
  }
});
test("off flag preserves legacy packs and rejects composition; packs remain year-round independently of singles", () => {
  const f = fixture(),
    spec = PACK_SPECS[0]!;
  try {
    assert.equal(packBuilderEnabled({}), false);
    process.env.PERSONALIZED_PACKS_ENABLED = "false";
    assert.equal(
      quote(f, [{ productId: spec.packSkuId, quantity: 1 }]).totalFils,
      price(spec.packSkuId),
    );
    assert.throws(() =>
      quote(f, [
        { productId: spec.packSkuId, quantity: 1, composition: single(spec) },
      ]),
    );
    process.env.PERSONALIZED_PACKS_ENABLED = "true";
    assert.equal(
      availableSku(
        spec.components[0]!.componentSkuId,
        new Date("2027-03-01T10:00:00Z"),
      ),
      false,
    );
    assert.equal(
      availableSku(spec.packSkuId, new Date("2027-03-01T10:00:00Z")),
      true,
    );
    mock.timers.enable({
      apis: ["Date"],
      now: new Date("2027-03-01T10:00:00Z"),
    });
    assert.throws(() =>
      quote(f, [
        { productId: spec.components[0]!.componentSkuId, quantity: 1 },
      ]),
    );
    // Component approval is deliberately separate from the retail active/season switch.
    f.store.write((s) => {
      s.catalog!.find(
        (p) => p.id === spec.components[0]!.componentSkuId,
      )!.active = false;
      const { revision: _r, ...meta } = s.catalogFoundation!;
      const hash = revisionFingerprint(meta, s.catalog!);
      s.catalogFoundation!.revision = {
        id: `catalog-v1-${hash}`,
        fingerprint: hash,
        publishedAt: null,
      };
    });
    assert.ok(
      quote(f, [
        { productId: spec.packSkuId, quantity: 1, composition: single(spec) },
      ]).eligible,
    );
  } finally {
    mock.timers.reset();
    process.env.PERSONALIZED_PACKS_ENABLED = "true";
    f.store.close();
  }
});
test("same SKU with different mixes freezes two lines, charges boxes only, replays idempotently and preserves kitchen snapshot after publication", async () => {
  const f = fixture(),
    spec = PACK_SPECS.find(
      (p) =>
        p.family === "filled" && p.capacity === 12 && p.size === "individuales",
    )!;
  try {
    const lines = [
      { productId: spec.packSkuId, quantity: 2, composition: single(spec, 4) },
      { productId: spec.packSkuId, quantity: 1, composition: single(spec, 1) },
    ];
    const key = randomUUID();
    assert.notEqual(lineKey(lines[0]!), lineKey(lines[1]!));
    const hash = canonicalCartHash(f.service, {
      lines,
      fulfillmentMethod: "pickup",
    });
    assert.equal(
      hash,
      canonicalCartHash(f.service, {
        lines: [...lines].reverse(),
        fulfillmentMethod: "pickup",
      }),
    );
    const result = await createWebCheckout(
      f.service,
      input(lines),
      key,
      "web",
      "https://fixture.invalid",
    );
    const replay = await createWebCheckout(
      f.service,
      input(lines),
      key,
      "web",
      "https://fixture.invalid",
    );
    assert.equal(result.orderId, replay.orderId);
    assert.equal(f.calls.length, 1);
    const order = f.store.read().orders.find((o) => o.id === result.orderId)!,
      payment = f.store.read().payments.find((p) => p.id === order.paymentId)!;
    assert.equal(order.lines.length, 2);
    assert.equal(payment.amountFils, 23500 * 3);
    assert.equal(ticketSnapshot(order)?.length, 2);
    assert.equal(frozenCheckout(order, payment).items.length, 2);
    assert.match(preparationText(order.lines[0]!), /Pistachio × 12/);
    assert.equal(result.summary?.items[0]?.composition?.[0]?.units, 12);
    assert.equal(
      resumeWebCheckout(f.service, { key, checkout: input(lines) }).changed,
      false,
    );
    const held = structuredClone(order);
    const bad = structuredClone(order);
    delete bad.lines[0]!.packSnapshot;
    assert.equal(ticketSnapshot(bad), null);
    assert.throws(() => frozenCheckout(bad, payment));
    publish(f, []);
    assert.deepEqual(
      f.store.read().orders.find((o) => o.id === order.id),
      held,
    );
    assert.equal(frozenCheckout(order, payment).totalFils, 70500);
    assert.throws(() =>
      resumeWebCheckout(f.service, { key, checkout: input(lines) }),
    );
    const changed = [{ ...lines[0]!, composition: single(spec, 1) }];
    await assert.rejects(
      createWebCheckout(
        f.service,
        input(changed),
        key,
        "web",
        "https://fixture.invalid",
      ),
    );
    assert.equal(f.calls.length, 1);
  } finally {
    f.store.close();
  }
});
test("changed pack eligibility invalidates a displayed quote atomically without creating an order", async () => {
  const f = fixture(),
    spec = PACK_SPECS[0]!;
  try {
    const lines = [
      { productId: spec.packSkuId, quantity: 1, composition: single(spec) },
    ];
    const q = quote(f, lines);
    publish(f, []);
    const before = JSON.stringify(f.store.read().orders);
    await assert.rejects(
      createWebCheckout(
        f.service,
        input(lines),
        randomUUID(),
        "web",
        "https://fixture.invalid",
        q.quoteRevision,
      ),
    );
    assert.equal(JSON.stringify(f.store.read().orders), before);
    assert.equal(f.calls.length, 0);
  } finally {
    f.store.close();
  }
});

test("paid pack composition and financial snapshots are immutable after published eligibility changes", async () => {
  const f = fixture(),
    spec = PACK_SPECS[0]!;
  try {
    const lines = [
      { productId: spec.packSkuId, quantity: 1, composition: single(spec) },
    ];
    const result = await createWebCheckout(
      f.service,
      input(lines),
      randomUUID(),
      "web",
      "https://fixture.invalid",
    );
    const payment = f.store
      .read()
      .payments.find((p) => p.orderId === result.orderId)!;
    f.paid();
    await f.service.reconcile(payment.id, admin);
    let before = f.store.read();
    assert.equal(
      before.payments.find((p) => p.id === payment.id)!.status,
      "paid",
    );
    assert.match(
      before.operationsEmailNotifications?.[0]?.body ?? "",
      /6 × Sugar/,
    );
    await f.service.reconcile(payment.id, admin);
    assert.equal(f.store.read().operationsEmailNotifications?.length, 1);
    assert.deepEqual(f.store.read().orders, before.orders);
    assert.equal(
      f.store.read().payments[0]!.amountFils,
      before.payments[0]!.amountFils,
    );
    assert.equal(
      f.store.read().payments[0]!.paidAt,
      before.payments[0]!.paidAt,
    );
    before = f.store.read();
    publish(f, []);
    assert.deepEqual(f.store.read().orders, before.orders);
    assert.deepEqual(f.store.read().payments, before.payments);
    const order = before.orders.find((o) => o.id === result.orderId)!;
    assert.ok(ticketSnapshot(order));
    assert.match(preparationText(order.lines[0]!), /Sugar × 6/);
    assert.throws(() =>
      f.service.command(
        { type: "editOrder", id: order.id, version: order.version, lines: [] },
        randomUUID(),
        admin,
      ),
    );
  } finally {
    f.store.close();
  }
});

test("changing only the mix requires a terminal hosted checkout; normalized component ordering replays the same intent", async () => {
  const f = fixture(),
    spec = PACK_SPECS[0]!;
  try {
    const composition = [
      { componentSkuId: spec.components[0]!.componentSkuId, units: 2 },
      { componentSkuId: spec.components[1]!.componentSkuId, units: 4 },
    ];
    const lines = [{ productId: spec.packSkuId, quantity: 1, composition }];
    const key = randomUUID();
    const first = await createWebCheckout(
      f.service,
      input(lines),
      key,
      "web",
      "https://fixture.invalid",
    );
    const reversed = [
      { ...lines[0]!, composition: [...composition].reverse() },
    ];
    const same = await createWebCheckout(
      f.service,
      input(reversed),
      key,
      "web",
      "https://fixture.invalid",
    );
    assert.equal(first.orderId, same.orderId);
    assert.equal(f.calls.length, 1);
    assert.throws(
      () =>
        resumeWebCheckout(f.service, {
          key,
          checkout: input([{ ...lines[0]!, composition: single(spec, 1) }]),
        }),
      /previous payment must be verified/,
    );
    f.expired();
    await f.service.reconcile(f.store.read().payments[0]!.id, admin);
    const changed = resumeWebCheckout(f.service, {
      key,
      checkout: input([{ ...lines[0]!, composition: single(spec, 1) }]),
    });
    assert.equal(changed.changed, true);
    assert.notEqual(changed.key, key);
    assert.equal(f.calls.length, 1);
    assert.ok(
      f.store.read().payments.find((p) => p.orderId === first.orderId)!
        .supersededAt,
    );
    const replacementInput = input([
      { ...lines[0]!, composition: single(spec, 1) },
    ]);
    const fresh = await createWebCheckout(
      f.service,
      replacementInput,
      changed.key,
      "web",
      "https://fixture.invalid",
    );
    const accepted = f.store.read().orders.find((o) => o.id === fresh.orderId)!;
    assert.deepEqual(
      accepted.lines[0]!.composition,
      replacementInput.lines[0]!.composition,
    );
    assert.deepEqual(
      f.store.read().orders.find((o) => o.id === first.orderId)!.lines[0]!
        .composition,
      commerceLineSchema.parse(lines[0]).composition,
    );
    assert.equal(accepted.state, "Awaiting Payment");
    assert.equal(f.calls.length, 2);
  } finally {
    f.store.close();
  }
});

test("inconsistent frozen preparation cannot break ticket preview or acquire current flavor settings", async () => {
  const f = fixture(),
    spec = PACK_SPECS[0]!;
  try {
    const result = await createWebCheckout(
      f.service,
      input([
        { productId: spec.packSkuId, quantity: 1, composition: single(spec) },
      ]),
      randomUUID(),
      "web",
      "https://fixture.invalid",
    );
    const order = f.store.read().orders.find((o) => o.id === result.orderId)!,
      payment = f.store.read().payments.find((p) => p.id === order.paymentId)!;
    for (const badComponents of [
      undefined,
      [],
      [
        {
          componentSkuId: spec.components[0]!.componentSkuId,
          units: 5,
          name: "Stored Sugar",
        },
      ],
    ]) {
      const bad = structuredClone(order);
      Object.assign(bad.lines[0]!.packSnapshot!, { components: badComponents });
      assert.equal(ticketSnapshot(bad), null);
      assert.throws(() => frozenCheckout(bad, payment));
      assert.equal(
        preparationText(bad.lines[0]!),
        "Pack composition review required",
      );
    }
    const count = f.calls[0]!.items as { sku: string; unitprice: number }[];
    assert.equal(count.length, 1);
    assert.equal(count[0]!.sku, spec.packSkuId);
    assert.equal(count[0]!.unitprice, 60);
  } finally {
    f.store.close();
  }
});

test("personalized fixed-price packs preserve each authoritative delivery minimum, included delivery and pickup exemption", () => {
  const f = fixture();
  try {
    for (const minimum of [30, 50, 100, 150, 200, 250, 300]) {
      const zone = f.store
        .read()
        .zones.find((z) => z.active && z.minOrderAed === minimum)!;
      assert.ok(zone, `approved delivery band ${minimum}`);
      for (const spec of PACK_SPECS) {
        for (const quantity of [
          1,
          Math.ceil((minimum * 100) / price(spec.packSkuId)),
        ]) {
          const lines = [
            { productId: spec.packSkuId, quantity, composition: single(spec) },
          ];
          const result = quoteWebCheckout(f.service, {
            lines,
            zoneId: zone.id,
          });
          const subtotal = price(spec.packSkuId) * quantity;
          assert.equal(result.minOrderAed, minimum);
          assert.equal(result.minimumMet, subtotal >= minimum * 100);
          assert.equal(result.eligible, subtotal >= minimum * 100);
          assert.equal(result.totalFils, subtotal);
          if (result.eligible) assert.equal(result.feeFils, 0);
          assert.equal(quote(f, lines).totalFils, subtotal);
        }
      }
    }
    assert.equal(f.calls.length, 0);
  } finally {
    f.store.close();
  }
});
