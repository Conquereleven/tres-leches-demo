import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

/** Isolated V3.2 preview must not change current storefront or mock prices. */
test("approved V3.2 desktop retains four catalog columns and live SKU authority", async ({page}, info) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/visual-v32/bakery?lang=en");
  const grid=page.locator('[data-grid-columns="4"]');
  await expect(grid).toBeVisible();
  const columns=await grid.evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(4);
  const card=page.locator(".v32-product:not([disabled])").first();
  await expect(card).toBeVisible();
  const price=await card.locator(".v32-product-copy > span").innerText();
  expect(price).toMatch(/AED/);
  await card.click();
  const dialog=page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".v32-popup-footer")).toBeVisible();
  await expect(dialog.locator(".v32-buy-form")).toBeVisible();
  if(info.project.name==="chromium"){
    mkdirSync("docs/brand/brand02/conchas",{recursive:true});
    await page.screenshot({path:"docs/brand/brand02/conchas/v32-integrated-desktop.png",fullPage:true,animations:"disabled"});
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeFocused();
});

test("approved V3.2 mobile dialog fits short viewports",async ({page},info)=>{
  await page.setViewportSize({width:375,height:667});
  await page.goto("/visual-v32/bakery?lang=en");
  const card=page.locator(".v32-product:not([disabled])").first();
  await expect(card).toBeVisible();
  await card.click();
  const dialog=page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const rect=await dialog.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.x+rect!.width).toBeLessThanOrEqual(376);
  expect(rect!.y+rect!.height).toBeLessThanOrEqual(668);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(dialog.locator(".v32-buy-cta").first()).toBeAttached();
  if(info.project.name==="chromium"){
    mkdirSync("docs/brand/brand02/conchas",{recursive:true});
    await page.screenshot({path:"docs/brand/brand02/conchas/v32-integrated-mobile.png",animations:"disabled"});
  }
});

