import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { premiumFixture, premiumInput } from "../fixtures/premium-packs";
import {
  quoteWebCheckout,
  createWebCheckout,
  readWebCheckoutStatus,
  canonicalCartHash,
} from "../../server/domain/web-checkout";
import {
  snapshotTricolor,
  tricolorSpec,
  TRICOLOR_COLORS,
} from "../../shared/tricolor";
import {
  lineKey,
  validPackSnapshot,
  preparationText,
  commerceLineSchema,
  type CommerceLine,
} from "../../shared/pack-composition";
import { frozenCheckout } from "../../server/domain/frozen-checkout";
import { loadBootstrapSources } from "../../server/catalog/bootstrap";
import { planTricolorCatalog } from "../../server/catalog/tricolor-plan";
import {
  catalogDigest,
  revisionFingerprint,
} from "../../server/catalog/contract";
import { hubCommand } from "../../server/catalog/product-hub";
const singles = [
  "conchas-traditional-tricolor-mini-40-g",
  "conchas-traditional-tricolor-individual-70-g",
];
const packs = [
  "conchas-tricolor-pack-3-mini",
  "conchas-tricolor-pack-3-individuales",
];
const prices = [1100, 1300, 3300, 3900];
const prior = process.env.PAN_PACK_PREMIUM_PRICING_ENABLED;
process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = "true";
after(() => {
  if (prior === undefined) delete process.env.PAN_PACK_PREMIUM_PRICING_ENABLED;
  else process.env.PAN_PACK_PREMIUM_PRICING_ENABLED = prior;
});

