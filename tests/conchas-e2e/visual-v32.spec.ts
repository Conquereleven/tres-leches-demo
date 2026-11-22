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
  await expect(dialog.locator(".b-menu-options")).toBeVisible();
  await expect(dialog.locator(".b-add-to-cart")).toBeVisible();
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
  await expect(dialog.locator(".b-add-to-cart button").first()).toBeAttached();
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
  await expect(popup.locator(".b-menu-options")).toBeVisible();
  // The product control is the existing commercial ProductOptions, not a toast.
  await expect(popup.locator(".b-add-to-cart")).toBeVisible();
  await expect(page.locator("button", {hasText:"(preview)"})).toHaveCount(0);
});


test("V3.2 real cake SKU flows through cart to existing checkout without creating payment",async ({page})=>{
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
  await expect(panel.locator(".b-menu-options")).toBeVisible();
  const add=panel.locator(".b-add-to-cart > button").first();
  await expect(add).toBeEnabled();
  await add.click();
  await expect.poll(()=>page.evaluate(()=>{
    const lines=JSON.parse(localStorage.getItem("3l-cart")??"[]");
    return lines.reduce((sum:number,line:{productId:string;quantity:number})=>
      sum+(line.productId.startsWith("tres-leches-classic-")?line.quantity:0),0);
  })).toBeGreaterThan(0);
  await page.goto("/cart?lang=en");
  await expect(page.locator(".b-co-items")).toBeVisible();
  await expect(page.locator(".b-co-items")).toContainText("Classic");
  await page.goto("/checkout?lang=en");
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
      await expect(page.getByRole("button",{name:"Close navigation"})).toHaveAttribute("aria-expanded","true");
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
  const before=await dlg.locator(".v32-popup-unit .b-menu-price").innerText();
  await pills.nth(1).click();
  await expect(pills.nth(1)).toHaveAttribute("aria-pressed","true");
  const after=await dlg.locator(".v32-popup-unit .b-menu-price").innerText();
  expect(after).not.toBe(before);
  await expect(dlg.locator(".b-add-to-cart button").last()).toBeEnabled();
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
  await expect(page.locator('.v32-commerce-shell .b-policy-page')).toBeVisible();
  await expect(page.locator('.v32-commerce-shell .b-header, .v32-commerce-shell .b-footer').first()).toBeHidden();
  if(info.project.name==="chromium"){
    mkdirSync("docs/brand/brand02/conchas",{recursive:true});
    await page.screenshot({path:"docs/brand/brand02/conchas/v32-contact-1440.png",fullPage:true,animations:"disabled"});
  }
  await page.locator('.v32-site-footer a[href="/visual-v32/terms"]').click();
  await expect(page).toHaveURL(/\/visual-v32\/terms/);
  await expect(page.locator('.v32-commerce-shell .b-policy-page')).toBeVisible();
  await expect(page.locator('.v32-nav')).toBeVisible();
});
test("V3.2 Cart and Checkout keep visual navigation and canonical commerce",async ({page},info)=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/visual-v32/bakery?category=cakes&lang=en");
  const classic=page.locator('[data-product-id="tres-leches--classic"]');
  await expect(classic).toBeEnabled();await classic.click();
  const add=page.getByRole("dialog").locator(".b-add-to-cart > button").first();
  await expect(add).toBeEnabled();await add.click();
  await page.locator('.v32-nav-right a[href="/visual-v32/cart"]').click();
  await expect(page).toHaveURL(/\/visual-v32\/cart/);
  await expect(page.locator(".v32-commerce-shell .b-co-items")).toContainText("Classic");
  await expect(page.locator(".v32-nav")).toBeVisible();
  await expect(page.locator(".v32-commerce-shell .b-co-header")).toBeHidden();
  if(info.project.name==="chromium"){
    mkdirSync("docs/brand/brand02/conchas",{recursive:true});
    await page.screenshot({path:"docs/brand/brand02/conchas/v32-cart-1440.png",fullPage:true,animations:"disabled"});
  }
  const proceed=page.locator(".v32-commerce-shell a.b-co-cta");
  await expect(proceed).toHaveAttribute("href","/checkout");
  await proceed.click();
  await expect(page).toHaveURL(/\/visual-v32\/checkout/);
  await expect(page.locator(".v32-commerce-shell .b-shop")).toBeVisible();
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
    await expect(page.locator(".v32-commerce-shell .b-header, .v32-commerce-shell .b-co-header")).toBeHidden();
    if(info.project.name==="chromium"){
      mkdirSync("docs/brand/brand02/conchas",{recursive:true});
      await page.screenshot({path:"docs/brand/brand02/conchas/v32-"+part+"-390.png",fullPage:true,animations:"disabled"});
    }
  }
});
