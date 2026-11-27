import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * V3.2 source-locked acceptance, based on the actual approved ZIP's
 * ProductCard/ProductPopup and REF_C/REF_D, not old patched DOM selectors.
 * Every screenshot is from the integrated React build at the exact CI HEAD.
 */
test("source REF_C: four-column desktop cards with anchored original popup",async ({page},info)=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto("/visual-v32/bakery?category=bakery&lang=es");
 const grid=page.locator(".structural-grid");
 await expect(grid).toBeVisible();
 expect(await grid.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(4);
 const product=page.locator('.ref32-product:not([disabled])').first();
 await product.click();
 const dialog=page.locator(".ref32-dialog");
 await expect(dialog).toBeVisible();
 await expect(dialog.locator(".ref32-dialog-heading")).toBeVisible();
 await expect(dialog.locator(".ref32-options")).toBeVisible();
 await expect(dialog.locator(".ref32-buy")).toBeVisible();
 await expect(product).toHaveAttribute("aria-expanded","true");
 const anchor=await product.boundingBox(),box=await dialog.boundingBox();
 expect(anchor).not.toBeNull();expect(box).not.toBeNull();
 expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(1441);
 await expect(dialog).toHaveAttribute("data-placement","side");
 if(info.project.name==="chromium"){
  mkdirSync("docs/brand/brand02/conchas",{recursive:true});
  await page.screenshot({path:"docs/brand/brand02/conchas/v32-source-REF-C-1440.png",animations:"disabled"});
 }
 await page.keyboard.press("Escape");
 await expect(dialog).toHaveCount(0);
 await expect(product).toBeFocused();
});
test("source REF_C: four direct real-SKU purchase choices have no technical two-step matrix",async ({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto("/visual-v32/bakery?category=mexican&lang=es");
 const product=page.locator('.ref32-product[data-product-id="conchas-traditional-pack"]');
 await expect(product).toBeEnabled();
 await product.click();
 const dialog=page.getByRole("dialog");
 const opts=dialog.locator(".ref32-options-four .ref32-option");
 await expect(opts).toHaveCount(4);
 await expect(opts).toContainText(["Media docena (Mini)","Media docena (Individual)","Docena (Mini)","Docena (Individual)"]);
 const chosen=opts.nth(3),sku=await chosen.getAttribute("data-sku");
 expect(sku).toBeTruthy();
 await chosen.click();
 await expect(dialog).toHaveAttribute("data-selected-sku",sku!);
 await expect(chosen).toHaveAttribute("aria-pressed","true");
 await expect(dialog.locator(".ref32-price strong")).toContainText("AED");
});
test("source REF_D: selected card image stays visibly linked above popup",async ({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto("/visual-v32/bakery?category=bakery&lang=es");
 const card=page.locator('.ref32-product[data-product-id="orejas"]');
 await expect(card).toBeEnabled();
 await card.click();
 const box=await card.locator(".ref32-photo").boundingBox();
 const dialog=page.getByRole("dialog");
 const pop=await dialog.boundingBox();
 expect(box).not.toBeNull();expect(pop).not.toBeNull();
 expect(box!.y+box!.height).toBeLessThanOrEqual(pop!.y+24);
 await expect(card).toHaveAttribute("aria-expanded","true");
 await expect(card.locator("..")).toHaveClass(/is-selected/);
 expect(await page.locator(".structural-grid").evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(2);
 const action=dialog.locator(".ref32-buy");
 await action.scrollIntoViewIfNeeded();
 await expect(action).toBeInViewport();
 expect((await action.boundingBox())!.y+(await action.boundingBox())!.height).toBeLessThanOrEqual(845);
 if(info.project.name==="chromium"){
  mkdirSync("docs/brand/brand02/conchas",{recursive:true});
  await page.screenshot({path:"docs/brand/brand02/conchas/v32-source-REF-D-390.png",animations:"disabled"});
 }
 await page.setViewportSize({width:600,height:900});
 expect(await page.locator(".structural-grid").evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(3);
});
test("short REF_D: contextual controls remain reachable without moving the product grid",async ({page},info)=>{
 for(const size of [{width:375,height:667},{width:320,height:568}]){
  await page.setViewportSize(size);
  await page.goto("/visual-v32/bakery?category=bakery&lang=es");
  const cards=page.locator(".structural-grid .tile");
  const product=cards.locator('button:not([disabled])').first();
  await expect(product).toBeEnabled();
  await product.evaluate(async()=>{await document.fonts.ready;});
  const positions=()=>cards.evaluateAll(nodes=>nodes.map(node=>{
   const box=node.getBoundingClientRect();
   return [box.left+scrollX,box.top+scrollY,box.width,box.height].map(Math.round);
  }));
  const before=await positions();
  await product.click();
  const dialog=page.getByRole("dialog"), action=dialog.locator(".ref32-buy");
  await expect(dialog).toHaveCSS("position","absolute");
  await expect(dialog).toHaveAttribute("data-placement",/above|below/);
  expect(await positions()).toEqual(before);
  const bounds=await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(size.width+1);
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
  await expect(action).toBeEnabled();
  expect(await positions()).toEqual(before);
  if(info.project.name==="chromium"){
   mkdirSync("docs/brand/brand02/conchas",{recursive:true});
   await page.screenshot({path:"docs/brand/brand02/conchas/v32-source-REF-D-"+size.width+".png",animations:"disabled"});
  }
  await page.keyboard.press("Escape");
  await expect(product).toBeFocused();
  expect(await positions()).toEqual(before);
 }
});
test("real purchase: Orejas selected box SKU and amount reach canonical cart",async ({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto("/visual-v32/bakery?category=bakery&lang=es");
 await page.locator('.ref32-product[data-product-id="orejas"]').click();
 const dialog=page.getByRole("dialog");
 await expect(dialog.locator('.ref32-presentation button[aria-pressed="true"]')).toHaveCount(1);
 await expect(dialog.locator('[data-pack-pieces="6"]')).toBeEnabled();
 await expect(dialog.locator('[data-pack-pieces="12"]')).toBeEnabled();
 await dialog.locator('[data-pack-presentation="individual"]').click();
 await dialog.locator('[data-pack-pieces="12"]').click();
 await expect(dialog).toHaveAttribute("data-selected-sku","orejas-12-individuales-100-g-cada-uno");
 await expect(dialog.locator(".ref32-buy")).toBeEnabled();
 const ctaBounds=await dialog.locator(".ref32-buy").boundingBox();
 expect(ctaBounds).not.toBeNull();
 expect(ctaBounds!.y+ctaBounds!.height).toBeLessThanOrEqual(901);
 await dialog.locator(".ref32-buy").click();
 await expect(dialog).toHaveCount(0);
 expect(await page.evaluate(()=>{
  const items=JSON.parse(localStorage.getItem("3l-cart")||"[]") as {productId:string;quantity:number}[];
  return items.some(x=>x.productId==="orejas-12-individuales-100-g-cada-uno"&&x.quantity===1);
 })).toBe(true);
});
test("Founder 8.7: cakes use Mini/Small/Medium with 15/20/30 characters and servings in description",async ({page},info)=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto("/visual-v32/bakery?category=cakes&lang=es");
 const card=page.locator('.ref32-product[data-product-id="tres-leches--classic"]');
 await card.click();
 const popup=page.getByRole("dialog");
 const options=popup.locator(".ref32-options .ref32-option");
 await expect(options).toHaveCount(3);
 await expect(options.nth(0)).toContainText("Mini");
 await expect(options.nth(1)).toContainText("Pequeño");
 await expect(options.nth(2)).toContainText("Mediano");
 await expect(popup.locator("[data-cake-serves]")).toHaveText("Para 1–3 personas");
 await expect(popup.locator("[data-cake-message-count]")).toHaveText("0/15");
 await options.nth(1).click();
 await expect(popup.locator("[data-cake-serves]")).toHaveText("Para 6–8 personas");
 await expect(popup.locator("[data-cake-message-count]")).toHaveText("0/20");
 await options.nth(2).click();
 await expect(popup.locator("[data-cake-serves]")).toHaveText("Para 14–16 personas");
 await expect(popup.locator("[data-cake-message-count]")).toHaveText("0/30");
 const text=popup.locator(".ref32-note input");
 await text.fill("Feliz cumple 3L");
 await expect(popup.locator(".ref32-buy")).toBeEnabled();
 if(info.project.name==="chromium"){
  mkdirSync("docs/brand/brand02/conchas",{recursive:true});
  await page.screenshot({path:"docs/brand/brand02/conchas/v32-source-cake-Mini-Small-Medium-1440.png",animations:"disabled"});
 }
 await options.nth(0).click();
 await expect(text).toHaveValue("Feliz cumple 3L");
 await expect(popup.locator("[data-cake-message-count]")).toHaveText("15/15");
 await expect(popup.locator(".ref32-buy")).toBeEnabled();
 await options.nth(2).click();
 await text.fill("Feliz cumpleaños y mucho amor");
 await expect(popup.locator("[data-cake-message-count]")).toHaveText("29/30");
 await options.nth(0).click();
 await expect(popup.locator("[data-cake-message-count]")).toHaveText("29/15");
 await expect(popup.locator(".ref32-note-warning")).toBeVisible();
 await expect(popup.locator(".ref32-buy")).toBeDisabled();
 await text.fill("Feliz cumple");
 await expect(popup.locator(".ref32-buy")).toBeEnabled();
 await popup.locator(".ref32-buy").click();
 await expect(popup).toHaveCount(0);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("3l-cart")||"[]"));
 expect(saved.some((l:{productId:string;cakeMessage?:string})=>l.productId==="tres-leches-classic-13-personas"&&l.cakeMessage==="Feliz cumple")).toBe(true);
 await page.goto("/visual-v32/cart?lang=es");
 await expect(page.locator("[data-cart-cake-message]")).toContainText("Feliz cumple");
});
test("Founder 8.7 mobile: three cake sizes, 15/20/30 limits and visible CTA",async ({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto("/visual-v32/bakery?category=cakes&lang=en");
 await page.locator('.ref32-product[data-product-id="tres-leches--classic"]').click();
 const popup=page.getByRole("dialog");
 const sizes=popup.locator('[data-cake-sizes="Mini-Small-Medium"]');
 await expect(sizes).toBeVisible();
 expect(await sizes.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(3);
 const choices=sizes.locator("button");
 await expect(choices).toHaveCount(3);
 await choices.nth(2).click();
 await expect(popup.locator("[data-cake-serves]")).toContainText("14–16");
 await expect(popup.locator("[data-cake-message-count]")).toHaveText("0/30");
 await popup.locator(".ref32-note input").fill("Happy Birthday 3L");
 const action=popup.locator(".ref32-buy");
 await expect(action).toBeEnabled();
 await action.scrollIntoViewIfNeeded();
 await expect(action).toBeInViewport();
 const rect=await action.boundingBox();
 expect(rect).not.toBeNull();
 expect(rect!.y+rect!.height).toBeLessThanOrEqual(845);
 if(info.project.name==="chromium"){
   mkdirSync("docs/brand/brand02/conchas",{recursive:true});
   await page.screenshot({path:"docs/brand/brand02/conchas/v32-source-cake-Mini-Small-Medium-390.png",animations:"disabled"});
 }
});
test("Founder 8.7: no inscription field for Bakery, Conchas or Orejas",async ({page})=>{
 await page.goto("/visual-v32/bakery?category=bakery&lang=es");
 await page.locator('.ref32-product[data-product-id="orejas"]').click();
 await expect(page.getByRole("dialog").locator(".ref32-note")).toHaveCount(0);
 await page.keyboard.press("Escape");
 await page.goto("/visual-v32/bakery?category=mexican&lang=es");
 await page.locator('.ref32-product[data-product-id="conchas-traditional-pack"]').click();
 await expect(page.getByRole("dialog").locator(".ref32-note")).toHaveCount(0);
});
test("Founder 8.7: Special Flavours Big displays Medium, with no invented serving range",async ({page})=>{
 await page.goto("/visual-v32/bakery?category=cakes&lang=en");
 const card=page.locator('.ref32-product[data-product-id="special-flavours-cake--berries"]');
 await expect(card).toBeEnabled();
 await card.click();
 const popup=page.getByRole("dialog"),buttons=popup.locator(".ref32-option");
 await expect(buttons).toHaveCount(3);
 await expect(buttons.nth(0)).toContainText("Mini");
 await expect(buttons.nth(1)).toContainText("Small");
 await expect(buttons.nth(2)).toContainText("Medium");
 await expect(popup.locator("[data-cake-serves]")).toHaveCount(0);
 await buttons.nth(2).click();
 await expect(popup.locator("[data-cake-message-count]")).toHaveText("0/30");
});
test("authoritative checkout disabled remains fail-closed",async ({page})=>{
 await page.route("**/api/checkout/config",route=>route.fulfill({status:503,contentType:"application/json",body:"{}"}));
 await page.goto("/visual-v32/bakery?lang=en");
 await expect(page.locator('.ref32-product:not([disabled])')).toHaveCount(0);
 await expect(page.getByRole("dialog")).toHaveCount(0);
});
