import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { Store, seed } from "../../server/db/store";
import type { Actor, State } from "../../server/domain/model";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import { validateFoundation } from "../../server/catalog/contract";
import { publicCatalog } from "../../server/catalog/read-api";
import {
  hubCommand,
  hubFlags,
  hubMediaAccess,
  hubUpload,
  hubView,
  inspectImage,
  type HubFlags,
} from "../../server/catalog/product-hub";
import { RETIRED_SKUS } from "../../shared/commerce-policy";

const sources = loadBootstrapSources(process.cwd());
const admin: Actor = { id: "liza", role: "admin" };
const manager: Actor = { id: "manager-1", role: "manager" };
const operator: Actor = { id: "operator-1", role: "operator" };
const agent: Actor = { id: "agent-1", role: "agent" };
const ON: HubFlags = {
  enabled: true,
  publishEnabled: true,
  publishBlocked: null,
};
const EDIT_ONLY: HubFlags = {
  enabled: true,
  publishEnabled: false,
  publishBlocked: "Publication is disabled in this environment",
};
const key = () => randomUUID();

function initial(): State {
  const state = seed();
  state.catalog = structuredClone(sources.approved);
  const plan = planCatalogBootstrap(state.catalog, sources);
  assert.equal(plan.report.valid, true);
  state.catalogFoundation = plan.foundation;
  return state;
}
function setup(path = ":memory:") {
  const store = new Store(
    path,
    "test",
    path === ":memory:" ? initial() : undefined,
  );
  if (path !== ":memory:" && !store.read().catalogFoundation)
    store.write((s) => Object.assign(s, initial()));
  const view = (actor: Actor = admin, flags: HubFlags = ON) => {
    const v = hubView(store.read(), actor, flags);
    assert.equal(v.available, true);
    return v as Extract<typeof v, { available: true }>;
  };
  return { store, view };
}
type View = ReturnType<ReturnType<typeof setup>["view"]>;
type Product = View["products"][number];
/** The editor's own payload for a product, as the UI would send it back. */
const payload = (p: Product) => ({
  product: {
    id: p.id,
    slug: p.slug,
    familyId: p.familyId!,
    categoryId: p.categoryId!,
    name: p.name,
    description: p.description,
    commercialState: p.commercialState,
    translations: p.translations,
    media: p.media,
  },
  variants: p.variants.map((v) => ({
    skuId: v.skuId,
    flavor: v.flavor,
    size: v.size,
    packQuantity: v.packQuantity,
    commercialState: v.commercialState,
    translations: v.translations,
    media: v.media,
    catalogName: v.catalogName,
    priceFils: v.priceFils,
    active: v.active,
    availability: v.availability,
  })),
});
const empty = { name: null, description: null, variantLabel: null };
const azucar = (v: View) =>
  v.products.find((p) => p.id === "pan-de-muerto-traditional--azucar")!;
/** A real PNG of the given size (valid signature, IHDR and data). */
function png(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc(64))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("flags: editor and publication are off by default and publication is refused in Production", () => {
  assert.deepEqual(hubFlags({}), {
    enabled: false,
    publishEnabled: false,
    publishBlocked: "Product Hub is disabled",
  });
  assert.equal(hubFlags({ PRODUCT_HUB_ENABLED: "true" }).publishEnabled, false);
  // Staging runs with NODE_ENV=production; its name, not that, decides.
  for (const env of [
    { APP_ENV: "staging", NODE_ENV: "production" },
    { APP_ENV: "test" },
    { APP_ENV: "development" },
  ])
    assert.equal(
      hubFlags({
        PRODUCT_HUB_ENABLED: "true",
        PRODUCT_HUB_PUBLISH_ENABLED: "true",
        ...env,
      }).publishEnabled,
      true,
    );
  // Production, and any environment that does not say what it is.
  for (const env of [
    { APP_ENV: "production" },
    { APP_ENV: "production", NODE_ENV: "production" },
    { NODE_ENV: "production" },
    { APP_ENV: "prod" },
    {},
  ]) {
    const flags = hubFlags({
      PRODUCT_HUB_ENABLED: "true",
      PRODUCT_HUB_PUBLISH_ENABLED: "true",
      ...env,
    });
    assert.equal(flags.enabled, true);
    assert.equal(flags.publishEnabled, false);
    assert.match(flags.publishBlocked!, /Production/);
  }
});

