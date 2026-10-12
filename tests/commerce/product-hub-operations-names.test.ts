import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store, seed } from "../../server/db/store";
import type { Actor, State } from "../../server/domain/model";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import {
  approvedOperationsNames,
  hubCommand,
  hubView,
  type HubFlags,
} from "../../server/catalog/product-hub";
import { storefrontCatalog } from "../../server/catalog/storefront-api";
import { publicCatalog } from "../../server/catalog/read-api";
import {
  operationalProductName,
  orderProductName,
  setPublishedProductNames,
} from "../../src/commerce/product-names";

const sources = loadBootstrapSources(process.cwd());
const admin: Actor = { id: "liza", role: "admin" };
const ON: HubFlags = {
  enabled: true,
  publishEnabled: true,
  publishBlocked: null,
};
const empty = { name: null, description: null, variantLabel: null };
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
      operationsName: v.operationsName ?? null,
      catalogName: v.catalogName,
      priceFils: v.priceFils,
      active: v.active,
      availability: v.availability,
    })),
  });
  const run = (cmd: Record<string, unknown>) =>
    hubCommand(
      store,
      admin,
      randomUUID(),
      { expectedVersion: view().version, ...cmd },
      ON,
    );
  const save = (p: ReturnType<typeof payload>) =>
    run({ type: "saveProduct", ...p });
  const publish = () =>
    run({ type: "publish", expectedPublishedRevision: view().published.id });
  const cake = () =>
    view().products.find(
      (p) => p.categoryId === "cakes" && p.commercialState === "published",
    )!;
  const product = (id: string) => view().products.find((p) => p.id === id)!;
  const warnings = () =>
    view()
      .issues.filter((i) => i.code === "operations-name-missing")
      .map((i) => i.target);
  return { store, view, payload, save, publish, cake, product, warnings };
}

test("Product Hub asks for an approved English staff name only for new or renamed definitions", () => {
  const { payload, save, cake, product, warnings } = setup();
  const target = cake();
  // Untouched definitions are covered by the reviewed dictionary: no warning.
  const p = payload(target);
  p.variants[0]!.priceFils += 100;
  save(p);
  assert.deepEqual(warnings(), []);
  // Renamed without an English name, and a new SKU without one: both flagged.
  const q = payload(product(target.id));
  const renamed = q.variants[0]!;
  renamed.catalogName = "Pastel 3 Leches · Edición aniversario";
  q.variants.push({
    ...renamed,
    skuId: `${target.id}-canela`,
    catalogName: "Pastel 3 Leches · Canela",
    flavor: "Canela",
    commercialState: "published",
    active: true,
    translations: { en: empty, es: empty, ar: empty },
    media: [],
  });
  save(q);
  assert.deepEqual(
    warnings().sort(),
    [renamed.skuId, `${target.id}-canela`].sort(),
  );
  // Supplying the names clears the warnings; nothing is generated for the administrator.
  const r = payload(product(target.id));
  r.variants.find((v) => v.skuId === renamed.skuId)!.operationsName =
    "3 Leches Cake · Anniversary edition";
  r.variants.find((v) => v.skuId.endsWith("-canela"))!.operationsName =
    "3 Leches Cake · Cinnamon";
  save(r);
  assert.deepEqual(warnings(), []);
});

test("published English names reach Operations with their exact definition, keep history and never reach customers", () => {
  const { store, payload, save, publish, cake, product } = setup();
  try {
    const target = cake();
    const sku = target.variants[0]!.skuId;
    const first = target.variants[0]!.catalogName;
    assert.deepEqual(approvedOperationsNames(store.read()), {});
    const rename = (catalogName: string, operationsName: string | null) => {
      const p = payload(product(target.id));
      Object.assign(
        p.variants.find((v) => v.skuId === sku)!,
        {
          catalogName,
          operationsName,
        },
      );
      save(p);
      publish();
    };
    rename(
      "Pastel 3 Leches · Edición aniversario",
      "3 Leches Cake · Anniversary",
    );
    rename("Pastel 3 Leches · Edición invierno", "3 Leches Cake · Winter");
    // Publishing something else again does not duplicate entries.
    const again = payload(product(target.id));
    again.variants.find((v) => v.skuId === sku)!.priceFils += 100;
    save(again);
    publish();
    const names = approvedOperationsNames(store.read());
    assert.deepEqual(names[sku], [
      {
        source: "Pastel 3 Leches · Edición aniversario",
        en: "3 Leches Cake · Anniversary",
      },
      {
        source: "Pastel 3 Leches · Edición invierno",
        en: "3 Leches Cake · Winter",
      },
    ]);
    // Staff-only: neither public catalog carries it.
    for (const body of [
      storefrontCatalog(store.read()),
      publicCatalog(store.read(), { limit: 100 }),
    ])
      assert.ok(!JSON.stringify(body).includes("Winter"));

    // Operations: the same rule as the reviewed dictionary, SKU plus exact definition.
    setPublishedProductNames(names);
    const current = operationalProductName(
      sku,
      "Pastel 3 Leches · Edición invierno",
    );
    assert.deepEqual(
      [current.name, current.reviewRequired],
      ["3 Leches Cake · Winter", false],
    );
    // An order accepted under the earlier name keeps that name's English.
    const accepted = orderProductName(
      {
        state: "Confirmed",
        catalogSnapshot: [
          {
            id: sku,
            name: "Pastel 3 Leches · Edición aniversario",
            priceFils: 1,
          },
        ],
      } as never,
      sku,
      [{ id: sku, name: "Pastel 3 Leches · Edición invierno" }],
    );
    assert.equal(accepted.name, "3 Leches Cake · Anniversary");
    assert.equal(accepted.reviewRequired, false);
    assert.equal(accepted.original, "Pastel 3 Leches · Edición aniversario");
    // The original, pre-Product Hub definition still resolves from the dictionary.
    const historical = operationalProductName(sku, first);
    assert.equal(historical.reviewRequired, false);
    assert.notEqual(historical.name, "3 Leches Cake · Winter");
    // A definition nobody approved keeps its original text and warns.
    const unknown = operationalProductName(sku, "Receta especial sin revisar");
    assert.deepEqual(
      [unknown.name, unknown.reviewRequired],
      ["Receta especial sin revisar", true],
    );
    // An approved name for one SKU never names another.
    assert.equal(
      operationalProductName(
        "another-sku",
        "Pastel 3 Leches · Edición invierno",
      ).reviewRequired,
      true,
    );
    // Published without an English name: Operations warns instead of guessing.
    const p = payload(product(target.id));
    Object.assign(
      p.variants.find((v) => v.skuId === sku)!,
      {
        catalogName: "Pastel 3 Leches · Sin traducir",
        operationsName: null,
      },
    );
    save(p);
    publish();
    setPublishedProductNames(approvedOperationsNames(store.read()));
    assert.equal(
      operationalProductName(sku, "Pastel 3 Leches · Sin traducir")
        .reviewRequired,
      true,
    );
  } finally {
    setPublishedProductNames(undefined);
    store.close();
  }
});
