import { test } from "node:test";
import assert from "node:assert/strict";
import { cakeSizeForSku, cakeSizeName, cakeServingCopy, validCakeMessage } from "../../shared/cake-personalization";
import { commerceLineSchema, distinctLines, lineKey } from "../../shared/pack-composition";
import { renderOperationsEmail } from "../../server/domain/operations-email-template";

test("three physical 3L cake sizes keep existing SKU identity and canonical people ranges",()=>{
 for(const [id,size,max,people] of [
   ["tres-leches-classic-13-personas","Mini",15,"1–3"],
   ["tres-leches-classic-68-personas","Small",20,"6–8"],
   ["tres-leches-classic-1416-personas","Medium",30,"14–16"],
 ] as const){
   const policy=cakeSizeForSku(id);
   assert.ok(policy);assert.equal(cakeSizeName(policy),size);
   assert.equal(policy.maxCharacters,max);assert.equal(policy.people,people);
   assert.match(cakeServingCopy(policy,"es")!,/personas/);
 }
 const large=cakeSizeForSku("special-flavours-cake-berries-big");
 assert.equal(large?.key,"medium");
 assert.equal(large?.maxCharacters,30);
 assert.equal(large?.people,null);
});
test("cake inscriptions are permitted only on known cakes with size-dependent limits",()=>{
 const ids=["tres-leches-classic-13-personas","tres-leches-classic-68-personas","tres-leches-classic-1416-personas"];
 for(const [i,max] of [15,20,30].entries()){
   const id=ids[i]!;
   assert.equal(validCakeMessage(id,"A".repeat(max)),true);
   assert.equal(validCakeMessage(id,"A".repeat(max+1)),false);
   assert.equal(commerceLineSchema.safeParse({productId:id,quantity:1,cakeMessage:"A".repeat(max)}).success,true);
   assert.equal(commerceLineSchema.safeParse({productId:id,quantity:1,cakeMessage:"A".repeat(max+1)}).success,false);
 }
 for(const id of ["orejas-6-mini-60-g-cada-uno","pan-de-muerto-traditional-pack-6-mini","cake-jar-classic-110-ml","cake-topper-"]){
   assert.equal(cakeSizeForSku(id),null);
   assert.equal(commerceLineSchema.safeParse({productId:id,quantity:1,cakeMessage:"No allowed"}).success,false);
 }
 assert.equal(commerceLineSchema.safeParse({productId:ids[1],quantity:1,cakeMessage:"Line\nbreak"}).success,false);
});
test("two identically priced cakes with different inscriptions must be distinct lines",()=>{
 const a={productId:"tres-leches-classic-13-personas",quantity:1,cakeMessage:"Feliz Ana"};
 const b={...a,cakeMessage:"Feliz Luis"};
 assert.notEqual(lineKey(a),lineKey(b));
 assert.equal(distinctLines([a,b]),true);
 assert.equal(distinctLines([a,a]),false);
});
test("kitchen email renders the literal cake inscription and HTML-escapes customer markup",()=>{
 const input={
  reference:"#TEST",orderId:"synthetic",customer:"Test",phone:"—",email:"—",whatsapp:"—",pickup:true,
  date:"2026-11-25",time:"11:00",address:[],instructions:"",deliveryNotes:"",
  items:[{sku:"tres-leches-classic-13-personas",name:"Classic cake",quantity:1,priceFils:7500,isPack:false,
    cakeMessage:"<b>Happy</b>"}],
  amountFils:7500,quote:null,
 };
 const out=renderOperationsEmail(input);
 assert.match(out.text,/Cake inscription: <b>Happy<\/b>/);
 assert.match(out.html,/Cake inscription: &lt;b&gt;Happy&lt;\/b&gt;/);
 assert.doesNotMatch(out.html,/<b>Happy<\/b>/);
});