test("view reconciles with every existing catalog id and never exposes a second price list", () => {
  const { store, view } = setup();
  try {
    const v = view();
    const state = store.read();
    const skus = v.products.flatMap((p) => p.variants);
    assert.equal(skus.length, state.catalog!.length);
    assert.deepEqual(
      skus.map((s) => s.skuId).sort(),
      state.catalog!.map((c) => c.id).sort(),
    );
    for (const s of skus) {
      const c = state.catalog!.find((x) => x.id === s.skuId)!;
      assert.equal(s.priceFils, c.priceFils);
      assert.equal(s.active, c.active !== false);
      assert.equal(s.existing, true);
      assert.equal(s.retired, RETIRED_SKUS.has(s.skuId));
    }
    assert.equal(v.draft, null);
    assert.deepEqual(v.changes, []);
    assert.equal(v.published.id, state.catalogFoundation!.revision.id);
    // No draft is created just by looking.
    assert.equal(store.read().productHub, undefined);
  } finally {
    store.close();
  }
});

test("RBAC: managers read only; operators and agents get nothing; every write needs an admin", () => {
  const { store, view } = setup();
  try {
    assert.equal(view(manager).permissions.canEdit, false);
    assert.equal(view(manager).permissions.canPublish, false);
    assert.equal(view(admin).permissions.canEdit, true);
    assert.equal(view(admin, EDIT_ONLY).permissions.canPublish, false);
    for (const actor of [operator, agent])
      assert.throws(() => hubView(store.read(), actor, ON), { status: 403 });
    const before = JSON.stringify(store.read());
    const cmd = {
      type: "saveProduct",
      expectedVersion: 0,
      ...payload(azucar(view())),
    };
    for (const actor of [manager, operator, agent]) {
      assert.throws(() => hubCommand(store, actor, key(), cmd, ON), {
        status: 403,
      });
      assert.throws(
        () =>
          hubCommand(
            store,
            actor,
            key(),
            {
              type: "publish",
              expectedVersion: 0,
              expectedPublishedRevision: view().published.id,
            },
            ON,
          ),
        { status: 403 },
      );
      assert.throws(
        () =>
          hubUpload(
            store,
            actor,
            key(),
            png(400, 400),
            "image/png",
            { expectedVersion: 0, alt: { en: empty, es: empty, ar: empty } },
            ON,
          ),
        { status: 403 },
      );
    }
    assert.equal(JSON.stringify(store.read()), before);
    // Disabled feature: even an admin cannot write.
    assert.throws(() => hubCommand(store, admin, key(), cmd, hubFlags({})), {
      status: 404,
    });
  } finally {
    store.close();
  }
});

