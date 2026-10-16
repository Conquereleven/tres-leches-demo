import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createWebCheckout,
  quoteWebCheckout,
  resumeWebCheckout,
  readWebCheckoutStatus,
} from "../../server/domain/web-checkout";
import { frozenCheckout } from "../../server/domain/frozen-checkout";
import { activePackRules, packEnabledForSku } from "../../server/domain/packs";
import {
  PAN_PACK_SPECS,
  CONCHAS_PACK_SPECS,
  packEligibilitySchema,
  preparationText,
  lineKey,
} from "../../shared/pack-composition";
import { validateFoundation } from "../../server/catalog/contract";
import { hubCommand, hubView } from "../../server/catalog/product-hub";
import {
  fixture,
  sources,
  single,
  input,
  save,
  publish,
  approvals,
  flags,
  admin,
  manager,
} from "../fixtures/conchas-pack-domain";
const original = {
  pan: process.env.PERSONALIZED_PACKS_ENABLED,
  conchas: process.env.PERSONALIZED_CONCHAS_PACKS_ENABLED,
};
process.env.PERSONALIZED_PACKS_ENABLED = "true";
process.env.PERSONALIZED_CONCHAS_PACKS_ENABLED = "true";
after(() => {
  for (const [key, val] of [
    ["PERSONALIZED_PACKS_ENABLED", original.pan],
    ["PERSONALIZED_CONCHAS_PACKS_ENABLED", original.conchas],
  ]) {
    if (val === undefined) delete process.env[key!];
    else process.env[key!] = val;
  }
});
const price = (id: string) =>
  sources.approved.find((p) => p.id === id)!.priceFils;
