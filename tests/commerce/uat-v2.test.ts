import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  storefrontProducts,
  menuFamilies,
  productFamily,
} from "../../src/brand/menu";
import { cartQuoteSchema } from "../../server/domain/web-checkout";
import { normalizeWhatsAppNumber } from "../../shared/contact";
import { availableSku } from "../../shared/commerce-policy";

test("UAT V2: every active SKU belongs to exactly one stable single-flavour product", () => {
  const catalog = JSON.parse(
    readFileSync("data-imports/liza-current-menu.json", "utf8"),
  ).items;
  assert.equal(storefrontProducts.length, 75);
  assert.equal(new Set(storefrontProducts.map((p) => p.id)).size, 75);
  assert.equal(new Set(storefrontProducts.map((p) => p.slug)).size, 75);
  const ids = storefrontProducts.flatMap((p) => p.optionIds);
  assert.equal(ids.length, 218);
  assert.equal(new Set(ids).size, 218);
  assert.deepEqual(
    [...ids].sort(),
    catalog
      .filter((p: { active: boolean }) => p.active)
      .map((p: { id: string }) => p.id)
      .sort(),
  );
  for (const p of storefrontProducts)
    assert.deepEqual(
      [...new Set(productFamily(p).options.map((o) => o.variant))],
      [p.variant],
    );
  assert.equal(
    catalog.filter((p: { active: boolean }) => !p.active).length,
    20,
  );
});
test("UAT V2: four traditional Concha flavours and filled Pistache retain approved prices", () => {
  const traditional = menuFamilies.find((f) => f.id === "conchas-traditional")!.options;
  assert.equal(traditional.length, 8);
  assert.deepEqual([...new Set(traditional.map((o) => o.variant))].sort(), ["Chocolate", "Pistache", "Tricolor", "Vainilla"]);
  for (const variant of ["Chocolate", "Pistache", "Tricolor", "Vainilla"]) {
    const prices = traditional.filter(o => o.variant === variant).map(o => o.priceFils);
    assert.deepEqual(prices, [1300, 1100]);
  }
  const filled = menuFamilies.find((f) => f.id === "conchas-filled")!.options;
  assert.deepEqual([...new Set(filled.map(o => o.variant))], ["Pistache"]);
  assert.deepEqual(filled.map(o => o.priceFils), [2100, 1800]);
});
test("UAT V2: direct quantity 40 and maximum 100 accepted, malformed quantities rejected on server", () => {
  for (const quantity of [1, 40, 100])
    assert.ok(
      cartQuoteSchema.safeParse({
        lines: [{ productId: "sku", quantity }],
        fulfillmentMethod: "pickup",
      }).success,
    );
  for (const quantity of [0, -1, 1.5, 101, "40", "4x", NaN])
    assert.equal(
      cartQuoteSchema.safeParse({
        lines: [{ productId: "sku", quantity }],
        fulfillmentMethod: "pickup",
      }).success,
      false,
    );
});
test("UAT V2: international WhatsApp requires an explicit country prefix and normalizes safely", () => {
  assert.equal(normalizeWhatsAppNumber("+52 (55) 1234-5678"), "+525512345678");
  assert.equal(normalizeWhatsAppNumber("0044 7700 900123"), "+447700900123");
  for (const value of [
    "0500000000",
    "5551234567",
    "+0 1234567",
    "+52abc",
    "+1234567890123456",
    "",
  ])
    assert.equal(normalizeWhatsAppNumber(value), null);
});
test("UAT V2: Pan singles available today while packs remain year-round", () => {
  const sku = "pan-de-muerto-traditional-azucar-mini-40-g";
  assert.equal(availableSku(sku, new Date("2026-10-03T00:00:00+04:00")), true);
  assert.equal(availableSku(sku, new Date("2026-11-16T00:00:00+04:00")), false);
  assert.equal(
    availableSku(
      "pan-de-muerto-traditional-pack-6-mini",
      new Date("2026-12-01"),
    ),
    true,
  );
});