test("edit price and availability in a draft: saved, reloaded, compared, and invisible to checkout until published", () => {
  const { store, view } = setup();
  try {
    const live = store.read();
    const p = payload(azucar(view()));
    const priced = p.variants.find((x) => x.skuId.includes("individual"))!;
    const paused = p.variants.find((x) => x.skuId.includes("mini"))!;
    assert.equal(priced.priceFils, 1500);
    priced.priceFils = 1700;
    paused.availability = "unavailable";
    p.product.description = "Classic sugar-dusted bread.";
    const saved = hubCommand(
      store,
      admin,
      key(),
      { type: "saveProduct", expectedVersion: 0, ...p },
      ON,
    ) as { version: number };
    assert.equal(saved.version, 1);
    const v = view();
    assert.equal(v.version, 1);
    assert.equal(v.draft!.updatedBy, "liza");
    assert.equal(v.draft!.stale, false);
    const edited = azucar(v);
    assert.equal(edited.changed, true);
    assert.equal(
      edited.variants.find((x) => x.skuId === priced.skuId)!.priceFils,
      1700,
    );
    assert.equal(
      edited.variants.find((x) => x.skuId === paused.skuId)!.availability,
      "unavailable",
    );
    assert.deepEqual(
      v.changes.map((c) => [c.kind, c.field, c.before, c.after]).sort(),
      [
        ["availability", "availability", "available", "unavailable"],
        ["price", "price", "AED 15.00", "AED 17.00"],
        ["product", "description", null, "Classic sugar-dusted bread."],
      ].sort(),
    );
    // The published catalog, and therefore checkout and the public read model, is unchanged.
    assert.deepEqual(store.read().catalog, live.catalog);
    assert.deepEqual(store.read().catalogFoundation, live.catalogFoundation);
    assert.equal(
      publicCatalog(store.read(), {
        slug: "pan-de-muerto-traditional--azucar",
      }).products[0]!.variants.find((x) => x.skuId === priced.skuId)!.priceFils,
      1500,
    );
  } finally {
    store.close();
  }
});

test("create a product with new SKUs, EN/ES/AR content and a draft status", () => {
  const { store, view } = setup();
  try {
    const base = azucar(view());
    const content = (name: string) => ({
      name,
      description: `${name}.`,
      variantLabel: null,
    });
    const created = {
      product: {
        id: "pan-de-muerto-traditional--canela",
        slug: "pan-de-muerto-traditional--canela",
        familyId: base.familyId!,
        categoryId: base.categoryId!,
        name: "Canela Pan de Muerto tradicional",
        description: "Cinnamon sugar.",
        commercialState: "draft" as const,
        translations: {
          en: content("Cinnamon Pan de Muerto"),
          es: content("Pan de Muerto de canela"),
          ar: content("خبز الموتى بالقرفة"),
        },
        media: base.media,
      },
      variants: [
        {
          skuId: "pan-de-muerto-traditional-canela-mini-40-g",
          flavor: "Canela",
          size: "Mini · 40 g",
          packQuantity: null,
          commercialState: "draft" as const,
          translations: { en: empty, es: empty, ar: empty },
          media: [],
          catalogName: "Pan de Muerto tradicional · Canela · Mini · 40 g",
          priceFils: 1300,
          active: false,
          availability: "available" as const,
        },
      ],
    };
    hubCommand(
      store,
      admin,
      key(),
      { type: "saveProduct", expectedVersion: 0, ...created },
      ON,
    );
    const v = view();
    const p = v.products.find((x) => x.id === created.product.id)!;
    assert.equal(p.isNew, true);
    assert.equal(p.translations.ar.name, "خبز الموتى بالقرفة");
    assert.equal(p.variants[0]!.existing, false);
    assert.equal(p.variants[0]!.priceFils, 1300);
    assert.ok(
      v.changes.some((c) => c.kind === "product" && c.field === "created"),
    );
    assert.ok(
      v.changes.some((c) => c.kind === "variant" && c.field === "created"),
    );
    assert.deepEqual(
      v.issues.filter((i) => i.level === "error"),
      [],
    );
    // Not in the published catalog yet.
    assert.ok(
      !store.read().catalog!.some((c) => c.id === created.variants[0]!.skuId),
    );
  } finally {
    store.close();
  }
});

