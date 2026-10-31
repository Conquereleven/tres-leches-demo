import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { translatedCopy } from "../../src/brand/localization";
import {
  liveCopy,
  refreshLiveCatalog,
  type LiveCatalog,
} from "../../src/brand/live-catalog";
import { searchProducts } from "../../src/brand/discovery";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import { storefrontCatalog } from "../../server/catalog/storefront-api";
import { seed } from "../../server/db/store";

const en = (source: string) => translatedCopy(source, "en");

test("English storefront shows reviewed English for Spanish-authored catalog sources", () => {
  assert.equal(
    en("Azúcar Pan de Muerto tradicional"),
    "Traditional Pan de Muerto · Sugar",
  );
  assert.equal(
    en("Mascarpone y cajeta Pan de Muerto relleno"),
    "Filled Pan de Muerto · Mascarpone and cajeta",
  );
  // Cart lines use the SKU's catalog name.
  assert.equal(
    en("Pan de Muerto · Pack relleno · 12 individuales"),
    "Pan de Muerto · Filled pack · 12 individual pieces",
  );
  // Flavour and size selectors.
  assert.equal(en("Ajonjolí"), "Sesame");
  assert.equal(en("6 individuales"), "6 individual pieces");
  assert.equal(
    en("3 Leches Cake · Classic · 6–8 personas"),
    "3 Leches Cake · Classic · 6–8 people",
  );
});

test("Spanish and Arabic keep their own wording", () => {
  const source = "Azúcar Pan de Muerto tradicional";
  assert.equal(
    translatedCopy(source, "es"),
    "Pan de Muerto tradicional · Azúcar",
  );
  assert.equal(translatedCopy(source, "ar"), "Pan de Muerto تقليدي · سكر");
});

test("founder-corrected Pistachio names and unknown sources are shown exactly as authored", () => {
  for (const source of [
    "Pistachio Pan de Muerto relleno",
    "Pan de Muerto relleno · Pistachio · Individual",
    "Concha rellena de pistache · Pack · 6 individuales",
    "A product name published after this build",
  ])
    assert.equal(en(source), source);
});

test("no English product or menu resource keeps Spanish catalog wording, except held Pistachio names", () => {
  const spanish =
    /\b(tradicional|relleno|rellenas|Azúcar|Ajonjolí|diplomática|Vainilla|individuales|cada uno|personas|piezas|gelatina|Mono portion|Pack de)\b/u;
  const held =
    /Pan de Muerto.*Pistachio|Pistachio.*Pan de Muerto|rellena de pistache/u;
  for (const ns of ["product", "menu"]) {
    const values = Object.values(
      JSON.parse(
        readFileSync(`src/brand/locales/en/${ns}.json`, "utf8"),
      ) as Record<string, string>,
    );
    const offenders = values.filter((v) => spanish.test(v) && !held.test(v));
    assert.deepEqual(offenders, [], ns);
  }
});

test("published English wording wins over the build when it differs; search finds the English name", async (t) => {
  const sources = loadBootstrapSources(process.cwd());
  const state = seed();
  state.catalog = structuredClone(sources.approved);
  state.catalogFoundation = planCatalogBootstrap(
    state.catalog,
    sources,
  ).foundation;
  const catalog = storefrontCatalog(state) as LiveCatalog;
  const pistachio = catalog.products.find(
    (p) => p.id === "pan-de-muerto-filled--pistachio",
  )!;
  const option = pistachio.options[0]!;
  // A manual Product Hub correction of the variant's English catalog name.
  option.content.en.name = "Pistachio Filled Pan de Muerto (reviewed)";
  // The live revision was bootstrapped before this fix: its English equals the Spanish source.
  const sugar = catalog.products.find(
    (p) => p.id === "pan-de-muerto-traditional--azucar",
  )!;
  const flavor = sugar.options[0]!.flavor!;
  for (const o of sugar.options) o.content.en.variantLabel = o.flavor;
  sugar.content.en.name = "Azúcar Pan de Muerto tradicional";
  t.mock.method(globalThis, "setTimeout", (() => ({
    unref() {},
  })) as unknown as typeof setTimeout);
  t.mock.method(globalThis, "fetch", async () => Response.json(catalog));
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
  assert.equal(
    liveCopy(option.name, "en"),
    "Pistachio Filled Pan de Muerto (reviewed)",
  );
  // Published English identical to the source adds nothing: the reviewed build wording applies.
  assert.equal(liveCopy(flavor, "en"), null);
  assert.equal(en(flavor), "Sugar");
  assert.equal(en(sugar.content.en.name!), "Traditional Pan de Muerto · Sugar");
  assert.equal(liveCopy(flavor, "es"), "Azúcar");
  // Search runs against what checkout sells: the same SKUs at the same prices.
  const config = {
    enabled: true,
    catalogAvailable: true,
    products: catalog.products.flatMap((p) =>
      p.options.map((o) => ({ id: o.id, priceFils: o.priceFils })),
    ),
  } as unknown as Parameters<typeof searchProducts>[1];
  const hits = searchProducts(
    catalog,
    config,
    "sugar pan de muerto",
    new Date("2026-10-31T08:00:00Z"),
  );
  assert.ok(hits.some((h) => h.product.id === sugar.id));
});