test("four configurations: authoritative prices, size, exact quantities; premium switch cannot surcharge Tricolor", () => {
  const f = premiumFixture();
  try {
    for (const [i, productId] of [...singles, ...packs].entries()) {
      for (const color of i < 2 ? TRICOLOR_COLORS : [undefined]) {
        const line = { productId, quantity: 2, ...(color ? { color } : {}) };
        assert.equal(
          quoteWebCheckout(f.service, {
            lines: [line],
            fulfillmentMethod: "pickup",
          }).totalFils,
          prices[i]! * 2,
        );
        const packSnapshot = snapshotTricolor(line);
        assert.equal(packSnapshot.capacity, i < 2 ? 1 : 3);
        assert.equal(
          packSnapshot.components.reduce((n, c) => n + c.units, 0) * 2,
          i < 2 ? 2 : 6,
        );
        assert.ok(validPackSnapshot({ ...line, packSnapshot }));
        assert.match(
          preparationText({ ...line, packSnapshot }),
          i < 2 ? /Total physical pieces: 2/ : /Total physical pieces: 6/,
        );
        assert.equal(tricolorSpec(productId)!.grams, i % 2 === 0 ? 40 : 70);
      }
    }
    const lines: CommerceLine[] = [
      { productId: singles[0]!, quantity: 2, color: "red" },
      { productId: singles[1]!, quantity: 2, color: "white" },
      ...packs.map((productId) => ({ productId, quantity: 2 })),
    ];
    assert.equal(
      quoteWebCheckout(f.service, { lines, fulfillmentMethod: "pickup" })
        .totalFils,
      19200,
    );
  } finally {
    f.store.close();
  }
});
test("missing/invalid/cross-product colors and customizable fixed packs rejected before provider calls", () => {
  const f = premiumFixture();
  try {
    for (const line of [
      { productId: singles[0]!, quantity: 1 },
      { productId: packs[0]!, quantity: 1, color: "red" },
      {
        productId: packs[0]!,
        quantity: 1,
        composition: [{ componentSkuId: singles[0]!, units: 3 }],
      },
    ])
      assert.throws(() =>
        quoteWebCheckout(f.service, {
          lines: [line],
          fulfillmentMethod: "pickup",
        }),
      );
    assert.equal(
      commerceLineSchema.safeParse({
        productId: singles[0],
        quantity: 1,
        color: "purple",
      }).success,
      false,
    );
    assert.equal(
      commerceLineSchema.safeParse({
        productId: singles[0],
        quantity: 1,
        color: "red",
        priceFils: 1,
      }).success,
      false,
    );
    assert.equal(f.calls.length, 0);
    const red = { productId: singles[0]!, quantity: 1, color: "red" as const },
      green = { ...red, color: "green" as const };
    assert.notEqual(lineKey(red), lineKey(green));
    assert.notEqual(
      quoteWebCheckout(f.service, { lines: [red], fulfillmentMethod: "pickup" })
        .quoteRevision,
      quoteWebCheckout(f.service, {
        lines: [green],
        fulfillmentMethod: "pickup",
      }).quoteRevision,
    );
    assert.notEqual(
      canonicalCartHash(f.service, {
        lines: [red],
        fulfillmentMethod: "pickup",
      }),
      canonicalCartHash(f.service, {
        lines: [green],
        fulfillmentMethod: "pickup",
      }),
    );
  } finally {
    f.store.close();
  }
});
test("accepted colors and fixed pack contents survive paid checkout, confirmation, HTML/text kitchen email and catalog mutations", async () => {
  const f = premiumFixture();
  try {
    const lines: CommerceLine[] = [
      { productId: singles[0]!, quantity: 2, color: "red" },
      { productId: singles[0]!, quantity: 1, color: "white" },
      { productId: packs[1]!, quantity: 2 },
    ];
    const key = randomUUID();
    const result = await createWebCheckout(
      f.service,
      premiumInput(lines),
      key,
      "web",
      "https://www.3ldubai.ae",
    );
    const p = f.store
      .read()
      .payments.find((p) => p.orderId === result.orderId)!;
    f.paid();
    await f.service.reconcile(p.id, { id: "fixture-admin", role: "admin" });
    const state = f.store.read(),
      o = state.orders.find((o) => o.id === result.orderId)!;
    assert.equal(f.calls.length, 1);
    assert.equal(p.amountFils, 11100);
    assert.deepEqual(
      o.lines.map((l) => l.color),
      ["red", "white", undefined],
    );
    const frozen = frozenCheckout(
      o,
      state.payments.find((x) => x.id === p.id)!,
    );
    assert.equal(frozen.totalFils, 11100);
    assert.equal(o.lines[2]!.packSnapshot!.capacity, 3);
    const email = state.operationsEmailNotifications![0]!;
    assert.match(email.body, /Total physical pieces: 2/);
    assert.match(email.body, /TOTAL: 6 pieces · 2 boxes/);
    for (const color of ["Red", "White", "Green"]) {
      assert.match(email.body, new RegExp(color));
      assert.match(email.html!, new RegExp(color));
    }
    const status = readWebCheckoutStatus(f.service, key);
    assert.deepEqual(
      status.summary!.items.map((l) => l.color),
      ["red", "white", undefined],
    );
    const before = JSON.stringify(o);
    f.store.write((s) => {
      s.catalog!.find((c) => c.id === singles[0])!.priceFils = 9999;
    });
    assert.equal(
      JSON.stringify(f.store.read().orders.find((x) => x.id === o.id)),
      before,
    );
    assert.equal(
      frozenCheckout(
        f.store.read().orders.find((x) => x.id === o.id)!,
        f.store.read().payments.find((x) => x.id === p.id)!,
      ).totalFils,
      11100,
    );
  } finally {
    f.store.close();
  }
});
test("historical single without color remains immutable and requires preparation review; malformed snapshot never invents colors", () => {
  const legacy = { productId: singles[0]!, quantity: 1 };
  assert.equal(validPackSnapshot(legacy), true);
  assert.match(preparationText(legacy), /review required/);
  const line = {
    ...legacy,
    color: "green" as const,
    packSnapshot: snapshotTricolor({ ...legacy, color: "green" }),
  };
  line.packSnapshot.components[0]!.units = 3;
  assert.equal(validPackSnapshot(line), false);
  assert.match(preparationText(line), /review required/);
});
test("targeted Product Hub migration rehearses on isolated SQLite, is revision-bound/idempotent, preserves every unrelated commercial/historical record", () => {
  const f = premiumFixture();
  try {
    // Simulate deployed catalog before the two new packs, with its actual foundation.
    f.store.write((s) => {
      s.catalog = s.catalog!.filter((c) => !packs.includes(c.id));
      s.catalogFoundation!.products = s.catalogFoundation!.products.filter(
        (p) => p.id !== "conchas-tricolor-pack",
      );
      s.catalogFoundation!.variants = s.catalogFoundation!.variants.filter(
        (v) => !packs.includes(v.skuId),
      );
      s.catalogFoundation!.families = s.catalogFoundation!.families.filter(
        (f) => f.id !== "conchas-tricolor-pack",
      );
      const source = loadBootstrapSources(process.cwd()).assets.find(
        (a) =>
          a.sourceId ===
          "3l-conchas-editorial-concha-tradicional-tricolor-mexico",
      )!;
      const oldId = `asset-${catalogDigest(source.sourceId)}`;
      s.catalogFoundation!.products.find(
        (p) => p.id === "conchas-traditional--tricolor",
      )!.media = [{ assetId: oldId, role: "primary", order: 0 }];
      s.catalogFoundation!.assets.push({
        id: oldId,
        version: catalogDigest(source.derivatives),
        alt: {
          en: { name: "Old", description: null, variantLabel: null },
          es: { name: "Old", description: null, variantLabel: null },
          ar: { name: "Old", description: null, variantLabel: null },
        },
        derivatives: source.derivatives.map((d) => ({
          src: d.src,
          format: d.format as "avif" | "webp",
          width: d.width,
          height: d.height,
        })),
      });
      s.catalogFoundation!.variants.find(
        (v) => v.skuId === singles[0],
      )!.operationsName = "Approved historical Tricolor name";
      const { revision: _r, ...meta } = s.catalogFoundation!;
      const hash = revisionFingerprint(meta, s.catalog!);
      s.catalogFoundation!.revision = {
        id: `catalog-v1-${hash}`,
        fingerprint: hash,
        publishedAt: null,
      };
    });
    const before = f.store.read();
    const plan = planTricolorCatalog(
      before,
      loadBootstrapSources(process.cwd()),
    );
    assert.equal(
      plan.commands.filter((c) => c.type === "saveProduct").length,
      2,
    );
    const flags = { enabled: true, publishEnabled: true, publishBlocked: null };
    const actor = { id: "fixture-admin", role: "admin" } as const;
    for (const cmd of plan.commands)
      hubCommand(f.store, actor, randomUUID(), cmd, flags);
    hubCommand(f.store, actor, randomUUID(), plan.publish!, flags);
    const afterState = f.store.read();
    assert.deepEqual(
      afterState.catalog!.filter((c) => !packs.includes(c.id)),
      before.catalog,
    );
    assert.deepEqual(afterState.orders, before.orders);
    assert.deepEqual(afterState.payments, before.payments);
    assert.equal(
      afterState.catalogFoundation!.variants.find(
        (v) => v.skuId === singles[0],
      )!.operationsName,
      "Approved historical Tricolor name",
    );
    assert.deepEqual(
      afterState.catalogFoundation!.packEligibility,
      before.catalogFoundation!.packEligibility,
    );
    assert.deepEqual(
      afterState.catalogFoundation!.assets,
      before.catalogFoundation!.assets,
    );
    assert.deepEqual(
      afterState.catalogFoundation!.categories,
      before.catalogFoundation!.categories,
    );

    assert.equal(
      planTricolorCatalog(afterState, loadBootstrapSources(process.cwd()))
        .commands.length,
      0,
    );
  } finally {
    f.store.close();
  }
});