test("variant, SKU, price and content validation rejects bad input and writes nothing", () => {
  const { store, view } = setup();
  try {
    const v = view();
    const base = payload(azucar(v));
    const other = v.products.find(
      (p) => p.id === "pan-de-muerto-traditional--ajonjoli",
    )!;
    const before = JSON.stringify(store.read());
    const attempt = (mutate: (p: typeof base) => void, status = 422) => {
      const p = structuredClone(base);
      mutate(p);
      assert.throws(
        () =>
          hubCommand(
            store,
            admin,
            key(),
            { type: "saveProduct", expectedVersion: 0, ...p },
            ON,
          ),
        (e: { status?: number; name?: string }) =>
          status === 400 ? e.name === "ZodError" : e.status === status,
      );
      assert.equal(JSON.stringify(store.read()), before);
    };
    attempt((p) => p.variants.pop()); // deleting an existing SKU
    attempt((p) => (p.variants[0]!.skuId = other.variants[0]!.skuId)); // SKU of another product
    attempt((p) => (p.variants[1]!.skuId = p.variants[0]!.skuId)); // duplicate SKU
    attempt((p) => (p.product.slug = other.slug)); // slug collision
    attempt((p) => (p.product.slug = "renamed-slug")); // published slug is stable
    attempt((p) => (p.product.familyId = "conchas-traditional")); // family of another category
    attempt((p) => (p.product.categoryId = "nope"));
    attempt((p) =>
      p.product.media.push({
        assetId: "missing-asset",
        role: "gallery",
        order: 9,
      }),
    );
    attempt((p) => {
      p.product.commercialState = "draft";
    }); // published variants under a draft product
    // Schema-level: integer fils only, positive, bounded; strict objects; bounded text.
    attempt((p) => (p.variants[0]!.priceFils = 12.5), 400);
    attempt((p) => (p.variants[0]!.priceFils = 0), 400);
    attempt((p) => (p.variants[0]!.priceFils = -100), 400);
    attempt((p) => (p.variants[0]!.priceFils = 10_000_001), 400);
    attempt((p) => (p.variants[0]!.skuId = "bad id with spaces"), 400);
    attempt((p) => (p.product.name = "x".repeat(301)), 400);
    attempt((p) => ((p.product as Record<string, unknown>).priceFils = 1), 400);
    attempt(
      (p) => ((p.product.translations as Record<string, unknown>).fr = empty),
      400,
    );
    attempt(
      (p) => ((p.product.translations.ar as Record<string, unknown>).name = ""),
      400,
    );
    // A removed combination can never be made sellable again: it cannot be
    // attached to a product, and a draft that activates it cannot be published.
    const retiredSku = [...RETIRED_SKUS][0]!;
    attempt((p) =>
      p.variants.push({ ...p.variants[0]!, skuId: retiredSku, active: true }),
    );
    hubCommand(
      store,
      admin,
      key(),
      { type: "saveProduct", expectedVersion: 0, ...base },
      ON,
    );
    store.write((s) => {
      s.productHub!.draft!.catalog.find((c) => c.id === retiredSku)!.active =
        true;
    });
    const tampered = view();
    assert.ok(
      tampered.issues.some(
        (i) => i.level === "error" && i.code === "sku-retired",
      ),
    );
    assert.throws(
      () =>
        hubCommand(
          store,
          admin,
          key(),
          {
            type: "publish",
            expectedVersion: 1,
            expectedPublishedRevision: tampered.published.id,
          },
          ON,
        ),
      { status: 422 },
    );
    assert.equal(
      store.read().catalog!.find((c) => c.id === retiredSku)!.active,
      false,
    );
  } finally {
    store.close();
  }
});

test("idempotency and concurrent edits: replays return the same result, stale versions are refused", () => {
  const { store, view } = setup();
  try {
    const p = payload(azucar(view()));
    p.variants[0]!.priceFils = 1600;
    const k = key();
    const cmd = { type: "saveProduct", expectedVersion: 0, ...p };
    const first = hubCommand(store, admin, k, cmd, ON);
    const afterFirst = JSON.stringify(store.read());
    assert.deepEqual(hubCommand(store, admin, k, cmd, ON), first);
    assert.equal(JSON.stringify(store.read()), afterFirst);
    // Same key, different body.
    const q = structuredClone(p);
    q.variants[0]!.priceFils = 1900;
    assert.throws(
      () =>
        hubCommand(
          store,
          admin,
          k,
          { type: "saveProduct", expectedVersion: 1, ...q },
          ON,
        ),
      { status: 409 },
    );
    // A second editor still holding version 0 loses.
    assert.throws(
      () =>
        hubCommand(
          store,
          { id: "admin-2", role: "admin" },
          key(),
          { type: "saveProduct", expectedVersion: 0, ...q },
          ON,
        ),
      { status: 409 },
    );
    assert.equal(azucar(view()).variants[0]!.priceFils, 1600);
    assert.throws(() => hubCommand(store, admin, "short", cmd, ON), {
      status: 400,
    });
    assert.equal(JSON.stringify(store.read()), afterFirst);
  } finally {
    store.close();
  }
});

