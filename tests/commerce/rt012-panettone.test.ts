import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { availableSku } from "../../shared/commerce-policy";
import { hubCommand, hubMediaAccess, hubUpload, hubView } from "../../server/catalog/product-hub";
import { storefrontCatalog } from "../../server/catalog/storefront-api";
import { renderProductPage } from "../../server/catalog/product-page";
import { canonicalCartHash, quoteWebCheckout } from "../../server/domain/web-checkout";
import { paidFixture } from "../fixtures/customer-paid";
import { integratedFixture } from "../fixtures/rt01-integrated-server";
import { draftPanettoneFixture, publishBolilloPhotoFixture } from "../fixtures/rt012-panettone";
import { prepareBolilloMedia, preparePanettoneHotfix } from "../../data-imports/commercial-hotfix/prepare";
import manifest from "../../data-imports/rt012-panettone/manifest.json";

test("Panettone stays private until Product Hub publishes the three products and six prices", (t) => {
  const f = paidFixture();
  t.after(() => f.store.close());
  const { initial } = integratedFixture();
  f.store.write((state) => { state.catalogFoundation = initial.catalogFoundation; });
  const date = new Date("2026-11-25T08:00:00Z");
  const before = storefrontCatalog(f.store.read(), date);
  const draft = draftPanettoneFixture(f.store);
  const shell = '<head></head><main id="main" data-product-slot="true"></main>';
  const quote = (lines: unknown) =>
    quoteWebCheckout(f.service, { lines, fulfillmentMethod: "pickup" });

  assert.deepEqual(storefrontCatalog(f.store.read(), date), before);
  assert.throws(() => quote([{ productId: "panettone-normal-mini", quantity: 1 }]), { status: 422 });
  assert.throws(() => renderProductPage(shell, "/menu/panettone-normal", f.store.read(), "on"), { status: 404 });
  for (const { previewPhoto } of manifest.products) {
    assert.equal(hubMediaAccess(f.store.read(), previewPhoto.sha256, null), null);
    assert.equal(hubMediaAccess(f.store.read(), previewPhoto.sha256, { id: "liza", role: "manager" }), "private");
  }
  draft.publish();
  const state = f.store.read();
  const products = storefrontCatalog(state, date);
  const panettone = products.products.filter((product) => product.categoryId === "panettone");
  assert.equal(panettone.length, 3);
  assert.deepEqual(products.products.filter((product) => product.categoryId !== "panettone"), before.products);
  assert.deepEqual(state.catalog?.filter((row) => !row.id.startsWith("panettone-")), initial.catalog);
  assert.deepEqual(state.orders, initial.orders);
  assert.deepEqual(state.payments, initial.payments);

  const cart = manifest.products.flatMap((entry) => {
    const product = panettone.find((item) => item.id === entry.id)!;
    assert.equal(product.options.length, 2);
    for (const lang of ["en", "es", "ar"] as const) {
      assert.equal(product.content[lang].name, entry.name[lang]);
      assert.equal(product.content[lang].description, entry.description[lang]);
    }
    const asset = products.assets.find((item) => item.id === product.media.at(0)?.assetId)!;
    assert.equal(asset.version, entry.previewPhoto.sha256);
    assert.equal(hubMediaAccess(state, asset.version, null), "public");
    assert.ok(renderProductPage(shell, `/menu/${entry.id}`, state, "on").includes(entry.name.en));
    assert.throws(() => renderProductPage(shell, `/menu/${entry.id}`, state, "off"), { status: 404 });
    return manifest.sizes.map((size) => {
      const productId = `${entry.id}-${size.id}`;
      const option = product.options.find((item) => item.id === productId)!;
      assert.equal(option.priceFils, size.priceFils);
      assert.equal(option.content.es.sizeLabel, size.es);
      assert.equal(option.content.ar.sizeLabel, size.ar);
      assert.equal(option.available, true);
      assert.equal(option.orderable, true);
      for (const month of [1, 4, 7, 10, 12])
        assert.ok(availableSku(productId, new Date(Date.UTC(2027, month - 1, 15))));
      const quantity = size.id === "mini" ? 2 : 1;
      const itemQuote = quote([{ productId, quantity }]);
      assert.equal(itemQuote.eligible, true);
      assert.equal(itemQuote.subtotalFils, size.priceFils * quantity);
      return { productId, quantity };
    });
  });
  assert.equal(quote(cart).subtotalFils, 67200);
  assert.throws(() => quote([{ ...cart[0], priceFils: 1 }]));
  assert.throws(() => quote([{ productId: "panettone-chocolate-missing", quantity: 1 }]), { status: 422 });
  assert.throws(() => quote([{ productId: "panettone-pack", quantity: 1 }]), { status: 422 });
  assert.equal(f.providerState.creates, 0);
});

