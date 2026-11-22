import assert from "node:assert/strict";
import test from "node:test";
import source from "../../src/brand/menu-data.json";
import { packChoices, packQtyLabel, presentationLabel, toPackChoice } from "../../src/brand/visual-v32/catalog-options";
import { minimumOrderQuantity } from "../../shared/minimum-quantity";

test("3L publishes real half-dozen/dozen SKUs at both mini and individual sizes",()=>{
 const family=source.families.find(f=>f.id==="pan-de-muerto-traditional-pack");
 assert.ok(family);
 const pack=packChoices(family.options);
 assert.ok(pack);
 assert.deepEqual(pack.quantities,[6,12]);
 assert.deepEqual(pack.presentations,["mini","individual"]); // order is sourced from the canonical menu option data
 const six=pack.choices.find(c=>c.pieces===6&&c.presentation==="mini");
 const twelve=pack.choices.find(c=>c.pieces===12&&c.presentation==="mini");
 assert.equal(six?.option.id,"pan-de-muerto-traditional-pack-6-mini");
 assert.equal(twelve?.option.id,"pan-de-muerto-traditional-pack-12-mini");
 assert.equal(six?.option.priceFils,6000);
 assert.equal(twelve?.option.priceFils,11500);
});
test("3L standalone bakery preserves six-piece packaging without changing unit MOQ",()=>{
 const family=source.families.find(f=>f.id==="orejas");assert.ok(family);
 const parsed=packChoices(family.options);assert.ok(parsed);
 assert.deepEqual(parsed.quantities,[1,6,12]);
 assert.equal(parsed.choices.find(c=>c.presentation==="individual"&&c.pieces===12)?.option.id,"orejas-12-individuales-100-g-cada-uno");
 assert.equal(minimumOrderQuantity("orejas-12-individuales-100-g-cada-uno"),1);
 assert.equal(minimumOrderQuantity("pan-de-muerto-traditional-azucar-mini-40-g"),6);
 assert.equal(minimumOrderQuantity("B111"),6);
 assert.equal(minimumOrderQuantity("pan-de-muerto-traditional-pack-6-mini"),1);
});
test("no invented package mapping for ambiguous or nonpack menu options",()=>{
 const mock={id:"t",variant:"",size:"6 mini",priceFils:1000};
 assert.equal(packChoices([mock,{...mock,id:"u"}]),null);
 assert.equal(packChoices([{...mock,size:"100 ml"}]),null);
 assert.equal(toPackChoice({...mock,size:"12 individuales · 70 g"}).pieces,12);
 assert.equal(packQtyLabel(6,"es"),"Media docena");
 assert.equal(packQtyLabel(12,"es"),"Docena");
 assert.equal(presentationLabel("individual","es"),"Individual");
});
