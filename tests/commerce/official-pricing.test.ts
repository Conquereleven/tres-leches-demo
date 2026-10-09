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
import { RETIRED_SKUS } from "../../shared/commerce-policy";
import { menuFamilies } from "../../src/brand/menu";
import { OFFICIAL_PRICES_FILS } from "../fixtures/official-prices-oct-2026";

const catalog = validateCatalog(
  JSON.parse(readFileSync("data-imports/liza-current-menu.json", "utf8")),
);
const storefront = new Map(
  menuFamilies.flatMap((f) => f.options.map((o) => [o.id, o] as const)),
);
const aed = (id: string) => OFFICIAL_PRICES_FILS[id]! / 100;

test("official price list: every row of the October 2026 menu", () => {
  // Written out row by row so the table Joel approved is readable here.
  const rows: [string, number][] = [
    ["pan-de-muerto-traditional-azucar-mini-40-g", 13],
    ["pan-de-muerto-traditional-azucar-individual-70-g", 15],
    ["pan-de-muerto-traditional-ajonjoli-mini-40-g", 13],
    ["pan-de-muerto-traditional-ajonjoli-individual-70-g", 15],
    ["pan-de-muerto-filled-crema-diplomatica-vainilla-mini", 21],
    ["pan-de-muerto-filled-crema-diplomatica-vainilla-individual", 23],
    ["pan-de-muerto-filled-chocolate-mini", 21],
    ["pan-de-muerto-filled-chocolate-individual", 23],
    ["pan-de-muerto-filled-mascarpone-y-cajeta-mini", 21],
    ["pan-de-muerto-filled-mascarpone-y-cajeta-individual", 23],
    ["pan-de-muerto-filled-mascarpone-y-fresas-mini", 21],
    ["pan-de-muerto-filled-mascarpone-y-fresas-individual", 23],
    ["pan-de-muerto-filled-pistachio-mini", 23],
    ["pan-de-muerto-filled-pistachio-individual", 26],
    ["conchas-traditional-vainilla-mini-40-g", 13],
    ["conchas-traditional-vainilla-individual-70-g", 15],
    ["conchas-traditional-chocolate-mini-40-g", 13],
    ["conchas-traditional-chocolate-individual-70-g", 15],
    ["conchas-traditional-pistache-mini-40-g", 13],
    ["conchas-traditional-pistache-individual-70-g", 15],
    ["conchas-traditional-tricolor-mini-40-g", 13],
    ["conchas-traditional-tricolor-individual-70-g", 15],
    ["conchas-filled-crema-diplomatica-vainilla-mini", 21],
    ["conchas-filled-crema-diplomatica-vainilla-individual", 23],
    ["conchas-filled-chocolate-mini", 21],
    ["conchas-filled-chocolate-individual", 23],
    ["conchas-filled-mascarpone-y-cajeta-mini", 21],
    ["conchas-filled-mascarpone-y-cajeta-individual", 23],
    ["conchas-filled-mascarpone-y-fresas-mini", 21],
    ["conchas-filled-mascarpone-y-fresas-individual", 23],
    ...["pan-de-muerto", "conchas"].flatMap((c): [string, number][] => [
      [`${c}-traditional-pack-6-mini`, 72],
      [`${c}-traditional-pack-12-mini`, 140],
      [`${c}-traditional-pack-6-individuales`, 80],
      [`${c}-traditional-pack-12-individuales`, 155],
      [`${c}-filled-pack-6-mini`, 120],
      [`${c}-filled-pack-12-mini`, 235],
      [`${c}-filled-pack-6-individuales`, 130],
      [`${c}-filled-pack-12-individuales`, 255],
    ]),
  ];
  assert.equal(rows.length, 46);
  for (const [id, price] of rows) {
    assert.equal(aed(id), price, id);
    const stored = catalog.find((p) => p.id === id);
    assert.equal(stored?.priceFils, price * 100, `server catalog ${id}`);
    // What the customer sees equals what the server charges.
    if (stored?.active)
      assert.equal(storefront.get(id)?.priceFils, price * 100, `menu ${id}`);
    else assert.equal(storefront.has(id), false, `${id} must stay unlisted`);
  }
  // The sugar bread with chocolate covering follows the traditional price.
  assert.equal(
    aed("pan-de-muerto-traditional-azucar-mini-40-g-chocolate-covering"),
    13,
  );
  assert.equal(
    aed("pan-de-muerto-traditional-azucar-individual-70-g-chocolate-covering"),
    15,
  );
  assert.equal(Object.keys(OFFICIAL_PRICES_FILS).length, 48);
});

test("the server charges the official price for every purchasable repriced SKU, alone and in quantity", () => {
  const store = new Store(":memory:", "test");
  store.write((s) => {
    s.catalog = catalog;
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
  let checked = 0;
  for (const [id, fils] of Object.entries(OFFICIAL_PRICES_FILS)) {
    if (!catalog.find((p) => p.id === id)?.active) continue;
    for (const quantity of [1, 3]) {
      const quote = quoteWebCheckout(service, {
        fulfillmentMethod: "pickup",
        lines: [{ productId: id, quantity }],
      });
      assert.equal(quote.subtotalFils, fils * quantity, id);
    }
    checked++;
  }
  assert.equal(checked, 34);
});

test("nothing outside the official list changed price, availability or identity", () => {
  const released = JSON.parse(
    execFileSync(
      "git",
      ["show", "4838030:data-imports/liza-current-menu.json"],
      { encoding: "utf8", maxBuffer: 1 << 26 },
    ),
  ).items as { id: string; priceAed: string; active: boolean; name: string }[];
  const now = JSON.parse(
    readFileSync("data-imports/liza-current-menu.json", "utf8"),
  ).items as typeof released;
  assert.deepEqual(
    now.map((i) => i.id),
    released.map((i) => i.id),
  );
  for (const before of released) {
    const after = now.find((i) => i.id === before.id)!;
    assert.equal(after.name, before.name);
    if (!(before.id in OFFICIAL_PRICES_FILS))
      assert.equal(after.priceAed, before.priceAed, before.id);
    // Only the six removed combinations changed availability.
    assert.equal(
      after.active,
      RETIRED_SKUS.has(before.id) ? false : before.active,
      before.id,
    );
  }
  // Not on the October list: left exactly as it was, pending Joel's decision.
  for (const [id, price] of [
    ["conchas-filled-pistache-mini", "18.00"],
    ["conchas-filled-pistache-individual", "21.00"],
  ] as const)
    assert.equal(now.find((i) => i.id === id)!.priceAed, price);
  // The removed combinations were not repriced or brought back.
  for (const id of RETIRED_SKUS) {
    assert.equal(id in OFFICIAL_PRICES_FILS, false);
    assert.equal(storefront.has(id), false);
  }
});