test("publish: admin only, flag-gated, atomic, audited; orders and payments are byte-identical", () => {
  const { store, view } = setup();
  try {
    // An accepted order and its payment exist before the catalog changes.
    store.write((s) => {
      s.orders.push({
        id: "TL-HIST0001",
        conversationId: "c",
        state: "Confirmed",
        version: 3,
        lines: [
          {
            productId: "pan-de-muerto-traditional-azucar-individual-70-g",
            name: "Azúcar",
            quantity: 2,
            unitPriceFils: 1500,
          },
        ],
        quote: null,
        paymentId: "pay-hist-1",
        audit: [],
      } as never);
      s.payments.push({
        id: "pay-hist-1",
        orderId: "TL-HIST0001",
        amountFils: 3000,
        currency: "AED",
        provider: "paymennt",
        status: "paid",
        createdAt: "2026-10-09T10:00:00.000Z",
        updatedAt: "2026-10-09T10:00:00.000Z",
        timeline: [],
      } as never);
    });
    const business = () => {
      const { orders, payments, zones, conversations } = store.read();
      return JSON.stringify({ orders, payments, zones, conversations });
    };
    const beforeBusiness = business();
    const p = payload(azucar(view()));
    const sku = p.variants.find((v) => v.skuId.includes("individual"))!;
    sku.priceFils = 1800;
    hubCommand(
      store,
      admin,
      key(),
      { type: "saveProduct", expectedVersion: 0, ...p },
      ON,
    );
    const reviewed = view();
    const publish = {
      type: "publish",
      expectedVersion: 1,
      expectedPublishedRevision: reviewed.published.id,
    };
    // Flag off: refused, nothing changes.
    const drafted = JSON.stringify(store.read());
    assert.throws(() => hubCommand(store, admin, key(), publish, EDIT_ONLY), {
      status: 403,
    });
    assert.throws(() => hubCommand(store, manager, key(), publish, ON), {
      status: 403,
    });
    assert.equal(JSON.stringify(store.read()), drafted);
    const result = hubCommand(store, admin, key(), publish, ON) as {
      revision: string;
      changes: number;
    };
    const s = store.read();
    assert.equal(s.catalog!.find((c) => c.id === sku.skuId)!.priceFils, 1800);
    assert.equal(s.catalogFoundation!.revision.id, result.revision);
    assert.notEqual(result.revision, reviewed.published.id);
    assert.ok(s.catalogFoundation!.revision.publishedAt);
    // The published pair is self-consistent under the V1 contract.
    validateFoundation(s.catalogFoundation, s.catalog!);
    assert.equal(s.productHub!.draft, undefined);
    assert.equal(
      business(),
      beforeBusiness,
      "orders, payments, zones and conversations untouched",
    );
    assert.equal(
      s.payments[0]!.amountFils,
      3000,
      "the accepted payment keeps the amount it was charged",
    );
    const last = s.productHub!.history.at(-1)!;
    assert.deepEqual(
      [last.action, last.actor, last.fromRevision, last.toRevision],
      ["publish", "liza", reviewed.published.id, result.revision],
    );
    assert.match(s.audit.at(-1)!.action, /Product Hub: catalog published/);
    assert.equal(s.audit.at(-1)!.actor, "liza");
    // Checkout's read model now quotes the published price.
    assert.equal(
      publicCatalog(s, {
        slug: "pan-de-muerto-traditional--azucar",
      }).products[0]!.variants.find((v) => v.skuId === sku.skuId)!.priceFils,
      1800,
    );
    assert.equal(view().changes.length, 0);
    assert.throws(
      () =>
        hubCommand(
          store,
          admin,
          key(),
          {
            ...publish,
            expectedVersion: 2,
            expectedPublishedRevision: result.revision,
          },
          ON,
        ),
      { status: 409 },
    );
  } finally {
    store.close();
  }
});