test("Tricolor pickup and authoritative delivery minima preserve zone rules and base totals", () => {
  const f = premiumFixture();
  try {
    for (const [i, productId] of [...singles, ...packs].entries()) {
      const lines: CommerceLine[] = [
        { productId, quantity: 2, ...(i < 2 ? { color: "red" as const } : {}) },
      ];
      for (const zone of f.store.read().zones.filter((z) => z.active)) {
        const q = quoteWebCheckout(f.service, {
          lines,
          fulfillmentMethod: "delivery",
          zoneId: zone.id,
        });
        assert.equal(q.subtotalFils, prices[i]! * 2);
        assert.equal(q.totalFils, q.subtotalFils);
        assert.equal(q.eligible, q.subtotalFils >= zone.minOrderAed! * 100);
      }
    }
  } finally {
    f.store.close();
  }
});
test("color participates in stale quotes and idempotency; invalid color cannot create any provider checkout", async () => {
  const f = premiumFixture();
  try {
    const lines: CommerceLine[] = [
      { productId: singles[0]!, quantity: 2, color: "red" },
    ];
    const key = randomUUID(),
      input = premiumInput(lines);
    const result = await createWebCheckout(
      f.service,
      input,
      key,
      "web",
      "https://www.3ldubai.ae",
    );
    assert.equal(
      (
        await createWebCheckout(
          f.service,
          input,
          key,
          "web",
          "https://www.3ldubai.ae",
        )
      ).orderId,
      result.orderId,
    );
    await assert.rejects(() =>
      createWebCheckout(
        f.service,
        premiumInput([{ ...lines[0]!, color: "green" }]),
        key,
        "web",
        "https://www.3ldubai.ae",
      ),
    );
    await assert.rejects(() =>
      createWebCheckout(
        f.service,
        premiumInput([{ productId: singles[0]!, quantity: 1 }]),
        randomUUID(),
        "web",
        "https://www.3ldubai.ae",
      ),
    );
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0]!.amount, 22);
  } finally {
    f.store.close();
  }
});
test("migration refuses existing drafts, changed single prices and conflicting pack records", () => {
  const f = premiumFixture();
  try {
    const sources = loadBootstrapSources(process.cwd()),
      base = f.store.read();
    const changed = structuredClone(base);
    changed.catalog!.find((c) => c.id === singles[0])!.priceFils++;
    assert.throws(() => planTricolorCatalog(changed, sources));
    hubCommand(
      f.store,
      { id: "fixture-admin", role: "admin" },
      randomUUID(),
      {
        type: "saveFamily",
        expectedVersion: 0,
        family: { ...base.catalogFoundation!.families[0]! },
      },
      { enabled: true, publishEnabled: true, publishBlocked: null },
    );
    assert.throws(
      () => planTricolorCatalog(f.store.read(), sources),
      /Existing draft/,
    );
  } finally {
    f.store.close();
  }
});