const quote = (
  f: ReturnType<typeof fixture>,
  lines: Parameters<typeof input>[0],
) => quoteWebCheckout(f.service, { lines, fulfillmentMethod: "pickup" });
for (const spec of CONCHAS_PACK_SPECS) {
  test(`${spec.packSkuId}: approved identities, exact fixed price, single/all/arbitrary flavors and box multiplication`, () => {
    const f = fixture();
    try {
      const expected =
        spec.family === "traditional"
          ? {
              "6-mini": 6000,
              "12-mini": 11500,
              "6-individuales": 7200,
              "12-individuales": 14000,
            }
          : {
              "6-mini": 10000,
              "12-mini": 19000,
              "6-individuales": 12000,
              "12-individuales": 23500,
            };
      assert.equal(
        price(spec.packSkuId),
        expected[`${spec.capacity}-${spec.size}` as keyof typeof expected],
      );
      for (const c of spec.components) {
        assert.ok(sources.approved.some((p) => p.id === c.componentSkuId));
        assert.equal(
          quote(f, [
            {
              productId: spec.packSkuId,
              quantity: 3,
              composition: [
                { componentSkuId: c.componentSkuId, units: spec.capacity },
              ],
            },
          ]).totalFils,
          price(spec.packSkuId) * 3,
        );
      }
      const all = spec.components.map((c, i) => ({
        componentSkuId: c.componentSkuId,
        units: i === 0 ? spec.capacity - spec.components.length + 1 : 1,
      }));
      assert.equal(
        quote(f, [{ productId: spec.packSkuId, quantity: 1, composition: all }])
          .totalFils,
        price(spec.packSkuId),
      );
      const mix = [
        { componentSkuId: spec.components[0]!.componentSkuId, units: 1 },
        {
          componentSkuId: spec.components[1]!.componentSkuId,
          units: spec.capacity - 1,
        },
      ];
      assert.equal(
        quote(f, [{ productId: spec.packSkuId, quantity: 1, composition: mix }])
          .totalFils,
        price(spec.packSkuId),
      );
      assert.equal(f.calls.length, 0);
    } finally {
      f.store.close();
    }
  });
  test(`${spec.packSkuId}: reject incomplete, malformed, duplicate, wrong-size, cross-filling-family and Pan components`, () => {
    const f = fixture();
    try {
      const c = single(spec)[0]!;
      const other = CONCHAS_PACK_SPECS.find(
        (s) => s.family === spec.family && s.size !== spec.size,
      )!;
      const cross = CONCHAS_PACK_SPECS.find(
        (s) => s.family !== spec.family && s.size === spec.size,
      )!;
      const bad = [
        [],
        [{ ...c, units: spec.capacity - 1 }],
        [{ ...c, units: spec.capacity + 1 }],
        [{ ...c, units: -1 }],
        [{ ...c, units: 1.5 }],
        [c, c],
        [{ ...c, componentSkuId: other.components[0]!.componentSkuId }],
        [{ ...c, componentSkuId: cross.components[0]!.componentSkuId }],
        [
          {
            ...c,
            componentSkuId: PAN_PACK_SPECS[0]!.components[0]!.componentSkuId,
          },
        ],
      ];
      for (const composition of bad)
        assert.throws(() =>
          quote(f, [{ productId: spec.packSkuId, quantity: 1, composition }]),
        );
      assert.equal(f.calls.length, 0);
    } finally {
      f.store.close();
    }
  });
}
test("global Pan gate on plus absent/false/invalid Conchas gate preserves all eight legacy purchases, including accepted checkout", async () => {
  const f = fixture(),
    before = f.store.read().catalog;
  try {
    for (const value of [undefined, "false", "TRUE", "garbage"]) {
      if (value === undefined)
        delete process.env.PERSONALIZED_CONCHAS_PACKS_ENABLED;
      else process.env.PERSONALIZED_CONCHAS_PACKS_ENABLED = value;
      for (const spec of CONCHAS_PACK_SPECS) {
        assert.equal(packEnabledForSku(spec.packSkuId), false);
        assert.equal(
          quote(f, [{ productId: spec.packSkuId, quantity: 1 }]).totalFils,
          price(spec.packSkuId),
        );
        assert.throws(() =>
          quote(f, [
            {
              productId: spec.packSkuId,
              quantity: 1,
              composition: single(spec),
            },
          ]),
        );
      }
      assert.ok(
        quote(f, [
          {
            productId: PAN_PACK_SPECS[0]!.packSkuId,
            quantity: 1,
            composition: single(PAN_PACK_SPECS[0]!),
          },
        ]).eligible,
      );
    }
    const s = CONCHAS_PACK_SPECS[0]!;
    const accepted = await createWebCheckout(
      f.service,
      input([{ productId: s.packSkuId, quantity: 1 }]),
      randomUUID(),
      "web",
      "https://fixture.invalid",
    );
    assert.equal(accepted.amountFils, 6000);
    assert.equal(f.store.read().orders[0]!.lines[0]!.composition, undefined);
    assert.deepEqual(f.store.read().catalog, before);
  } finally {
    process.env.PERSONALIZED_CONCHAS_PACKS_ENABLED = "true";
    f.store.close();
  }
});
test("Conchas gate operates independently of Pan and still requires explicit published pack-production eligibility", () => {
  const f = fixture([]),
    spec = CONCHAS_PACK_SPECS[0]!;
  try {
    process.env.PERSONALIZED_PACKS_ENABLED = "false";
    assert.equal(packEnabledForSku(spec.packSkuId), true);
    assert.equal(packEnabledForSku(PAN_PACK_SPECS[0]!.packSkuId), false);
    assert.throws(() =>
      quote(f, [
        { productId: spec.packSkuId, quantity: 1, composition: single(spec) },
      ]),
    );
    assert.ok(
      quote(f, [{ productId: PAN_PACK_SPECS[0]!.packSkuId, quantity: 1 }])
        .eligible,
    );
    save(f, [
      {
        packSkuId: spec.packSkuId,
        componentSkuIds: spec.components.map((c) => c.componentSkuId),
      },
    ]);
    assert.throws(() =>
      quote(f, [
        { productId: spec.packSkuId, quantity: 1, composition: single(spec) },
      ]),
    );
    publish(f);
    assert.ok(
      quote(f, [
        { productId: spec.packSkuId, quantity: 1, composition: single(spec) },
      ]).eligible,
    );
  } finally {
    process.env.PERSONALIZED_PACKS_ENABLED = "true";
    f.store.close();
  }
});
test("existing eight-rule revisions remain identical; sixteen-rule drafts are private, admin-only, audited and do not reactivate retail fillings", () => {
  const panRules = approvals().filter((r) =>
      r.packSkuId.startsWith("pan-de-muerto-"),
    ),
    f = fixture(panRules);
  try {
    const before = f.store.read(),
      fp = before.catalogFoundation!.revision.fingerprint;
    assert.equal(
      validateFoundation(before.catalogFoundation, before.catalog!).revision
        .fingerprint,
      fp,
    );
    assert.equal(packEligibilitySchema.parse(panRules).length, 8);
    assert.equal(packEligibilitySchema.parse(approvals()).length, 16);
    assert.equal(
      packEligibilitySchema.safeParse([...approvals(), approvals()[0]!])
        .success,
      false,
    );
    save(f, approvals());
    assert.deepEqual(
      f.store.read().catalogFoundation,
      before.catalogFoundation,
    );
    const view = hubView(f.store.read(), admin, flags);
    assert.ok(view.available);
    for (const role of ["manager", "operator", "agent"] as const)
      assert.throws(
        () =>
          hubCommand(
            f.store,
            { ...manager, role },
            randomUUID(),
            {
              type: "publish",
              expectedVersion: view.version,
              expectedPublishedRevision: view.published.id,
            },
            flags,
          ),
        { status: 403 },
      );
    publish(f);
    assert.equal(f.store.read().catalogFoundation!.packEligibility!.length, 16);
    assert.deepEqual(f.store.read().catalog, before.catalog);
    for (const row of before.catalog!.filter(
      (p) =>
        p.id.startsWith("conchas-filled-") &&
        !p.id.includes("pack-") &&
        !p.id.includes("pistache"),
    )) {
      assert.equal(row.active, false);
      assert.equal(row.availability, "unavailable");
    }
    assert.ok(
      f.store
        .read()
        .productHub!.history.some((h) => h.action === "draft.packEligibility"),
    );
  } finally {
    f.store.close();
  }
});
test("disabled Conchas approvals do not invalidate existing Pan quote revisions", () => {
  const f = fixture(
      approvals().filter((r) => r.packSkuId.startsWith("pan-de-muerto-")),
    ),
    p = PAN_PACK_SPECS[0]!;
  try {
    process.env.PERSONALIZED_CONCHAS_PACKS_ENABLED = "false";
    const lines = [
        { productId: p.packSkuId, quantity: 1, composition: single(p) },
      ],
      before = quote(f, lines).quoteRevision;
    save(f, approvals());
    publish(f);
    assert.equal(quote(f, lines).quoteRevision, before);
    assert.equal(activePackRules(f.store.read()).length, 8);
  } finally {
    process.env.PERSONALIZED_CONCHAS_PACKS_ENABLED = "true";
    f.store.close();
  }
});
test("same Conchas SKU, different mixes: idempotency, normalized retry, stale rules, immutable paid preparation and flag-off reconciliation", async () => {
  const f = fixture(),
    s = CONCHAS_PACK_SPECS.find(
      (p) =>
        p.family === "filled" && p.size === "individuales" && p.capacity === 12,
    )!;
  try {
    const mixes = [
        { productId: s.packSkuId, quantity: 2, composition: single(s, 0) },
        { productId: s.packSkuId, quantity: 1, composition: single(s, 4) },
      ],
      key = randomUUID();
    assert.notEqual(lineKey(mixes[0]!), lineKey(mixes[1]!));
    const initial = await createWebCheckout(
      f.service,
      input(mixes),
      key,
      "web",
      "https://fixture.invalid",
    );
    const replay = await createWebCheckout(
      f.service,
      input(mixes),
      key,
      "web",
      "https://fixture.invalid",
    );
    assert.equal(initial.orderId, replay.orderId);
    assert.equal(f.calls.length, 1);
    assert.equal(initial.amountFils, 70500);
    const stale = quote(f, [mixes[0]!]).quoteRevision;
    f.paid();
    const order = f.store.read().orders.find((o) => o.id === initial.orderId)!;
    await f.service.reconcile(order.paymentId!, admin);
    const accepted = structuredClone(
      f.store.read().orders.find((o) => o.id === order.id)!,
    );
    assert.equal(
      frozenCheckout(
        accepted,
        f.store.read().payments.find((p) => p.id === order.paymentId)!,
      ).items.length,
      2,
    );
    assert.match(
      preparationText(accepted.lines[0]!),
      /Diplomat cream \(vanilla\) × 12/,
    );
    save(
      f,
      approvals().map((r) =>
        r.packSkuId === s.packSkuId
          ? {
              ...r,
              componentSkuIds: r.componentSkuIds.filter(
                (id) => id !== s.components[0]!.componentSkuId,
              ),
            }
          : r,
      ),
    );
    publish(f);
    await assert.rejects(
      createWebCheckout(
        f.service,
        input([mixes[0]!]),
        randomUUID(),
        "web",
        "https://fixture.invalid",
        stale,
      ),
    );
    assert.equal(f.calls.length, 1);
    process.env.PERSONALIZED_CONCHAS_PACKS_ENABLED = "false";
    assert.equal(readWebCheckoutStatus(f.service, key).paymentStatus, "paid");
    assert.equal(
      resumeWebCheckout(f.service, { key, checkout: input(mixes) }).changed,
      false,
    );
    assert.deepEqual(
      f.store.read().orders.find((o) => o.id === order.id),
      accepted,
    );
  } finally {
    process.env.PERSONALIZED_CONCHAS_PACKS_ENABLED = "true";
    f.store.close();
  }
});