test("publish refuses a stale base: the published catalog changed under the draft", () => {
  const { store, view } = setup();
  try {
    const p = payload(azucar(view()));
    p.variants[0]!.priceFils = 1600;
    hubCommand(
      store,
      admin,
      key(),
      { type: "saveProduct", expectedVersion: 0, ...p },
      ON,
    );
    const reviewed = view().published.id;
    // A tool changes a published price without republishing the foundation:
    // the editor fails closed instead of showing a revision that no longer matches.
    const other = store
      .read()
      .catalog!.find((c) => c.id !== p.variants[0]!.skuId)!.id;
    store.write((s) => {
      s.catalog!.find((c) => c.id === other)!.priceFils += 100;
    });
    assert.throws(() => hubView(store.read(), admin, ON), { status: 503 });
    assert.throws(
      () =>
        hubCommand(
          store,
          admin,
          key(),
          { type: "discardDraft", expectedVersion: 1 },
          ON,
        ),
      { status: 503 },
    );
    store.write((s) => {
      s.catalog!.find((c) => c.id === other)!.priceFils -= 100;
    });
    // A legitimate republish by another session: the base moves on.
    store.write((s) => {
      s.productHub!.draft!.baseRevisionId = `catalog-v1-${"0".repeat(64)}`;
    });
    assert.equal(view().draft!.stale, true);
    const drafted = JSON.stringify(store.read());
    assert.throws(
      () =>
        hubCommand(
          store,
          admin,
          key(),
          {
            type: "publish",
            expectedVersion: 1,
            expectedPublishedRevision: reviewed,
          },
          ON,
        ),
      { status: 409 },
    );
    assert.equal(JSON.stringify(store.read()), drafted);
    // Discarding is the way out, and it is audited.
    hubCommand(
      store,
      admin,
      key(),
      { type: "discardDraft", expectedVersion: 1 },
      ON,
    );
    assert.equal(view().draft, null);
    assert.equal(
      store.read().productHub!.history.at(-1)!.action,
      "draft.discard",
    );
  } finally {
    store.close();
  }
});

test("failed publication recovers: validation errors block it and the draft survives intact", () => {
  const { store, view } = setup();
  try {
    const p = payload(azucar(view()));
    p.variants[0]!.priceFils = 1600;
    hubCommand(
      store,
      admin,
      key(),
      { type: "saveProduct", expectedVersion: 0, ...p },
      ON,
    );
    const victim = store
      .read()
      .catalog!.find((c) => c.id !== p.variants[0]!.skuId)!.id;
    // Corrupt the draft the way a bug or bad migration could: a SKU vanishes.
    store.write((s) => {
      s.productHub!.draft!.catalog = s.productHub!.draft!.catalog.filter(
        (c) => c.id !== victim,
      );
    });
    const broken = JSON.stringify(store.read());
    const v = view();
    assert.ok(
      v.issues.some((i) => i.level === "error" && i.code === "sku-removed"),
    );
    assert.throws(
      () =>
        hubCommand(
          store,
          admin,
          key(),
          {
            type: "publish",
            expectedVersion: 1,
            expectedPublishedRevision: v.published.id,
          },
          ON,
        ),
      { status: 422 },
    );
    assert.equal(
      JSON.stringify(store.read()),
      broken,
      "a refused publication changes nothing",
    );
    assert.ok(store.read().catalog!.some((c) => c.id === victim));
    // Repair and publish.
    store.write((s) => {
      s.productHub!.draft!.catalog.push(
        structuredClone(s.catalog!.find((c) => c.id === victim)!),
      );
    });
    hubCommand(
      store,
      admin,
      key(),
      {
        type: "publish",
        expectedVersion: 1,
        expectedPublishedRevision: v.published.id,
      },
      ON,
    );
    assert.equal(
      store.read().catalog!.find((c) => c.id === p.variants[0]!.skuId)!
        .priceFils,
      1600,
    );
  } finally {
    store.close();
  }
});