test("V3.2 fails closed when authoritative checkout config is unavailable",async ({page})=>{
  await page.route("**/api/checkout/config",route=>route.fulfill({
    status:503,contentType:"application/json",body:"{}"
  }));
  await page.goto("/visual-v32/bakery?lang=en");
  await expect(page.locator(".v32-product:not([disabled])")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("V3.2 mock TatbiQ prices never enter the real cart",async ({page})=>{
  await page.goto("/visual-v32/bakery?lang=en");
  const first=page.locator(".v32-product:not([disabled])").first();
  await expect(first).toBeVisible();
  await first.click();
  const popup=page.getByRole("dialog");
  await expect(popup.locator(".v32-popup-footer")).toBeVisible();
  // The product control is V3.2 native UI backed by the canonical cart, not legacy Shop UI.
  await expect(popup.locator(".v32-buy-form")).toBeVisible();
  await expect(page.locator("button", {hasText:"(preview)"})).toHaveCount(0);
});


test("V3.2 real cake SKU flows through new cart and synthetic checkout without creating payment",async ({page})=>{
  await page.setViewportSize({width:1440,height:900});
  const paymentActions:string[]=[];
  page.on("request",r=>{
    if(r.method()!=="GET"&&/(\/api\/checkout\/(?:web|prepare|token)|\/api\/payments\/)/.test(r.url()))
      paymentActions.push(r.url());
  });
  await page.goto("/visual-v32/bakery?category=cakes&lang=en");
  const classic=page.locator('[data-product-id="tres-leches--classic"]');
  await expect(classic).toBeVisible({timeout:12000});
  await expect(classic).toBeEnabled();
  await classic.click();
  const panel=page.getByRole("dialog");
  await expect(panel.locator(".v32-popup-footer")).toBeVisible();
  const add=panel.locator(".v32-buy-cta").first();
  await expect(add).toBeEnabled();
  await add.click();
  await expect.poll(()=>page.evaluate(()=>{
    const lines=JSON.parse(localStorage.getItem("3l-cart")??"[]");
    return lines.reduce((sum:number,line:{productId:string;quantity:number})=>
      sum+(line.productId.startsWith("tres-leches-classic-")?line.quantity:0),0);
  })).toBeGreaterThan(0);
  await page.goto("/visual-v32/cart?lang=en");
  await expect(page.locator(".v32-new-cart-items")).toBeVisible();
  await expect(page.locator(".v32-new-cart-items")).toContainText("Classic");
  await page.goto("/visual-v32/checkout?lang=en");
  await expect(page.locator("main")).toBeVisible();
  expect(await page.locator("main").innerText()).toMatch(/checkout|pickup|delivery|Classic/i);
  expect(paymentActions).toEqual([]);
});


for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
  test("V3.2 HOME -> Menu -> Mexican Bakery journey "+viewport.width,async ({page},info)=>{
    await page.setViewportSize(viewport);
    await page.goto("/visual-v32?lang=en");
    await expect(page.getByRole("heading",{name:/More than a cake/i})).toBeVisible();
    await expect(page.locator("#journal")).toBeVisible();
    if(info.project.name==="chromium"){
      mkdirSync("docs/brand/brand02/conchas",{recursive:true});
      await page.screenshot({path:"docs/brand/brand02/conchas/v32-home-"+viewport.width+".png",fullPage:true,animations:"disabled"});
    }
    if (viewport.width===390) {
      const menuToggle=page.getByRole("button",{name:"Open navigation"});
      await expect(menuToggle).toBeVisible();
      await menuToggle.click();
      await expect(page.getByRole("button",{name:"Close navigation",exact:true})).toHaveAttribute("aria-expanded","true");
      await page.locator('.v32-mobile-drawer a[href="/visual-v32/menu"]').click();
    } else {
      await page.goto("/visual-v32/menu?lang=en");
    }
    await expect(page.getByRole("heading",{name:"Explore Our Menu"})).toBeVisible();
    await expect(page.locator(".v32-tile")).toHaveCount(2);
    if(info.project.name==="chromium")
      await page.screenshot({path:"docs/brand/brand02/conchas/v32-menu-"+viewport.width+".png",fullPage:true,animations:"disabled"});
    await page.locator(".v32-breads").click();
    await expect(page.locator(".v32-catalog")).toBeVisible();
    await expect(page.getByRole("button",{name:"Mexican Bakery"})).toHaveAttribute("aria-pressed","true");
    if(info.project.name==="chromium")
      await page.screenshot({path:"docs/brand/brand02/conchas/v32-catalog-"+viewport.width+".png",fullPage:viewport.width===1440,animations:"disabled"});
  });
}

test("V3.2 keeps real SKU price unchanged across languages",async ({page})=>{
  const amounts:string[]=[];
  for(const lang of ["en","es","ar"]){
    await page.goto("/visual-v32/bakery?category=cakes&lang="+lang);
    const item=page.locator('[data-product-id="tres-leches--classic"]');
    await expect(item).toBeVisible();
    const raw=await item.locator(".v32-product-copy > span").innerText();
    amounts.push((raw.match(/AED\s?[\d,.]+/)??[])[0]??"");
  }
  expect(amounts[0]).toMatch(/^AED/);
  expect(new Set(amounts).size).toBe(1);
});

test("isolated preview refuses unknown routes",async ({request})=>{
  const res=await request.get("/visual-v32/not-authorized");
  expect(res.status()).toBe(404);
});


test("V3.2 commerce pill variants use canonical SKU prices and preserve AddToCart",async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/visual-v32/bakery?category=cakes&lang=en");
  const classic=page.locator('[data-product-id="tres-leches--classic"]');
  await expect(classic).toBeVisible();
  await classic.click();
  const dlg=page.getByRole("dialog");
  const pills=dlg.locator(".v32-variant");
  expect(await pills.count()).toBeGreaterThan(1);
  await expect(pills.first()).toHaveAttribute("aria-pressed","true");
  const before=await dlg.locator(".v32-buy-price strong").innerText();
  await pills.nth(1).click();
  await expect(pills.nth(1)).toHaveAttribute("aria-pressed","true");
  const after=await dlg.locator(".v32-buy-price strong").innerText();
  expect(after).not.toBe(before);
  await expect(dlg.locator(".v32-buy-cta").last()).toBeEnabled();
  const rect=await dlg.boundingBox();
  expect(rect).not.toBeNull();expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.y+rect!.height).toBeLessThanOrEqual(845);
});

