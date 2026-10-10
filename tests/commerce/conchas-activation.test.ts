import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateCatalog } from "../../server/domain/catalog";
import { applyConchasActivation, CONCHAS_TO_ACTIVATE, planConchasActivation } from "../../server/domain/conchas-activation";
import { storefrontProductForSku, menuFamilyForSku } from "../../src/brand/menu";

const approved = validateCatalog(JSON.parse(readFileSync("data-imports/liza-current-menu.json", "utf8")));
const inactive = approved.map(item => item.id in CONCHAS_TO_ACTIVATE
  ? { ...item, active: false, availability: "unavailable" as const }
  : item);

test("the six approved Conchas SKUs have exact prices, names, images and purchase cards", () => {
  assert.equal(Object.keys(CONCHAS_TO_ACTIVATE).length, 6);
  for (const [id, target] of Object.entries(CONCHAS_TO_ACTIVATE)) {
    const item = approved.find(x => x.id === id)!;
    assert.equal(item.active, true, id);
    assert.equal(item.availability, "available", id);
    assert.equal(item.priceFils, target.priceFils, id);
    assert.equal(item.name, target.name, id);
    assert.equal(storefrontProductForSku(id)?.familyId, "conchas-traditional", id);
    assert.equal(menuFamilyForSku(id)?.options.find(x => x.id === id)?.priceFils, target.priceFils, id);
  }
});

test("activation touches exactly six products, is idempotent and fails closed", () => {
  const plan = planConchasActivation(inactive);
  assert.equal(plan.change.length, 6);
  assert.equal(plan.blocked.length, 0);
  const result = applyConchasActivation(inactive);
  assert.deepEqual(result, approved);
  assert.deepEqual(applyConchasActivation(result), result);
  assert.equal(planConchasActivation(result).change.length, 0);

  const broken = inactive.map(x => x.id === "conchas-traditional-vainilla-mini-40-g"
    ? { ...x, priceFils: 999 }
    : x);
  assert.equal(planConchasActivation(broken).blocked.length, 1);
  assert.throws(() => applyConchasActivation(broken), /blocked/);
});