test("images: only real PNG, JPEG, WebP or AVIF of sane size are accepted, stored once and access-controlled", () => {
  const { store, view } = setup();
  try {
    const alt = {
      en: { name: "Sugar bread", description: null, variantLabel: null },
      es: { name: "Pan de azúcar", description: null, variantLabel: null },
      ar: { name: "خبز بالسكر", description: null, variantLabel: null },
    };
    const meta = { expectedVersion: 0, alt };
    const before = JSON.stringify(store.read());
    const refuse = (bytes: Buffer, type: string, status: number) => {
      assert.throws(
        () => hubUpload(store, admin, key(), bytes, type, meta, ON),
        { status },
      );
      assert.equal(JSON.stringify(store.read()), before);
    };
    refuse(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'.padEnd(
          64,
        ),
      ),
      "image/svg+xml",
      415,
    );
    refuse(Buffer.from("GIF89a".padEnd(64)), "image/gif", 415);
    refuse(
      Buffer.from("<html><script>x</script></html>".padEnd(64)),
      "image/png",
      415,
    );
    refuse(png(400, 400), "image/jpeg", 415); // declared type does not match the bytes
    refuse(png(50, 400), "image/png", 422); // too small
    refuse(png(7000, 400), "image/png", 422); // too large
    refuse(
      Buffer.concat([png(400, 400), Buffer.alloc(3 * 1024 * 1024)]),
      "image/png",
      413,
    );
    refuse(Buffer.alloc(0), "image/png", 413);
    assert.deepEqual(inspectImage(png(800, 600)), {
      type: "image/png",
      ext: "png",
      width: 800,
      height: 600,
    });
    const bytes = png(800, 800);
    const k = key();
    const result = hubUpload(store, admin, k, bytes, "image/png", meta, ON) as {
      assetId: string;
      version: number;
    };
    assert.deepEqual(
      hubUpload(store, admin, k, bytes, "image/png", meta, ON),
      result,
      "replay is idempotent",
    );
    const asset = view().assets.find((a) => a.id === result.assetId)!;
    assert.match(
      asset.derivatives[0]!.src,
      /^\/brand\/hub\/[a-f0-9]{64}\.png$/,
    );
    assert.equal(
      asset.version,
      asset.derivatives[0]!.src.slice(11, 75),
      "version is the content hash: a new image is a new URL",
    );
    assert.equal(asset.alt.ar.name, "خبز بالسكر");
    const sha = asset.version;
    assert.deepEqual(store.getMedia(sha)!.bytes, bytes);
    assert.equal(store.getMedia("f".repeat(64)), null);
    // Draft image: staff only. Published image: public.
    assert.equal(hubMediaAccess(store.read(), sha, null), null);
    assert.equal(hubMediaAccess(store.read(), sha, operator), null);
    assert.equal(hubMediaAccess(store.read(), sha, manager), "private");
    assert.throws(
      () =>
        hubUpload(
          store,
          admin,
          key(),
          bytes,
          "image/png",
          { ...meta, expectedVersion: 1 },
          ON,
        ),
      { status: 409 },
    );
    // Attach it to a product, edit its alt text, publish.
    const p = payload(azucar(view()));
    p.product.media = [
      ...p.product.media,
      { assetId: result.assetId, role: "gallery", order: 40 },
    ];
    hubCommand(
      store,
      admin,
      key(),
      { type: "saveProduct", expectedVersion: 1, ...p },
      ON,
    );
    hubCommand(
      store,
      admin,
      key(),
      {
        type: "saveAsset",
        expectedVersion: 2,
        asset: {
          id: result.assetId,
          alt: { ...alt, en: { ...alt.en, name: "Sugar Pan de Muerto" } },
        },
      },
      ON,
    );
    hubCommand(
      store,
      admin,
      key(),
      {
        type: "publish",
        expectedVersion: 3,
        expectedPublishedRevision: view().published.id,
      },
      ON,
    );
    assert.equal(hubMediaAccess(store.read(), sha, null), "public");
    assert.equal(
      store
        .read()
        .catalogFoundation!.assets.find((a) => a.id === result.assetId)!.alt.en
        .name,
      "Sugar Pan de Muerto",
    );
  } finally {
    store.close();
  }
});

