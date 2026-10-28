import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { Store, seed } from "../../server/db/store";
import type { Actor, State } from "../../server/domain/model";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import {
  hubCommand,
  hubFlags,
  hubUpload,
  hubView,
  type HubFlags,
} from "../../server/catalog/product-hub";
import {
  publishedRevision,
  storefrontCatalog,
  storefrontCatalogMode,
} from "../../server/catalog/storefront-api";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { fixtureAddressGeo } from "../fixtures/website-address";
import {
  addDays,
  createWebCheckout,
  dubaiToday,
  quoteWebCheckout,
} from "../../server/domain/web-checkout";
import { reconcileEmbeddedPayment } from "../../server/domain/embedded-checkout";
import { RETIRED_SKUS } from "../../shared/commerce-policy";

const sources = loadBootstrapSources(process.cwd());
const admin: Actor = { id: "liza", role: "admin" };
const ON: HubFlags = {
  enabled: true,
  publishEnabled: true,
  publishBlocked: null,
};
const key = () => randomUUID();
const empty = { name: null, description: null, variantLabel: null };
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
function setup() {
  const state: State = seed();
  state.catalog = structuredClone(sources.approved);
  state.catalogFoundation = planCatalogBootstrap(
    state.catalog,
    sources,
  ).foundation;
  const store = new Store(":memory:", "test", state);
  const view = () => {
    const v = hubView(store.read(), admin, ON);
    assert.equal(v.available, true);
    return v as Extract<typeof v, { available: true }>;
  };
  type Product = ReturnType<typeof view>["products"][number];
  const payload = (p: Product) => ({
    product: {
      id: p.id,
      slug: p.slug,
      familyId: p.familyId!,
      categoryId: p.categoryId!,
      name: p.name,
      description: p.description,
      commercialState: p.commercialState,
      translations: structuredClone(p.translations),
      media: structuredClone(p.media),
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
  const save = (p: ReturnType<typeof payload>) =>
    hubCommand(
      store,
      admin,
      key(),
      { type: "saveProduct", expectedVersion: view().version, ...p },
      ON,
    );
  const publish = (version = view().version) =>
    hubCommand(
      store,
      admin,
      key(),
      {
        type: "publish",
        expectedVersion: version,
        expectedPublishedRevision: view().published.id,
      },
      ON,
    );
  /** A year-round cake with at least two sizes. */
  const cake = () =>
    view().products.find(
      (p) =>
        p.categoryId === "cakes" &&
        p.commercialState === "published" &&
        p.variants.filter((v) => v.active).length >= 2,
    )!;
  return { store, view, payload, save, publish, cake };
}

test("adoption flag: off by default; Production needs the explicit activation contract; publication follows it", () => {
  const on = { STOREFRONT_DYNAMIC_CATALOG_ENABLED: "true" };
  assert.equal(storefrontCatalogMode({}), "off");
  assert.equal(storefrontCatalogMode({ APP_ENV: "staging" }), "off");
  for (const APP_ENV of ["test", "development", "staging"])
    assert.equal(storefrontCatalogMode({ ...on, APP_ENV }), "on");
  // Production, or an environment that does not say what it is.
  for (const env of [{ APP_ENV: "production" }, {}, { APP_ENV: "prod" }]) {
    assert.equal(storefrontCatalogMode({ ...on, ...env }), "off");
    assert.equal(
      storefrontCatalogMode({
        ...on,
        ...env,
        STOREFRONT_DYNAMIC_CATALOG_PRODUCTION: "true",
      }),
      "off",
      "a generic truthy value is not the contract",
    );
    assert.equal(
      storefrontCatalogMode({
        ...on,
        ...env,
        STOREFRONT_DYNAMIC_CATALOG_PRODUCTION: "founder-approved",
      }),
      "on",
    );
  }
  assert.equal(
    storefrontCatalogMode({
      APP_ENV: "production",
      STOREFRONT_DYNAMIC_CATALOG_PRODUCTION: "founder-approved",
    }),
    "off",
    "the activation alone does not enable it",
  );
  // Product Hub may publish in Production only once customers read published data.
  const hub = {
    APP_ENV: "production",
    PRODUCT_HUB_ENABLED: "true",
    PRODUCT_HUB_PUBLISH_ENABLED: "true",
  };
  assert.equal(hubFlags(hub).publishEnabled, false);
  assert.equal(hubFlags({ ...hub, ...on }).publishEnabled, false);
  assert.equal(
    hubFlags({
      ...hub,
      ...on,
      STOREFRONT_DYNAMIC_CATALOG_PRODUCTION: "founder-approved",
    }).publishEnabled,
    true,
  );
});

test("public contract: published revision only, three languages, server prices, nothing administrative", () => {
  const { store, view, payload, save, cake } = setup();
  try {
    const before = storefrontCatalog(store.read());
    assert.equal(before.products.length, 75);
    assert.equal(before.revision, view().published.id);
    const ids = new Set(sources.approved.map((c) => c.id));
    for (const p of before.products) {
      for (const locale of ["en", "es", "ar"] as const)
        assert.ok(p.content[locale].name, `${p.id} ${locale}`);
      assert.ok(p.options.length > 0);
      for (const o of p.options) {
        assert.ok(ids.has(o.id));
        assert.ok(!RETIRED_SKUS.has(o.id));
        assert.equal(
          o.priceFils,
          sources.approved.find((c) => c.id === o.id)!.priceFils,
        );
      }
    }
    const text = JSON.stringify(before);
    for (const forbidden of [
      "commercialState",
      "draft",
      "audit",
      "history",
      "updatedBy",
      "legacy-",
      "fingerprint",
    ])
      assert.ok(!text.includes(`"${forbidden}`), forbidden);
    for (const asset of before.assets)
      for (const d of asset.derivatives) assert.match(d.src, /^\/brand\//);

    // A saved draft changes nothing customers can read.
    const p = payload(cake());
    p.product.name = "Draft Only Name";
    p.product.translations.en.name = "Draft Only Name";
    p.variants[0]!.priceFils += 500;
    save(p);
    assert.ok(view().draft);
    assert.deepEqual(storefrontCatalog(store.read()), before);
    assert.ok(
      !JSON.stringify(storefrontCatalog(store.read())).includes("Draft Only"),
    );
  } finally {
    store.close();
  }
});

test("publication reaches the storefront: name, translations, price, image, availability, removed and new products", () => {
  const { store, view, payload, save, publish, cake } = setup();
  try {
    const target = cake();
    const first = storefrontCatalog(store.read());
    const p = payload(target);
    const [priced, paused, removed] = p.variants;
    p.product.name = "Tres Leches Celebration";
    p.product.translations.en.name = "Tres Leches Celebration";
    p.product.translations.es.name = "Tres Leches de Celebración";
    p.product.translations.ar.name = "تريس ليتشيس للاحتفال";
    priced!.priceFils += 700;
    paused!.availability = "unavailable";
    if (removed) removed.active = false;
    // A new photograph, uploaded through the editor.
    const uploaded = hubUpload(
      store,
      admin,
      key(),
      png(640, 640),
      "image/png",
      {
        expectedVersion: view().version,
        alt: {
          en: { ...empty, name: "Celebration cake" },
          es: { ...empty, name: "Pastel de celebración" },
          ar: { ...empty, name: "كعكة الاحتفال" },
        },
      },
      ON,
    ) as { assetId: string };
    p.product.media = [
      { assetId: uploaded.assetId, role: "primary", order: 0 },
    ];
    save(p);
    // A new product in the same family.
    save({
      product: {
        ...p.product,
        id: "tres-leches-canela",
        slug: "tres-leches-canela",
        name: "Cinnamon Tres Leches",
        commercialState: "published",
        translations: {
          en: { ...empty, name: "Cinnamon Tres Leches" },
          es: { ...empty, name: "Tres Leches de canela" },
          ar: { ...empty, name: "تريس ليتشيس بالقرفة" },
        },
        media: [],
      },
      variants: [
        {
          ...priced!,
          skuId: "tres-leches-canela-small",
          catalogName: "Tres Leches · Canela · Small",
          flavor: "Canela",
          priceFils: 9900,
          commercialState: "published",
          active: true,
          availability: "available",
          media: [],
        },
      ],
    });
    assert.deepEqual(storefrontCatalog(store.read()), first, "still a draft");
    publish();

    const live = storefrontCatalog(store.read());
    assert.notEqual(live.revision, first.revision);
    assert.ok(live.publishedAt);
    const shown = live.products.find((x) => x.id === target.id)!;
    assert.equal(
      shown.slug,
      target.slug,
      "the link customers saved still works",
    );
    assert.equal(shown.content.en.name, "Tres Leches Celebration");
    assert.equal(shown.content.es.name, "Tres Leches de Celebración");
    assert.equal(shown.content.ar.name, "تريس ليتشيس للاحتفال");
    const option = (id: string) => shown.options.find((o) => o.id === id);
    assert.equal(option(priced!.skuId)!.priceFils, priced!.priceFils);
    assert.equal(option(paused!.skuId)!.available, false);
    assert.equal(option(paused!.skuId)!.orderable, false);
    if (removed) assert.equal(option(removed.skuId), undefined);
    const image = live.assets.find((a) => a.id === shown.media[0]!.assetId)!;
    assert.match(
      image.derivatives[0]!.src,
      /^\/brand\/hub\/[a-f0-9]{64}\.png$/,
    );
    assert.equal(image.alt.ar.name, "كعكة الاحتفال");
    const created = live.products.find((x) => x.id === "tres-leches-canela")!;
    assert.equal(created.options[0]!.priceFils, 9900);
    assert.equal(created.content.ar.name, "تريس ليتشيس بالقرفة");
    // Checkout prices from the same record the storefront shows.
    assert.equal(
      store.read().catalog!.find((c) => c.id === priced!.skuId)!.priceFils,
      option(priced!.skuId)!.priceFils,
    );

    // Deactivating every variant removes the product from the storefront.
    const q = payload(
      view().products.find((x) => x.id === "tres-leches-canela")!,
    );
    q.variants[0]!.active = false;
    save(q);
    publish();
    assert.equal(
      storefrontCatalog(store.read()).products.some(
        (x) => x.id === "tres-leches-canela",
      ),
      false,
    );
  } finally {
    store.close();
  }
});

test("concurrent publication: one revision wins whole; the storefront never shows a mixture", () => {
  const { store, view, payload, save, publish, cake } = setup();
  try {
    const p = payload(cake());
    const sku = p.variants[0]!.skuId;
    const original = p.variants[0]!.priceFils;
    p.variants[0]!.priceFils = original + 300;
    save(p);
    const version = view().version;
    publish(version);
    // A second administrator publishes from the same, now stale, screen.
    assert.throws(() => publish(version), { status: 409 });
    const live = storefrontCatalog(store.read());
    const price = live.products
      .flatMap((x) => x.options)
      .find((o) => o.id === sku)!.priceFils;
    assert.equal(price, original + 300);
    assert.equal(live.revision, store.read().catalogFoundation!.revision.id);
    assert.equal(publishedRevision(store.read(), "on").revision, live.revision);
  } finally {
    store.close();
  }
});

test("fail closed: with adoption on, no valid revision means nothing is offered", () => {
  const { store } = setup();
  try {
    assert.deepEqual(publishedRevision(store.read(), "off"), {
      dynamic: false,
      sellable: true,
      revision: null,
    });
    assert.equal(publishedRevision(store.read(), "on").sellable, true);
    // The catalog changed underneath the foundation: the revision no longer holds.
    store.write((s) => {
      s.catalog![0]!.priceFils += 100;
    });
    assert.throws(() => storefrontCatalog(store.read()));
    assert.deepEqual(publishedRevision(store.read(), "on"), {
      dynamic: true,
      sellable: false,
      revision: null,
    });
    store.write((s) => {
      delete s.catalogFoundation;
    });
    assert.throws(() => storefrontCatalog(store.read()), { status: 503 });
    assert.equal(publishedRevision(store.read(), "on").sellable, false);
    assert.equal(publishedRevision(store.read(), "off").sellable, true);
  } finally {
    store.close();
  }
});

for (const paymentState of ["pending", "paid"] as const)
  test(`checkout after publication uses the published price; ${paymentState} orders keep theirs`, async () => {
  const { store, view, payload, save, publish, cake } = setup();
  const checkouts = new Map<string, Record<string, unknown>>();
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url, init) => {
      if (init?.method === "POST") {
        const id = randomUUID();
        checkouts.set(id, {
          ...JSON.parse(String(init.body)),
          id,
          status: "PENDING",
          redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
        });
        return Response.json({ success: true, result: checkouts.get(id) });
      }
      return Response.json({
        success: true,
        result: checkouts.get(String(url).split("/").at(-1)!),
      });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
    fixtureAddressGeo,
  );
  try {
    const target = cake();
    const sku = target.variants.find((v) => v.active)!;
    const input = {
      lines: [{ productId: sku.skuId, quantity: 1 }],
      delivery: {
        zoneId: "jlt-cluster-c",
        address: "Fixture only address",
        building: "Fixture Tower",
        date: addDays(dubaiToday(), 3),
        slot: "4:00 PM – 9:00 PM",
      },
      customer: {
        name: "Fixture Customer",
        phone: "0500000000",
        email: "fixture@example.invalid",
      },
      billing: { sameAsDelivery: true },
    };
    const cart = { lines: input.lines, zoneId: input.delivery.zoneId };
    const origin = "https://fixture.invalid";
    const checkoutKey = randomUUID();
    const accepted = await createWebCheckout(
      service,
      input,
      checkoutKey,
      "web",
      origin,
      quoteWebCheckout(service, cart).quoteRevision,
    );
    if (paymentState === "paid") {
      for (const checkout of checkouts.values()) checkout.status = "PAID";
      await reconcileEmbeddedPayment(service, checkoutKey);
      assert.equal(store.read().payments[0]!.status, "paid");
    }
    const frozenOrder = JSON.stringify(store.read().orders[0]);
    const frozenPayment = JSON.stringify(store.read().payments[0]);
    const displayed = quoteWebCheckout(service, cart).quoteRevision;

    const p = payload(view().products.find((x) => x.id === target.id)!);
    p.variants.find((v) => v.skuId === sku.skuId)!.priceFils += 1000;
    save(p);
    publish();

    // History is not rewritten.
    assert.equal(JSON.stringify(store.read().orders[0]), frozenOrder);
    assert.equal(JSON.stringify(store.read().payments[0]), frozenPayment);
    if (paymentState === "paid") {
      const eventsBefore = JSON.stringify([store.read().customerNotifications, store.read().operationsNotifications]);
      await reconcileEmbeddedPayment(service, checkoutKey);
      assert.equal(JSON.stringify(store.read().orders[0]), frozenOrder);
      assert.equal(JSON.stringify([store.read().customerNotifications, store.read().operationsNotifications]), eventsBefore);
    }
    // A cart priced before the publication cannot be paid at the old price.
    await assert.rejects(
      createWebCheckout(service, input, randomUUID(), "web", origin, displayed),
      /price or availability changed/,
    );
    const fresh = await createWebCheckout(
      service,
      input,
      randomUUID(),
      "web",
      origin,
      quoteWebCheckout(service, cart).quoteRevision,
    );
    assert.equal(fresh.amountFils, accepted.amountFils + 1000);
    const shown = storefrontCatalog(store.read())
      .products.flatMap((x) => x.options)
      .find((o) => o.id === sku.skuId)!;
    assert.equal(shown.priceFils, sku.priceFils + 1000);
    assert.equal(store.read().orders.length, 2);
    assert.equal(JSON.stringify(store.read().orders[0]), frozenOrder);
  } finally {
    store.close();
  }
});

test("new flavours, sizes and variant names carry their own translations; none is invented", () => {
  const { store, view, payload, save, publish, cake } = setup();
  try {
    const target = cake();
    const untouched = storefrontCatalog(store.read());
    // Existing wording is translated by the storefront already: no stored size label,
    // and re-saving a product unchanged raises no translation warning.
    for (const o of untouched.products.flatMap((x) => x.options))
      assert.equal(o.content.es.sizeLabel ?? null, null);
    save(payload(target));
    assert.deepEqual(view().changes, [], "an unchanged save changes nothing");
    assert.deepEqual(
      view().issues.filter((i) => i.code === "translation-missing"),
      [],
    );

    const p = payload(target);
    const base = p.variants[0]!;
    p.variants.push({
      ...base,
      skuId: `${target.id}-lavender-petite`,
      catalogName: "Tres Leches · Lavender · Petite",
      flavor: "Lavender",
      size: "Petite · 2 people",
      priceFils: 6400,
      commercialState: "published",
      active: true,
      availability: "available",
      translations: { en: empty, es: empty, ar: empty },
      media: [],
    });
    save(p);
    const warnings = () =>
      view()
        .issues.filter((i) => i.code === "translation-missing")
        .map((i) => `${i.target}: ${i.message}`);
    assert.deepEqual(warnings(), [
      `${target.id}-lavender-petite: Missing ES flavour, size, name`,
      `${target.id}-lavender-petite: Missing AR flavour, size, name`,
    ]);
    // Published as is, the storefront receives no translation: it shows its
    // "translation pending" marker rather than a guess.
    const q = payload(view().products.find((x) => x.id === target.id)!);
    const added = q.variants.find((v) => v.skuId.endsWith("lavender-petite"))!;
    added.translations = {
      en: empty,
      es: {
        ...empty,
        name: "Tres Leches · Lavanda · Petite",
        variantLabel: "Lavanda",
        sizeLabel: "Petite · 2 personas",
      },
      ar: { ...empty, variantLabel: "لافندر" },
    };
    save(q);
    assert.deepEqual(warnings(), [
      `${target.id}-lavender-petite: Missing AR size, name`,
    ]);
    assert.ok(
      view().changes.some(
        (c) =>
          c.target.endsWith("lavender-petite") ||
          (c.field === "sizeLabel · ES" && c.after === "Petite · 2 personas"),
      ),
    );
    publish();
    const option = storefrontCatalog(store.read())
      .products.find((x) => x.id === target.id)!
      .options.find((o) => o.id.endsWith("lavender-petite"))!;
    assert.equal(option.name, "Tres Leches · Lavender · Petite");
    assert.equal(option.flavor, "Lavender");
    assert.equal(option.size, "Petite · 2 people");
    assert.equal(option.content.es.variantLabel, "Lavanda");
    assert.equal(option.content.es.sizeLabel, "Petite · 2 personas");
    assert.equal(option.content.es.name, "Tres Leches · Lavanda · Petite");
    assert.equal(option.content.ar.variantLabel, "لافندر");
    assert.equal(option.content.ar.sizeLabel ?? null, null, "not invented");
    assert.equal(option.content.ar.name, null, "not invented");
  } finally {
    store.close();
  }
});

test("commercial rollback: publishing the previous price restores the previous revision everywhere, without restoring a database", async () => {
  const { store, view, payload, save, publish, cake } = setup();
  const checkouts = new Map<string, Record<string, unknown>>();
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url, init) => {
      if (init?.method === "POST") {
        const id = randomUUID();
        checkouts.set(id, {
          ...JSON.parse(String(init.body)),
          id,
          status: "PENDING",
          redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
        });
        return Response.json({ success: true, result: checkouts.get(id) });
      }
      return Response.json({
        success: true,
        result: checkouts.get(String(url).split("/").at(-1)!),
      });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
    fixtureAddressGeo,
  );
  service.drain = async () => {};
  try {
    const target = cake();
    const sku = target.variants.find((v) => v.active)!;
    const original = sku.priceFils;
    const input = {
      lines: [{ productId: sku.skuId, quantity: 1 }],
      delivery: {
        zoneId: "jlt-cluster-c",
        address: "Fixture only address",
        building: "Fixture Tower",
        date: addDays(dubaiToday(), 3),
        slot: "4:00 PM – 9:00 PM",
      },
      customer: {
        name: "Fixture Customer",
        phone: "0500000000",
        email: "fixture@example.invalid",
      },
      billing: { sameAsDelivery: true },
    };
    const cart = { lines: input.lines, zoneId: input.delivery.zoneId };
    const origin = "https://fixture.invalid";
    const order = async () =>
      createWebCheckout(
        service,
        input,
        randomUUID(),
        "web",
        origin,
        quoteWebCheckout(service, cart).quoteRevision,
      );
    const shown = () =>
      storefrontCatalog(store.read())
        .products.flatMap((x) => x.options)
        .find((o) => o.id === sku.skuId)!.priceFils;
    const charged = () =>
      store.read().catalog!.find((c) => c.id === sku.skuId)!.priceFils;
    const setPrice = (priceFils: number) => {
      const p = payload(view().products.find((x) => x.id === target.id)!);
      p.variants.find((v) => v.skuId === sku.skuId)!.priceFils = priceFils;
      save(p);
      publish();
    };
    const before = await order();
    const firstRevision = view().published.id;

    // The new price goes live and somebody orders at it.
    setPrice(original + 1500);
    const raisedRevision = view().published.id;
    assert.notEqual(raisedRevision, firstRevision);
    assert.equal(shown(), original + 1500);
    assert.equal(charged(), shown());
    const during = await order();
    assert.equal(during.amountFils, before.amountFils + 1500);
    const staleQuote = quoteWebCheckout(service, cart).quoteRevision;
    const frozen = JSON.stringify(store.read().orders);
    const frozenPayments = JSON.stringify(store.read().payments);

    // Rollback: the previous price is published as a new, reviewed publication.
    setPrice(original);
    assert.equal(
      view().published.id,
      firstRevision,
      "identical content is the identical revision: the rollback is verifiable",
    );
    assert.equal(shown(), original);
    assert.equal(charged(), shown(), "the visible price is the charged price");
    assert.equal(publishedRevision(store.read(), "on").sellable, true);
    // Orders taken at the higher price are history, not rewritten.
    assert.equal(JSON.stringify(store.read().orders), frozen);
    assert.equal(JSON.stringify(store.read().payments), frozenPayments);
    // A cart still showing the higher price cannot be paid at it.
    await assert.rejects(
      createWebCheckout(
        service,
        input,
        randomUUID(),
        "web",
        origin,
        staleQuote,
      ),
      /price or availability changed/,
    );
    const after = await order();
    assert.equal(after.amountFils, before.amountFils);
    // Both publications are on record with who made them.
    const published = view().history.filter((h) => h.action === "publish");
    assert.equal(published.length, 2);
    assert.ok(published.every((h) => h.actor === "liza"));
    assert.equal(
      store.read().audit.filter((a) => /catalog published/.test(a.action))
        .length,
      2,
    );
  } finally {
    store.close();
  }
});
