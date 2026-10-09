import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { validateCatalog } from "../../server/domain/catalog";
import { quoteWebCheckout } from "../../server/domain/web-checkout";
import { availableSku, RETIRED_SKUS } from "../../shared/commerce-policy";
import {
  menuFamilies,
  menuFamilyForSku,
  storefrontProducts,
  storefrontProductForSku,
} from "../../src/brand/menu";
import { productMediaAssignments } from "../../src/brand/media";

const REMOVED = [
  "pan-de-muerto-traditional--ajonjoli-chocolate-covering",
  "pan-de-muerto-filled--crema-diplomatica-vainilla-chocolate-covering",
  "pan-de-muerto-filled--chocolate-chocolate-covering",
  "pan-de-muerto-filled--mascarpone-y-cajeta-chocolate-covering",
  "pan-de-muerto-filled--pistachio-chocolate-covering",
  "pan-de-muerto-filled--mascarpone-y-fresas-chocolate-covering",
];
const imported = () =>
  JSON.parse(readFileSync("data-imports/liza-current-menu.json", "utf8"));
/** The same file at the released commit: what the six removals must not disturb. */
const released = (path: string) =>
  JSON.parse(
    execFileSync("git", ["show", `4838030:${path}`], {
      encoding: "utf8",
      maxBuffer: 1 << 26,
    }),
  );

test("the six unauthorized Pan de Muerto combinations are gone from the storefront", () => {
  assert.equal(RETIRED_SKUS.size, 12);
  for (const slug of REMOVED) {
    assert.ok(
      !storefrontProducts.some((p) => p.id === slug || p.slug === slug),
    );
    assert.ok(!productMediaAssignments.some((p) => p.productId === slug));
  }
  for (const sku of RETIRED_SKUS) {
    assert.equal(menuFamilyForSku(sku), undefined);
    assert.equal(storefrontProductForSku(sku), undefined);
    // In season or out, a retired SKU is never listed or orderable.
    assert.equal(availableSku(sku, new Date("2026-10-20T08:00:00Z")), false);
    const item = imported().items.find((i: { id: string }) => i.id === sku);
    assert.equal(item.active, false);
    assert.equal(item.availability, "unavailable");
  }
  const variants = menuFamilies
    .filter((f) => f.category === "pan")
    .flatMap((f) => f.options.map((o) => o.variant));
  assert.deepEqual(
    [...new Set(variants.filter((v) => v.includes("Chocolate covering")))],
    ["Azúcar · Chocolate covering"],
  );
});

test("a cart holding a removed combination cannot be quoted or paid, even if a stored catalog still lists it", () => {
  const store = new Store(":memory:", "test");
  store.write((s) => {
    // Production's stored catalog predates the removal: every SKU still active.
    s.catalog = validateCatalog(imported()).map((p) => ({
      ...p,
      active: true,
      availability: "available" as const,
    }));
  });
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    new PaymenntProvider({
      apiKey: "fixture",
      apiSecret: "fixture",
      environment: "test",
    }),
  );
  for (const sku of RETIRED_SKUS)
    assert.throws(
      () =>
        quoteWebCheckout(service, {
          fulfillmentMethod: "pickup",
          lines: [
            { productId: "pan-de-muerto-traditional-pack-6-mini", quantity: 1 },
            { productId: sku, quantity: 1 },
          ],
        }),
      /Product unavailable/,
    );
});

test("every other product keeps its SKUs, variants, sizes and prices", () => {
  const before = released("src/brand/menu-data.json");
  const after = JSON.parse(readFileSync("src/brand/menu-data.json", "utf8"));
  assert.deepEqual(after.categories, before.categories);
  assert.deepEqual(
    after.families,
    before.families.map((f: { options: { id: string }[] }) => ({
      ...f,
      options: f.options.filter((o) => !RETIRED_SKUS.has(o.id)),
    })),
  );
  const productsBefore = released("shared/storefront-products.json");
  assert.deepEqual(
    storefrontProducts,
    productsBefore.filter((p: { id: string }) => !REMOVED.includes(p.id)),
  );
  const importBefore = released("data-imports/liza-current-menu.json");
  assert.deepEqual(
    imported().items.filter((i: { id: string }) => !RETIRED_SKUS.has(i.id)),
    importBefore.items.filter((i: { id: string }) => !RETIRED_SKUS.has(i.id)),
  );
  for (const [variant, family, price] of [
    ["Azúcar", "pan-de-muerto-traditional", 1300],
    ["Ajonjolí", "pan-de-muerto-traditional", 1300],
    ["Azúcar · Chocolate covering", "pan-de-muerto-traditional", 1300],
    ["Crema diplomática (vainilla)", "pan-de-muerto-filled", 2100],
    ["Chocolate", "pan-de-muerto-filled", 2100],
    ["Mascarpone y cajeta", "pan-de-muerto-filled", 2100],
    ["Mascarpone y fresas", "pan-de-muerto-filled", 2100],
    ["Pistachio", "pan-de-muerto-filled", 2100],
  ] as const) {
    const options = menuFamilies
      .find((f) => f.id === family)!
      .options.filter((o) => o.variant === variant);
    assert.equal(options.length, 2);
    assert.equal(Math.max(...options.map((o) => o.priceFils)), price);
    for (const o of options)
      assert.equal(availableSku(o.id, new Date("2026-10-20T08:00:00Z")), true);
  }
});