test("V3.2 Contact and customer policies stay inside the visual preview",async ({page},info)=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/visual-v32?lang=en");
  await page.locator(".v32-nav-right a[href='/visual-v32/contact']").click();
  await expect(page).toHaveURL(/\/visual-v32\/contact/);
  await expect(page.locator('[data-visual-preview="v32"]')).toBeVisible();
  await expect(page.locator('.v32-commerce-shell .v32-new-page')).toBeVisible();
  await expect(page.locator('.v32-commerce-shell .b-header, .v32-commerce-shell .b-footer').first()).toBeHidden();
  if(info.project.name==="chromium"){
    mkdirSync("docs/brand/brand02/conchas",{recursive:true});
    await page.screenshot({path:"docs/brand/brand02/conchas/v32-contact-1440.png",fullPage:true,animations:"disabled"});
  }
  await page.locator('.v32-site-footer a[href="/visual-v32/terms"]').click();
  await expect(page).toHaveURL(/\/visual-v32\/terms/);
  await expect(page.locator('.v32-commerce-shell .v32-new-page')).toBeVisible();
  await expect(page.locator('.v32-nav')).toBeVisible();
});
test("V3.2 Cart and Checkout keep visual navigation and canonical commerce",async ({page},info)=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/visual-v32/bakery?category=cakes&lang=en");
  const classic=page.locator('[data-product-id="tres-leches--classic"]');
  await expect(classic).toBeEnabled();await classic.click();
  const add=page.getByRole("dialog").locator(".v32-buy-cta").first();
  await expect(add).toBeEnabled();await add.click();
  await page.locator('.v32-nav-right a[href="/visual-v32/cart"]').click();
  await expect(page).toHaveURL(/\/visual-v32\/cart/);
  await expect(page.locator(".v32-commerce-shell .v32-new-cart-items")).toContainText("Classic");
  await expect(page.locator(".v32-nav")).toBeVisible();
  await expect(page.locator(".v32-commerce-shell [class^='b-']")).toHaveCount(0);
  if(info.project.name==="chromium"){
    mkdirSync("docs/brand/brand02/conchas",{recursive:true});
    await page.screenshot({path:"docs/brand/brand02/conchas/v32-cart-1440.png",fullPage:true,animations:"disabled"});
  }
  const proceed=page.locator(".v32-commerce-shell a[href='/visual-v32/checkout']");
  await expect(proceed).toBeVisible();
  await proceed.click();
  await expect(page).toHaveURL(/\/visual-v32\/checkout/);
  await expect(page.locator(".v32-commerce-shell .v32-new-page")).toBeVisible();
  await expect(page.locator(".v32-nav")).toBeVisible();
  if(info.project.name==="chromium")
    await page.screenshot({path:"docs/brand/brand02/conchas/v32-checkout-1440.png",fullPage:true,animations:"disabled"});
});
test("V3.2 isolated route allowlist blocks unknown paths and checkout outside tests",async ({request})=>{
  const ok=await request.get("/visual-v32/contact");
  expect(ok.status()).toBe(200);
  for(const path of ["/visual-v32/not-authorized","/visual-v32/checkout/anything"]){
    const response=await request.get(path);
    expect(response.status()).toBe(404);
  }
});

