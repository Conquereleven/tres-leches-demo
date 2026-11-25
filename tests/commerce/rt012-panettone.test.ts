import assert from "node:assert/strict";
import test from "node:test";
import { availableSku } from "../../shared/commerce-policy";
import { hubMediaAccess } from "../../server/catalog/product-hub";
import { storefrontCatalog } from "../../server/catalog/storefront-api";
import { renderProductPage } from "../../server/catalog/product-page";
import { quoteWebCheckout } from "../../server/domain/web-checkout";
import { paidFixture } from "../fixtures/customer-paid";
import { integratedFixture } from "../fixtures/rt01-integrated-server";
import { draftPanettoneFixture } from "../fixtures/rt012-panettone";
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
