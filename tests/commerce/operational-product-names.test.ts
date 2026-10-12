import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../../data-imports/liza-current-menu.json";
import names from "../../src/commerce/ops-product-names.json";
import {
  operationalProductName,
  orderProductName,
  productSearchText,
} from "../../src/commerce/product-names";
import { ticketSnapshot } from "../../src/commerce/ticket-snapshot";

const id = "pan-de-muerto-filled-crema-diplomatica-vainilla-mini";
const sample = catalog.items.find(
  (p) => p.name.includes("Crema diplomática") && p.name.includes("Mini"),
)!;
test("every supported active and historical catalog SKU has a complete English display mapping", () => {
  assert.equal(Object.keys(names).length, catalog.items.length);
  for (const p of catalog.items) {
    const result = operationalProductName(p.id, p.name);
    assert.equal(result.reviewRequired, false, p.id);
    assert.ok(result.name.trim());
    assert.doesNotMatch(
      result.name,
      /rellen[oa]|tradicional|vainilla|personas|piezas|fresas|cada uno|Azúcar|Ajonjolí|Pistache|Mascarpone y/,
    );
    assert.equal(operationalProductName(p.id, result.name).name, result.name);
  }
});
test("unknown or changed SKU definitions retain original identity and require review", () => {
  for (const sku of [id, sample.id, "__proto__", "new-product"]) {
    const result = operationalProductName(sku, "Receta especial del cliente");
    assert.equal(result.name, "Receta especial del cliente");
    assert.equal(result.reviewRequired, true);
  }
  assert.equal(operationalProductName(sample.id).name, sample.id);
  assert.equal(operationalProductName(sample.id).reviewRequired, true);
});
test("historical translation preserves accepted names, prices and quantities after current catalog changes", () => {
  const order = {
    state: "Confirmed" as const,
    lines: [{ productId: sample.id, quantity: 3 }],
    catalogSnapshot: [
      { id: sample.id, name: sample.name, priceFils: 1800, active: true },
    ],
  };
  const before = structuredClone(order);
  const changed = [
    { id: sample.id, name: "A different recipe", priceFils: 99900 },
  ];
  const name = orderProductName(order, sample.id, changed);
  assert.match(name.name, /Vanilla diplomat cream/);
  const ticket = ticketSnapshot(order)!;
  assert.equal(ticket[0]!.priceFils, 1800);
  assert.equal(ticket[0]!.quantity, 3);
  assert.equal(ticket[0]!.name, sample.name);
  assert.deepEqual(order, before);
  assert.equal(
    orderProductName({ state: "Confirmed" }, sample.id, changed).reviewRequired,
    true,
  );
  assert.equal(
    orderProductName({ state: "Confirmed" }, sample.id, changed).name,
    sample.id,
  );
});
test("search indexes original English and SKU identification without modifying stored facts", () => {
  const result = operationalProductName(sample.id, sample.name);
  const search = productSearchText(result, sample.id).toLowerCase();
  assert.ok(search.includes("crema diplomática"));
  assert.ok(search.includes("vanilla diplomat cream"));
  assert.ok(search.includes(sample.id));
});