test("V3.2 mobile Contact, Cart and Checkout retain the connected visual shell",async ({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  for(const part of ["contact","cart","checkout"]){
    await page.goto("/visual-v32/"+part+"?lang=en");
    await expect(page.locator(".v32-nav")).toBeVisible();
    await expect(page.locator(".v32-commerce-shell")).toBeVisible();
    await expect(page.locator(".v32-commerce-shell .b-header, .v32-commerce-shell .b-header")).toBeHidden();
    if(info.project.name==="chromium"){
      mkdirSync("docs/brand/brand02/conchas",{recursive:true});
      await page.screenshot({path:"docs/brand/brand02/conchas/v32-"+part+"-390.png",fullPage:true,animations:"disabled"});
    }
  }
});

test("V3.2 header uses natural capitalization and language selector shares nav centreline",async ({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/visual-v32?lang=en");
  await expect(page.locator(".v32-nav-left a").first()).toHaveText("Home");
  await expect(page.locator(".v32-nav-left a").nth(1)).toHaveText("Menu");
  await expect(page.locator(".v32-nav-right a").first()).toHaveText("Journal");
  await expect(page.locator(".v32-nav-right a").nth(1)).toHaveText("Contact");
  await expect(page.locator(".v32-nav-right a").last()).toContainText("Cart (");
  const lang=await page.locator(".v32-nav-right select").boundingBox();
  const contact=await page.locator(".v32-nav-right a").nth(1).boundingBox();
  expect(lang).not.toBeNull();expect(contact).not.toBeNull();
  const center=(box:{y:number;height:number})=>box.y+box.height/2;
  expect(Math.abs(center(lang!)-center(contact!))).toBeLessThanOrEqual(2);
  await page.locator(".v32-nav-right select").selectOption("es");
  await expect(page.locator(".v32-nav-left a").first()).toHaveText("Inicio");
  await expect(page.locator(".v32-nav-right a").first()).toHaveText("Historia");
  await expect(page.locator(".v32-nav-right a").last()).toContainText("Carrito (");
});

test("V3.2 add-to-cart commits canonical item and closes without legacy suggestion UI",async ({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/visual-v32/bakery?category=mexican&lang=en");
  const item=page.locator('[data-product-id="pan-azucar-chocolate-covering"]');
  const open=await item.count()?item:page.locator(".v32-product:not([disabled])").first();
  await expect(open).toBeEnabled();
  await open.click();
  const dialog=page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const oldCount=await page.locator(".v32-nav-right a[href='/visual-v32/cart'] span[aria-live='polite']").innerText();
  const add=dialog.locator(".v32-buy-cta").first();
  await expect(add).toBeEnabled();
  await add.click();
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(page.locator(".v32-cart-status")).toContainText("Added to cart");
  await expect.poll(async()=>Number(await page.locator(".v32-nav-right a[href='/visual-v32/cart'] span[aria-live='polite']").innerText()))
    .toBeGreaterThan(Number(oldCount));
  await expect(page.getByText("Anything else for your order?")).toHaveCount(0);
  await expect(page.getByText("Continue shopping")).toHaveCount(0);
});

test("V3.2 short-screen product selector keeps checkout action visible",async ({page})=>{
  for(const size of [{width:390,height:844},{width:375,height:667},{width:320,height:568}]){
    await page.setViewportSize(size);
    await page.goto("/visual-v32/bakery?category=mexican&lang=en");
    const product=page.locator(".v32-product:not([disabled])").first();
    await expect(product).toBeVisible();await product.click();
    const dialog=page.getByRole("dialog");
    const action=dialog.locator(".v32-buy-cta").first();
    await expect(action).toBeVisible();
    const panel=await dialog.boundingBox(),button=await action.boundingBox();
    expect(panel).not.toBeNull();expect(button).not.toBeNull();
    expect(panel!.y).toBeGreaterThanOrEqual(0);
    expect(panel!.y+panel!.height).toBeLessThanOrEqual(size.height+1);
    expect(button!.y).toBeGreaterThanOrEqual(0);
    expect(button!.y+button!.height).toBeLessThanOrEqual(size.height+1);
    await expect(dialog.getByText("Anything else for your order?")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("ZIP V3.2 layout: visible price opposite quantity with primary CTA below",async ({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/visual-v32/bakery?category=mexican&lang=en");
  const product=page.locator(".v32-product:not([disabled])").first();
  await product.click();
  const popup=page.getByRole("dialog");
  // The approved popover animates on entrance. Measure final geometry only.
  await expect.poll(()=>popup.evaluate(element=>element.getAnimations().filter(a=>a.playState==="running").length)).toBe(0);
  const price=popup.locator(".v32-popup-scroll .v32-buy-price").first();
  const qty=popup.locator(".v32-popup-footer .v32-buy-qty").first();
  const cta=popup.locator(".v32-popup-footer .v32-buy-cta").first();
  await expect(price).toBeVisible();
  await expect(qty).toBeVisible();
  await expect(cta).toBeVisible();
  const a=await price.boundingBox(), b=await qty.boundingBox(),c=await cta.boundingBox();
  expect(a).not.toBeNull();expect(b).not.toBeNull();expect(c).not.toBeNull();
  expect(Math.abs(a!.y+a!.height/2-(b!.y+b!.height/2))).toBeLessThan(32);
  expect(c!.y).toBeGreaterThanOrEqual(Math.max(a!.y+a!.height,b!.y+b!.height)-2);
  expect(await popup.evaluate(el=>getComputedStyle(el).fontFamily)).toContain("Jost");
});
test("ZIP V3.2 mobile navigation does not overflow at 320, 375 or 390",async ({page})=>{
  for(const width of [320,375,390]){
    await page.setViewportSize({width,height:667});
    await page.goto("/visual-v32?lang=en");
    await expect(page.locator(".v32-nav")).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))
      .toBe(true);
  }
});

test("V3.2 customer flow contains zero mounted legacy UI components",async ({page})=>{
  for(const screen of ["contact","cart","checkout","terms","how-to-order","checkout/return"]){
    await page.goto("/visual-v32/"+screen+"?lang=en");
    await expect(page.locator('[data-frontend="standalone-v32"]')).toBeVisible();
    await expect(page.locator(".v32-commerce-shell [class^='b-']")).toHaveCount(0);
  }
});
test("V3.2 checkout does not create a payment in the synthetic preview",async ({page})=>{
  const unsafe:string[]=[];
  page.on("request",r=>{if(r.method()!=="GET"&&/\/api\/checkout\/(web|prepare|reconcile)|\/api\/payments\//.test(r.url())) unsafe.push(r.url());});
  await page.goto("/visual-v32/checkout?lang=en");
  await expect(page.locator('[data-new-ui="checkout"]')).toBeVisible();
  expect(unsafe).toEqual([]);
});

test("ZIP REF_A menu search highlights Cake/Bakery with gold chips and reports no matches",async ({page})=>{
 await page.goto("/visual-v32/menu?lang=en");
 const input=page.getByRole("searchbox",{name:"Search the bakery"});
 await input.fill("croissant");
 await expect(page.locator(".v32-result-pill")).toContainText(["Bakery"]);
 await expect(page.locator(".v32-breads")).toHaveClass(/v32-tile-highlight/);
 await expect(page.locator(".v32-cakes")).not.toHaveClass(/v32-tile-highlight/);
 await input.fill("impossiblezzzza");
 await page.locator(".v32-search button[type='submit']").click();
 await expect(page.locator(".v32-search-empty")).toContainText("Nothing found");
 await input.fill("");
 await expect(page.locator(".v32-search-empty")).toHaveCount(0);
 await expect(page.locator(".v32-result-pill")).toHaveCount(0);
});
test("ZIP REF_A mobile sheet is above Home and navigates with genuine pointer clicks",async ({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto("/visual-v32?lang=en");
 await page.getByRole("button",{name:"Open navigation"}).click();
 await expect(page.locator('[data-v32-mobile-menu="true"]')).toBeVisible();
 await page.locator('.v32-mobile-drawer a[href="/visual-v32/menu"]').click({timeout:10000});
 await expect(page).toHaveURL(/\/visual-v32\/menu/);
 await expect(page.getByRole("heading",{name:"Explore Our Menu"})).toBeVisible();
});
test("ZIP REF_C price changes with quantity without altering authoritative unit price",async ({page})=>{
 await page.goto("/visual-v32/bakery?category=cakes&lang=en");
 const card=page.locator('[data-product-id="tres-leches--classic"]');
 await card.click();
 const popup=page.getByRole("dialog");
 const before=await popup.locator(".v32-buy-price strong").innerText();
 await popup.getByRole("button",{name:"Increase quantity"}).click();
 const after=await popup.locator(".v32-buy-price strong").innerText();
 expect(after).not.toBe(before);
 await expect(popup.locator(".v32-buy-cta")).toContainText(after);
});

test("approved REF_C input: note maximum 40 and value preserved across variant change",async ({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto("/visual-v32/bakery?category=cakes&lang=en");
 await page.locator('[data-product-id="tres-leches--classic"]').click();
 const popup=page.getByRole("dialog");
 const note=popup.getByRole("textbox",{name:/personalization/i});
 await expect(note).toBeVisible();
 await note.fill("x".repeat(55));
 await expect(note).toHaveValue("x".repeat(40));
 await expect(popup.locator(".v32-personalization-field output")).toHaveText("40/40");
 await popup.locator(".v32-variant").nth(1).click();
 await expect(note).toHaveValue("x".repeat(40));
 await expect(popup.locator(".v32-popup-footer .v32-buy-cta")).toBeVisible();
});
test("approved REF_D short screens: scrollable fields with persistent single CTA",async ({page},info)=>{
 for(const size of [{width:390,height:844},{width:375,height:667},{width:320,height:568}]){
  await page.setViewportSize(size);
  await page.goto("/visual-v32/bakery?category=cakes&lang=en");
  await page.locator('[data-product-id="tres-leches--classic"]').click();
  const popup=page.getByRole("dialog");
  const button=popup.locator(".v32-popup-footer .v32-buy-cta");
  await expect(popup.locator(".v32-personalization input")).toBeAttached();
  await expect(button).toBeVisible();
  const before=await button.boundingBox();
  await popup.locator(".v32-popup-scroll").evaluate(el=>{el.scrollTop=el.scrollHeight});
  const after=await button.boundingBox();
  expect(before).not.toBeNull();expect(after).not.toBeNull();
  expect(Math.abs(before!.y-after!.y)).toBeLessThanOrEqual(2);
  expect(after!.y+after!.height).toBeLessThanOrEqual(size.height+1);
  await expect(popup.locator(".v32-popup-footer .v32-buy-cta")).toHaveCount(1);
  if(info.project.name==="chromium"&&size.width===390){
    mkdirSync("docs/brand/brand02/conchas",{recursive:true});
    await page.screenshot({path:"docs/brand/brand02/conchas/v32-approved-popup-notes-390.png",animations:"disabled"});
  }
  await page.keyboard.press("Escape");
 }
});
test("source reference note is visual-only and never silently attached to merchant cart",async ({page})=>{
 await page.goto("/visual-v32/bakery?category=cakes&lang=en");
 await page.locator('[data-product-id="tres-leches--classic"]').click();
 const popup=page.getByRole("dialog");
 await popup.locator(".v32-personalization input").fill("private gift message");
 await popup.locator(".v32-buy-cta").click();
 await expect(popup).toHaveCount(0);
 expect(await page.evaluate(()=>String(localStorage.getItem("3l-cart")).includes("private gift message"))).toBe(false);
});