test("release hold keeps Panettone details and photos visible and blocks checkout for all six SKUs", (t) => {
  const f = paidFixture();
  t.after(() => f.store.close());
  const { initial } = integratedFixture();
  f.store.write((state) => { state.catalogFoundation = initial.catalogFoundation; });
  draftPanettoneFixture(f.store, { release: true }).publish();
  const state = f.store.read();
  const catalog = storefrontCatalog(state, new Date("2026-11-27T08:00:00Z"));
  const panettone = catalog.products.filter((row) => row.categoryId === "panettone");
  assert.equal(panettone.length, 3);
  const shell = '<head></head><main id="main" data-product-slot="true"></main>';
  for (const p of panettone) {
    assert.equal(p.options.length, 2);
    assert.ok(p.media.some(link => link.role==="primary"));
    assert.match(renderProductPage(shell, `/menu/${p.slug}`, state, "on", "ar"), /الغلوتين/);
    for (const option of p.options) {
      assert.equal(option.orderable, false);
      assert.equal(option.available, false);
      const cart = {
        lines: [{ productId: option.id, quantity: 1 }], fulfillmentMethod: "pickup",
      };
      assert.equal(quoteWebCheckout(f.service, cart).eligible, false);
      assert.throws(() => canonicalCartHash(f.service, cart), { status: 422 });
    }
  }
  const eligible = quoteWebCheckout(f.service, {
    lines: [{ productId: "pan-de-muerto-traditional-azucar-individual-70-g", quantity: 6 }], fulfillmentMethod: "pickup",
  });
  assert.equal(eligible.eligible, true);
  assert.equal(f.providerState.creates, 0);
});