test("persistence: draft, uploaded image, history and published catalog all survive a restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "product-hub-"));
  const path = join(dir, "state.sqlite");
  try {
    let run = setup(path);
    const p = payload(azucar(run.view()));
    p.variants[0]!.priceFils = 1650;
    hubCommand(
      run.store,
      admin,
      key(),
      { type: "saveProduct", expectedVersion: 0, ...p },
      ON,
    );
    const up = hubUpload(
      run.store,
      admin,
      key(),
      png(640, 640),
      "image/png",
      { expectedVersion: 1, alt: { en: empty, es: empty, ar: empty } },
      ON,
    ) as { assetId: string };
    const draftBefore = JSON.stringify(run.store.read().productHub);
    run.store.close();

    run = setup(path);
    assert.equal(JSON.stringify(run.store.read().productHub), draftBefore);
    const v = run.view();
    assert.equal(v.version, 2);
    assert.equal(azucar(v).variants[0]!.priceFils, 1650);
    const sha = v.assets.find((a) => a.id === up.assetId)!.version;
    assert.equal(run.store.getMedia(sha)!.contentType, "image/png");
    hubCommand(
      run.store,
      admin,
      key(),
      {
        type: "publish",
        expectedVersion: 2,
        expectedPublishedRevision: v.published.id,
      },
      ON,
    );
    const revision = run.store.read().catalogFoundation!.revision.id;
    run.store.close();

    run = setup(path);
    assert.equal(run.store.read().catalogFoundation!.revision.id, revision);
    assert.equal(
      run.store.read().catalog!.find((c) => c.id === p.variants[0]!.skuId)!
        .priceFils,
      1650,
    );
    assert.equal(run.view().draft, null);
    assert.equal(run.view().history[0]!.action, "publish");
    run.store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("families: create a draft family; a published family keeps its category and pack setting", () => {
  const { store, view } = setup();
  try {
    const v = view();
    const existing = v.families.find(
      (f) => f.id === "pan-de-muerto-traditional",
    )!;
    assert.throws(
      () =>
        hubCommand(
          store,
          admin,
          key(),
          {
            type: "saveFamily",
            expectedVersion: 0,
            family: { ...existing, pack: !existing.pack },
          },
          ON,
        ),
      { status: 422 },
    );
    assert.throws(
      () =>
        hubCommand(
          store,
          admin,
          key(),
          {
            type: "saveFamily",
            expectedVersion: 0,
            family: { ...existing, id: "new-family", categoryId: "nope" },
          },
          ON,
        ),
      { status: 422 },
    );
    hubCommand(
      store,
      admin,
      key(),
      {
        type: "saveFamily",
        expectedVersion: 0,
        family: {
          id: "pan-de-muerto-special",
          categoryId: existing.categoryId,
          name: "Pan de Muerto especial",
          pack: false,
          advanceOrder: false,
        },
      },
      ON,
    );
    assert.ok(view().families.some((f) => f.id === "pan-de-muerto-special"));
    assert.ok(
      view().changes.some((c) => c.kind === "family" && c.field === "created"),
    );
  } finally {
    store.close();
  }
});
