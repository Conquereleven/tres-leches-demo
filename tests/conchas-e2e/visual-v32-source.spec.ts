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
 const grid=page.locator(".ref32-grid");
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
 await expect(dialog).toHaveAttribute("data-anchor-side",/right|left|overlap/);
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
 const product=page.locator('[data-product-id="conchas-traditional-pack"]');
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
 const card=page.locator('[data-product-id="orejas"]');
 await expect(card).toBeEnabled();
 await card.click();
 const box=await card.locator(".ref32-photo").boundingBox();
 const dialog=page.getByRole("dialog");
 const pop=await dialog.boundingBox();
 expect(box).not.toBeNull();expect(pop).not.toBeNull();
 expect(box!.y+box!.height).toBeLessThanOrEqual(pop!.y+24);
 await expect(card).toHaveClass(/ref32-product-active/);
 expect(await page.locator(".ref32-grid").evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(3);
 const action=dialog.locator(".ref32-buy");
 await expect(action).toBeVisible();
 expect((await action.boundingBox())!.y+(await action.boundingBox())!.height).toBeLessThanOrEqual(845);
 if(info.project.name==="chromium"){
  mkdirSync("docs/brand/brand02/conchas",{recursive:true});
  await page.screenshot({path:"docs/brand/brand02/conchas/v32-source-REF-D-390.png",animations:"disabled"});
 }
});
test("short REF_D: footer stays in viewport while only details scroll",async ({page},info)=>{
 for(const size of [{width:375,height:667},{width:320,height:568}]){
  await page.setViewportSize(size);
  await page.goto("/visual-v32/bakery?category=bakery&lang=es");
  await page.locator('.ref32-product:not([disabled])').first().click();
  const dialog=page.getByRole("dialog"),action=dialog.locator(".ref32-buy");
  await expect(action).toBeVisible();
  const before=await action.boundingBox();
  await dialog.locator(".ref32-details").evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const after=await action.boundingBox();
  expect(before).not.toBeNull();expect(after).not.toBeNull();
  expect(Math.abs(before!.y-after!.y)).toBeLessThanOrEqual(2);
  expect(after!.y+after!.height).toBeLessThanOrEqual(size.height+1);
  if(info.project.name==="chromium"){
   mkdirSync("docs/brand/brand02/conchas",{recursive:true});
   await page.screenshot({path:"docs/brand/brand02/conchas/v32-source-REF-D-"+size.width+".png",animations:"disabled"});
  }
  await page.keyboard.press("Escape");
 }
});
test("real purchase: Orejas selected box SKU and amount reach canonical cart",async ({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto("/visual-v32/bakery?category=bakery&lang=es");
 await page.locator('[data-product-id="orejas"]').click();
 const dialog=page.getByRole("dialog");
 await dialog.locator('[data-pack-presentation="individual"]').click();
 await dialog.locator('[data-pack-pieces="12"]').click();
 await expect(dialog).toHaveAttribute("data-selected-sku","orejas-12-individuales-100-g-cada-uno");
 await expect(dialog.locator(".ref32-buy")).toBeEnabled();
 await dialog.locator(".ref32-buy").click();
 await expect(dialog).toHaveCount(0);
 expect(await page.evaluate(()=>{
  const items=JSON.parse(localStorage.getItem("3l-cart")||"[]") as {productId:string;quantity:number}[];
  return items.some(x=>x.productId==="orejas-12-individuales-100-g-cada-uno"&&x.quantity===1);
 })).toBe(true);
});
test("note safety: 40 character maximum and no silently lost kitchen instructions",async ({page})=>{
 await page.goto("/visual-v32/bakery?category=cakes&lang=es");
 await page.locator('[data-product-id="tres-leches--classic"]').click();
 const popup=page.getByRole("dialog"),note=popup.locator(".ref32-note input");
 await note.fill("Feliz cumpleaños ".repeat(5));
 await expect(note).toHaveValue("Feliz cumpleaños ".repeat(5).slice(0,40));
 await expect(popup.locator(".ref32-note-field output")).toHaveText("40/40");
 await expect(popup.locator(".ref32-buy")).toBeDisabled();
 await expect(popup.locator(".ref32-note-warning")).toBeVisible();
 await note.fill("");
 await expect(popup.locator(".ref32-buy")).toBeEnabled();
});
test("authoritative checkout disabled remains fail-closed",async ({page})=>{
 await page.route("**/api/checkout/config",route=>route.fulfill({status:503,contentType:"application/json",body:"{}"}));
 await page.goto("/visual-v32/bakery?lang=en");
 await expect(page.locator('.ref32-product:not([disabled])')).toHaveCount(0);
 await expect(page.getByRole("dialog")).toHaveCount(0);
});
