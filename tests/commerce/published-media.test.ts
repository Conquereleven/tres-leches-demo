import test from "node:test";
import assert from "node:assert/strict";
import { productListingSizes } from "../../src/commerce/product-hub-presentation";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import { storefrontCatalog } from "../../server/catalog/storefront-api";
import { seed } from "../../server/db/store";
import {
  approvedMedia,
  categoryEditorialMedia,
  selectedProductMedia,
  productGalleryMedia,
  publishedMediaAuthority,
} from "../../src/brand/media";
import {
  refreshLiveCatalog,
  type LiveCatalog,
} from "../../src/brand/live-catalog";

test("product media uses only published assignments, including empty, replaced and multiple images", async (t) => {
  const sources = loadBootstrapSources(process.cwd());
  const state = seed();
  state.catalog = structuredClone(sources.approved);
  state.catalogFoundation = planCatalogBootstrap(
    state.catalog,
    sources,
  ).foundation;
  const catalog = storefrontCatalog(state) as LiveCatalog;
  const target = catalog.products.find(
    (p) => p.id === "conchas-filled--pistache",
  )!;
  const unrelated = catalog.products.find(
    (p) => p.id === "pan-de-muerto-filled-pack",
  )!;
  const id = target.id,
    family = target.familyId,
    flavor = "Pistache";
  const selected = () => selectedProductMedia(id, family, flavor);
  const gallery = () => productGalleryMedia(id, family, flavor);
  assert.equal(publishedMediaAuthority(), false);
  assert.ok(selected(), "bundled approved image is preserved");
  const editorial = categoryEditorialMedia("conchas");
  const oldPriceCatalog = structuredClone(state.catalog);
  let answer = catalog;
  t.mock.method(globalThis, "setTimeout", (() => ({
    unref() {},
  })) as unknown as typeof setTimeout);
  t.mock.method(globalThis, "fetch", async () => Response.json(answer));
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { dataset: { catalog: "dynamic" } } },
  });
  t.after(() => {
    if (originalDocument)
      Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  await refreshLiveCatalog();
  assert.equal(publishedMediaAuthority(), true);
  assert.deepEqual(
    selected()!.derivatives,
    catalog.assets.find((a) => a.id === target.media[0]!.assetId)!.derivatives,
  );
  const pan = selectedProductMedia(unrelated.id, unrelated.familyId, "");
  const variantMedia = structuredClone(target.options.map((o) => o.media));
  target.media = [];
  await refreshLiveCatalog();
  assert.equal(
    selected(),
    undefined,
    "empty product must not recover stale variant or authored images",
  );
  assert.deepEqual(gallery(), []);
  assert.deepEqual(
    target.options.map((o) => o.media),
    variantMedia,
  );
  assert.deepEqual(
    selectedProductMedia(unrelated.id, unrelated.familyId, ""),
    pan,
  );
  const asset =
    catalog.assets.find((a) =>
      a.derivatives.some(
        (d) => d.src === approvedMedia[0]!.derivatives[0]!.src,
      ),
    ) ?? catalog.assets[0]!;
  const second = catalog.assets.find((a) => a.id !== asset.id)!;
  target.media = [
    { assetId: second.id, role: "gallery", order: 3 },
    { assetId: asset.id, role: "primary", order: 5 },
  ];
  answer = { ...catalog, revision: "replacement-revision" };
  await refreshLiveCatalog();
  assert.deepEqual(selected()!.derivatives, asset.derivatives);
  assert.equal(
    gallery().length,
    1,
    "only explicitly published gallery entries",
  );
  assert.deepEqual(gallery()[0]!.derivatives, second.derivatives);
  target.media = [];
  await refreshLiveCatalog();
  assert.equal(selected(), undefined, "remove after replace stays removed");
  assert.deepEqual(categoryEditorialMedia("conchas"), editorial);
  assert.deepEqual(
    state.catalog,
    oldPriceCatalog,
    "read-only resolution changes no SKU or price",
  );
});

test("Operations subtitles use each product's factual sizes, never a misleading family flavour", () => {
  for (const flavor of ["Chocolate", "Vainilla", "Pistache", "Tricolor"]) {
    assert.equal(
      productListingSizes([
        { size: "Mini · 40 g" },
        { size: "Individual · 70 g" },
      ]),
      "Mini · 40 g / Individual · 70 g",
      flavor,
    );
  }
  assert.equal(
    productListingSizes([
      { size: "6 mini" },
      { size: "12 mini" },
      { size: "6 individuales" },
      { size: "12 individuales" },
    ]),
    "6 mini / 12 mini / 6 individuales / 12 individuales",
  );
  assert.equal(
    productListingSizes([{ size: null }, { size: "Mini" }, { size: "Mini" }]),
    "Mini",
  );
});

test("dynamic HTML removes only marked bundled product images before hydration", async () => {
  const { withoutBundledProductMedia } =
    await import("../../server/catalog/product-media-html");
  const editorial =
    '<picture><img src="editorial.webp" alt="Category"></picture>';
  const product =
    '<picture data-product-media="bundled"><source srcset="old.avif"><img src="old.webp" alt="Product"></picture>';
  const direct =
    '<img class="legacy" data-product-media="bundled" src="old-fallback.webp">';
  const result = withoutBundledProductMedia(editorial + product + direct);
  assert.ok(result.startsWith(editorial));
  assert.ok(!result.includes("old."));
  assert.ok(!result.includes("old-fallback"));
  assert.equal((result.match(/b-menu-no-photo/g) || []).length, 2);
  assert.equal(withoutBundledProductMedia(result), result);
});

test("Conchas category carousel excludes withdrawn pistachio board artwork", () => {
  const editorial = categoryEditorialMedia("conchas");
  // 3L-MEDIA-002 photographs open; the two retained frames follow.
  assert.deepEqual(
    editorial.slice(3).map((image) => image.sourceId),
    [
      "3l-conchas-final-docena_de_conchas_de_chocolate_envuelta-opening-horizontal",
      "3l-conchas-final-conchas_de_pistache_envueltas_en_celofán-opening-horizontal",
    ],
  );
  assert.ok(
    editorial
      .slice(0, 3)
      .every((image) => image.sourceId.startsWith("3l-media-002-conchas-")),
  );
  assert.ok(
    editorial.every((image) =>
      image.derivatives.every(
        (derivative) =>
          !derivative.src.includes("conchas_de_pistache_sobre_tabla_de_madera"),
      ),
    ),
    "withdrawn board photo must not be a category carousel frame",
  );
});
