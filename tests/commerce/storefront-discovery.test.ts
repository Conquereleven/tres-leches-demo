import test from "node:test";
import assert from "node:assert/strict";
import {
  discoveryProducts,
  normalizeSearch,
  searchProducts,
  recommendations,
  type RecommendationRule,
} from "../../src/brand/discovery";
import type { LiveCatalog, LiveProduct } from "../../src/brand/live-catalog";
import type { CheckoutConfig } from "../../src/brand/cart";
import { fillPackRemaining } from "../../shared/pack-builder-ux";
import { PACK_SPECS } from "../../shared/pack-composition";
const t = (name: string, description: string | null = null) => ({
  en: { name, description, variantLabel: null },
  es: { name, description, variantLabel: null },
  ar: { name, description, variantLabel: null },
});
function product(
  id: string,
  name: string,
  categoryId: string,
  familyId = id,
): LiveProduct {
  return {
    id,
    slug: id,
    familyId,
    categoryId,
    content: t(name),
    media: [],
    options: [
      {
        id: id + "-sku",
        name,
        flavor: null,
        size: null,
        packQuantity: null,
        content: t(name),
        media: [],
        available: true,
        orderable: true,
        priceFils: 1000,
      },
    ],
  };
}
function fixture() {
  const products = [
    product("milk", "Milk", "extras"),
    product("cake", "Classic cake", "cakes"),
    product("conchas", "Conchas", "conchas"),
    product("candles", "Candles", "extras"),
    product("cake-topper", "Cake Topper", "extras"),
  ];
  const catalog: LiveCatalog = {
    schemaVersion: 1,
    revision: "synthetic",
    publishedAt: null,
    currency: "AED",
    assets: [],
    products,
    categories: ["extras", "cakes", "conchas"].map((id) => ({
      id,
      name: id,
      media: [],
      image: null,
      content: t(id),
    })),
    families: products.map((p) => ({
      id: p.familyId,
      categoryId: p.categoryId,
      name: p.familyId,
      pack: false,
      advanceOrder: false,
    })),
  };
  const config = {
    enabled: true,
    products: products.flatMap((p) =>
      p.options.map((o) => ({
        id: o.id,
        name: o.name,
        priceFils: o.priceFils,
      })),
    ),
  } as CheckoutConfig;
  return { catalog, config };
}
const now = new Date("2026-10-26T08:00:00Z");
test("search uses current authoritative options and returns one result per product", () => {
  const { catalog, config } = fixture();
  catalog.products[0]!.options.push({
    ...catalog.products[0]!.options[0]!,
    id: "milk-large",
    priceFils: 2000,
  });
  config.products.push({
    id: "milk-large",
    name: "Milk large",
    description: "Synthetic unit fixture",
    priceFils: 2000,
  });
  assert.equal(searchProducts(catalog, config, "MILK", now).length, 1);
  assert.equal(
    searchProducts(catalog, config, "milk", now)[0]!.priceFils,
    1000,
  );
});
test("EN/ES/AR vocabulary and safe typo/transposition tolerance", () => {
  const { catalog, config } = fixture();
  for (const q of ["milk", "leche", "حليب", "mlik", "milkk"])
    assert.equal(
      searchProducts(catalog, config, q, now)[0]?.product.id,
      "milk",
      q,
    );
  for (const q of ["cake", "pastel", "كيك"])
    assert.equal(
      searchProducts(catalog, config, q, now)[0]?.product.id,
      "cake",
      q,
    );
  for (const q of ["concha", "conchas", "كونشا"])
    assert.equal(
      searchProducts(catalog, config, q, now)[0]?.product.id,
      "conchas",
      q,
    );
  assert.equal(searchProducts(catalog, config, "zzzzzzz", now).length, 0);
});
test("normalization folds accents, Arabic marks and punctuation", () => {
  assert.equal(normalizeSearch("CHOCOLÁTÉ!"), "chocolate");
  assert.equal(normalizeSearch("حَلِيب"), "حليب");
});
test("published descriptions, localized names, families and categories are searchable", () => {
  const { catalog, config } = fixture();
  catalog.products[0]!.content.es.name = "Leche fresca";
  catalog.products[0]!.content.ar.name = "حليب طازج";
  catalog.products[0]!.content.en.description = "Approved accompaniment";
  assert.equal(
    searchProducts(catalog, config, "fresca", now)[0]?.product.id,
    "milk",
  );
  assert.equal(
    searchProducts(catalog, config, "طازج", now)[0]?.product.id,
    "milk",
  );
  assert.equal(
    searchProducts(catalog, config, "accompaniment", now)[0]?.product.id,
    "milk",
  );
  assert.equal(searchProducts(catalog, config, "extras", now).length, 3);
});
test("unavailable/unpublished/retired/price-mismatched options are never offered", () => {
  const { catalog, config } = fixture();
  catalog.products[0]!.options[0]!.orderable = false;
  assert.equal(searchProducts(catalog, config, "milk", now).length, 0);
  catalog.products[0]!.options[0]!.orderable = true;
  catalog.products[0]!.options[0]!.available = false;
  assert.equal(searchProducts(catalog, config, "milk", now).length, 0);
  catalog.products[0]!.options[0]!.available = true;
  config.products[0]!.priceFils = 999;
  assert.equal(searchProducts(catalog, config, "milk", now).length, 0);
  catalog.products = [];
  assert.equal(searchProducts(catalog, config, "milk", now).length, 0);
});
test("retired and out-of-season SKUs are excluded even if both endpoints list them", () => {
  const { catalog, config } = fixture();
  for (const id of [
    "pan-de-muerto-filled-chocolate-mini-chocolate-covering",
    "pan-de-muerto-traditional-azucar-mini-40-g",
  ]) {
    catalog.products[0]!.options[0]!.id = id;
    config.products[0]!.id = id;
    assert.equal(
      searchProducts(catalog, config, "milk", new Date("2026-07-01")).length,
      0,
    );
  }
});
test("disabled checkout or missing authoritative config offers nothing", () => {
  const { catalog, config } = fixture();
  assert.equal(discoveryProducts(catalog, null, now).length, 0);
  config.enabled = false;
  assert.equal(discoveryProducts(catalog, config, now).length, 0);
});
test("a personalized pack is discoverable only with a published eligible component", () => {
  const { catalog, config } = fixture();
  const spec = PACK_SPECS[0]!;
  const p = catalog.products[0]!;
  p.options[0]!.id = spec.packSkuId;
  config.products[0]!.id = spec.packSkuId;
  config.personalizedPacks = { enabled: true, rules: [] };
  assert.equal(discoveryProducts(catalog, config, now).some((h) => h.product.id === p.id), false);
  config.personalizedPacks.rules = [{ packSkuId: spec.packSkuId, componentSkuIds: [spec.components[0]!.componentSkuId] }];
  assert.equal(discoveryProducts(catalog, config, now).some((h) => h.product.id === p.id), true);
});
test("recommendations are relevant, diverse, limited and exclude existing cart families/products", () => {
  const { catalog, config } = fixture();
  const lines = [{ productId: "cake-sku", quantity: 1 }];
  const hits = recommendations(catalog, config, lines, "cake", now);
  assert.deepEqual(
    hits.map((h) => h.product.id),
    ["milk", "candles", "cake-topper"],
  );
  assert.equal(
    recommendations(
      catalog,
      config,
      [...lines, { productId: "milk-sku", quantity: 1 }],
      "cake",
      now,
    ).some((h) => h.product.id === "milk"),
    false,
  );
  assert.equal(recommendations(catalog, config, [], "milk", now).length, 0);
});
test("curation is configurable without changing JSX; stale products still filtered", () => {
  const { catalog, config } = fixture();
  const rules: RecommendationRule[] = [
    {
      id: "custom",
      whenCategories: ["cakes"],
      targetFamilies: ["conchas"],
      priority: 9,
    },
  ];
  assert.deepEqual(
    recommendations(catalog, config, [], "cake", now, rules).map(
      (h) => h.product.id,
    ),
    ["conchas"],
  );
  catalog.products[2]!.options[0]!.orderable = false;
  assert.equal(
    recommendations(catalog, config, [], "cake", now, rules).length,
    0,
  );
});
test("ranking prefers exact product identity and never duplicates variant options", () => {
  const { catalog, config } = fixture();
  catalog.products.push({ ...catalog.products[0]! });
  assert.equal(searchProducts(catalog, config, "milk", now).length, 1);
  assert.equal(
    searchProducts(catalog, config, "cake", now)[0]?.product.id,
    "cake",
  );
});
test("fill remaining preserves mixtures and is an explicit capacity-bounded action", () => {
  const value = [
    { componentSkuId: "a", units: 1 },
    { componentSkuId: "b", units: 3 },
  ];
  assert.deepEqual(fillPackRemaining(value, "a", 12, ["a", "b"]), [
    { componentSkuId: "a", units: 9 },
    { componentSkuId: "b", units: 3 },
  ]);
  assert.equal(value[0]!.units, 1);
  assert.deepEqual(fillPackRemaining([], "a", 6, ["a"]), [
    { componentSkuId: "a", units: 6 },
  ]);
});
test("fill remaining cannot introduce denied flavor or bypass invalid/overfull composition", () => {
  const value = [{ componentSkuId: "a", units: 12 }];
  assert.equal(fillPackRemaining(value, "b", 12, ["a"]), value);
  assert.equal(fillPackRemaining(value, "a", 6, ["a"]), value);
  const invalid = [{ componentSkuId: "a", units: -1 }];
  assert.equal(fillPackRemaining(invalid, "a", 12, ["a"]), invalid);
});