test("Product Hub updates the published Panettone attributes and covers without changing commercial records", (t) => {
  const f = paidFixture();
  t.after(() => f.store.close());
  const { initial } = integratedFixture();
  f.store.write((state) => { state.catalogFoundation = initial.catalogFoundation; });
  draftPanettoneFixture(f.store, {
    legacyAttributes: true, disabledSkus: ["panettone-chocolate-mini"],
  }).publish();
  const before = f.store.read();
  const published = storefrontCatalog(before);
  const admin = { id: "fixture-panettone-admin", role: "admin" } as const;
  const flags = { enabled: true, publishEnabled: true, publishBlocked: null };
  const readHub = () => {
    const hub = hubView(f.store.read(), admin, flags);
    assert.ok(hub.available);
    return hub;
  };
  for (const product of manifest.products) {
    const hub = readHub();
    const current = hub.products.find((item) => item.id === product.id)!;
    assert.equal(current.variants[0]!.translations.en.variantLabel, manifest.sizes[0]!.en);
    const photo = readFileSync(new URL(
      `../../data-imports/rt012-panettone/${product.previewPhoto.file}`, import.meta.url,
    ));
    const priorPrimary = hub.assets.find((asset) =>
      asset.id === current.media.find((link) => link.role === "primary")?.assetId)!;
    const { assetId } = hubUpload(
      f.store, admin, randomUUID(), photo, "image/webp",
      { expectedVersion: hub.version, alt: priorPrimary.alt }, flags,
    ) as { assetId: string };
    const command = preparePanettoneHotfix(current, readHub().version, assetId);
    assert.throws(() => preparePanettoneHotfix(
      { ...current, variants: current.variants.slice(1) }, readHub().version, assetId,
    ));
    hubCommand(f.store, admin, randomUUID(), command, flags);
    assert.equal(hubMediaAccess(f.store.read(), product.previewPhoto.sha256, null), null);
  }
  assert.deepEqual(storefrontCatalog(f.store.read()), published);
  const draft = readHub();
  assert.deepEqual(
    [...new Set(draft.changes.map((change) => change.field))].sort(),
    ["created", "flavor", "media", "sizeLabel · AR", "variantLabel · AR",
      "sizeLabel · EN", "variantLabel · EN", "sizeLabel · ES", "variantLabel · ES"].sort(),
  );
  hubCommand(f.store, admin, randomUUID(), {
    type: "publish", expectedVersion: draft.version, expectedPublishedRevision: draft.published.id,
  }, flags);
  const after = f.store.read();
  const result = storefrontCatalog(after);
  assert.deepEqual(after.catalog, before.catalog);
  assert.deepEqual(after.orders, before.orders);
  assert.deepEqual(after.payments, before.payments);
  assert.deepEqual(result.products.filter((product) => product.categoryId !== "panettone"),
    published.products.filter((product) => product.categoryId !== "panettone"));
  for (const product of manifest.products) {
    const old = published.products.find((item) => item.id === product.id)!;
    const next = result.products.find((item) => item.id === product.id)!;
    assert.deepEqual(next.content, old.content);
    assert.deepEqual(next.media.filter((link) => link.role === "gallery"), old.media.filter((link) => link.role === "gallery"));
    assert.equal(hubMediaAccess(after, product.previewPhoto.sha256, null), "public");
    for (const size of manifest.sizes) {
      const skuId = `${product.id}-${size.id}`;
      const previous = old.options.find((option) => option.id === skuId)!;
      const option = next.options.find((item) => item.id === skuId)!;
      assert.equal(option.flavor, product.flavor.en);
      assert.equal(option.name, previous.name);
      assert.equal(option.priceFils, previous.priceFils);
      assert.equal(option.orderable, previous.orderable);
      for (const locale of ["en", "es", "ar"] as const) {
        assert.equal(option.content[locale].name, previous.content[locale].name);
        assert.equal(option.content[locale].variantLabel, product.flavor[locale]);
        assert.equal(option.content[locale].sizeLabel, size[locale]);
      }
      const quote = quoteWebCheckout(f.service, {
        lines: [{ productId: skuId, quantity: 1 }], fulfillmentMethod: "pickup",
      });
      assert.equal(quote.eligible, previous.orderable);
    }
  }
  assert.equal(f.providerState.creates, 0);
});

test("the verified PH Bolillo photo attaches to product 111 and retains the B111 contract", (t) => {
  const f = paidFixture();
  t.after(() => f.store.close());
  const { initial } = integratedFixture();
  f.store.write((state) => { state.catalogFoundation = initial.catalogFoundation; });
  const { before, after, product, assetId } = publishBolilloPhotoFixture(f.store);
  assert.deepEqual(after.catalog, before.catalog);
  assert.deepEqual(after.orders, before.orders);
  assert.deepEqual(after.payments, before.payments);
  const priorPublic = storefrontCatalog(before);
  const currentPublic = storefrontCatalog(after);
  assert.deepEqual(currentPublic.products.filter((row) => row.id !== "111"),
    priorPublic.products.filter((row) => row.id !== "111"));
  const bolillo = currentPublic.products.find((row) => row.id === "111")!;
  assert.deepEqual(bolillo.media, [{ assetId, role: "primary", order: 0 }]);
  assert.deepEqual(bolillo.options, priorPublic.products.find((row) => row.id === "111")!.options);
  const media = prepareBolilloMedia({ ...product, media: bolillo.media }, 1, "another-approved-image");
  assert.deepEqual(media.product.media, [...bolillo.media, { assetId: "another-approved-image", role: "gallery", order: 0 }]);
  assert.deepEqual(prepareBolilloMedia({ ...product, media: bolillo.media }, 1, assetId).product.media, bolillo.media);
  assert.throws(() => prepareBolilloMedia({ ...product, id: "unrelated" }, 1, assetId));
  assert.throws(() => quoteWebCheckout(f.service, {
    lines: [{ productId: "B111", quantity: 5 }], fulfillmentMethod: "pickup",
  }), { status: 422 });
  assert.equal(quoteWebCheckout(f.service, { lines: [{ productId: "B111", quantity: 6 }], fulfillmentMethod: "pickup" }).subtotalFils, 3000);
});
