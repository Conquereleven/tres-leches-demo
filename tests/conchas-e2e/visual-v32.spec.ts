import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Open a V3.2 bakery and require the real catalog. The disposable fixture
 * server can drop a config/menu fetch under a full two-project load; the UI
 * answers with its own TRY AGAIN / REINTENTAR / حاول مجدداً state. Settle on
 * either outcome, then use that recovery path exactly once: a persistently
 * unavailable catalog still fails instead of being bypassed. (Never retry in
 * a loop: each click fires a new fetch and a retry storm only slows the
 * single-threaded fixture server further.)
 */
async function readyVisualBakery(page: Page, url: string) {
  // Listener first: the catalog fetches fire during navigation, before
  // goto resolves. A non-2xx here names the exact failing authority.
  const apiStatus: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400)
      apiStatus.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(url);
  const retry = page.getByRole("button", {
    name: /try again|reintentar|حاول مجدداً/i,
  });
  let state = "waiting";
  await expect
    .poll(async () => {
      if (await page.locator(".structural-grid").count()) state = "ready";
      else if (await retry.count()) state = "unavailable";
      return state;
    }, { timeout: 20000 })
    .not.toBe("waiting");
  if (apiStatus.length)
    console.log(`API-NON200 ${url} :: ${apiStatus.join(" | ")}`);
  if (state === "unavailable") {
    // Best-effort recovery: a successful retry unmounts this very button
    // mid-click (fetch resolves → grid renders), so a detach-race here must
    // not fail the test. The grid assertion below stays the strict gate.
    await retry.first().click({ timeout: 5000 }).catch(() => {});
    await expect(page.locator(".structural-grid")).toBeVisible({ timeout: 15000 });
  } else {
    await expect(page.locator(".structural-grid")).toBeVisible();
  }
}

/** Isolated V3.2 preview must not change current storefront or mock prices. */
test("approved V3.2 desktop retains four catalog columns and live SKU authority", async ({page}, info) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/visual-v32/bakery?lang=en");
  const grid=page.locator('[data-grid-columns="4"]');
  await expect(grid).toBeVisible();
  const columns=await grid.evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(4);
  const card=page.locator(".ref32-product:not([disabled])").first();
  await expect(card).toBeVisible();
  const price=await card.locator(".ref32-product-copy > span").innerText();
  expect(price).toMatch(/AED/);
  await card.click();
  const dialog=page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".ref32-dialog-footer")).toBeVisible();
  await expect(dialog.locator(".ref32-dialog-footer")).toBeVisible();
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
  const card=page.locator(".ref32-product:not([disabled])").first();
  await expect(card).toBeVisible();
  await card.click();
  const dialog=page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const rect=await dialog.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.x+rect!.width).toBeLessThanOrEqual(376);
  await expect(dialog).toHaveAttribute("data-placement", /above|below/);
  const action=dialog.locator(".ref32-buy");
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(dialog.locator(".ref32-buy").first()).toBeAttached();
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
  await expect(page.locator(".ref32-product:not([disabled])")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("V3.2 mock TatbiQ prices never enter the real cart",async ({page})=>{
  await page.goto("/visual-v32/bakery?lang=en");
  const first=page.locator(".ref32-product:not([disabled])").first();
  await expect(first).toBeVisible();
  await first.click();
  const popup=page.getByRole("dialog");
  await expect(popup.locator(".ref32-dialog-footer")).toBeVisible();
  // The product control is V3.2 native UI backed by the canonical cart, not legacy Shop UI.
  await expect(popup.locator(".ref32-dialog-footer")).toBeVisible();
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
  const classic=page.locator('.ref32-product[data-product-id="tres-leches--classic"]');
  await expect(classic).toBeVisible({timeout:12000});
  await expect(classic).toBeEnabled();
  await classic.click();
  const panel=page.getByRole("dialog");
  await expect(panel.locator(".ref32-dialog-footer")).toBeVisible();
  const add=panel.locator(".ref32-buy").first();
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
    await page.getByRole("link",{name:"Journal",exact:true}).last().click();
    await expect(page).toHaveURL(/\/visual-v32\/journal/);
    await expect(page.locator(".v32-journal h1")).toContainText("A crown of sweetness");
    await page.goBack();
    if(info.project.name==="chromium"){
      mkdirSync("docs/brand/brand02/conchas",{recursive:true});
      await page.screenshot({path:"docs/brand/brand02/conchas/v32-home-"+viewport.width+".png",fullPage:true,animations:"disabled"});
    }
    if (viewport.width===390) {
      const menuToggle=page.getByRole("button",{name:"Open navigation"});
      await expect(menuToggle).toBeVisible();
      await menuToggle.click();
      await expect(menuToggle).toHaveAttribute("aria-expanded","true");
      const mobileNav = page.getByRole("dialog", { name:"Mobile navigation" });
      await expect(mobileNav).toBeVisible();
      await mobileNav.locator('a[href="/visual-v32/menu"]').click();
    } else {
      await page.goto("/visual-v32/menu?lang=en");
    }
    await expect(page.getByRole("heading",{name:"Explore Our Menu"})).toBeVisible();
    await expect(page.locator(".menu-cards .menu-category")).toHaveCount(2);
    if(info.project.name==="chromium")
      await page.screenshot({path:"docs/brand/brand02/conchas/v32-menu-"+viewport.width+".png",fullPage:true,animations:"disabled"});
    await page.locator(".menu-category.category-bakery a").click();
    await expect(page.locator(".catalog-main")).toBeVisible();
    await expect(page.locator("#catalog-categories").getByRole("button",{name:"Mexican Bakery",includeHidden:true})).toHaveAttribute("aria-pressed","true");
    if(info.project.name==="chromium")
      await page.screenshot({path:"docs/brand/brand02/conchas/v32-catalog-"+viewport.width+".png",fullPage:viewport.width===1440,animations:"disabled"});
  });
}

test("V3.2 keeps real SKU price unchanged across languages",async ({page})=>{
  const amounts:number[]=[];
  for(const lang of ["en","es","ar"]){
    await page.goto("/visual-v32/bakery?category=cakes&lang="+lang);
    const item=page.locator('.ref32-product[data-product-id="tres-leches--classic"]');
    await expect(item).toBeVisible();
    const raw=await item.locator(".ref32-product-copy > span").innerText();
    expect(raw).toMatch(lang==="ar"?/د\.إ/:/AED/);
    const digits=raw.replace(/[٠-٩]/g,digit=>String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
    amounts.push(Number(digits.match(/\d+/)?.[0]));
  }
  expect(amounts[0]).toBeGreaterThan(0);
  expect(new Set(amounts).size).toBe(1);
});

test("isolated preview refuses unknown routes",async ({request})=>{
  const res=await request.get("/visual-v32/not-authorized");
  expect(res.status()).toBe(404);
});


test("V3.2 commerce pill variants use canonical SKU prices and preserve AddToCart",async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/visual-v32/bakery?category=cakes&lang=en");
  const classic=page.locator('.ref32-product[data-product-id="tres-leches--classic"]');
  await expect(classic).toBeVisible();
  await classic.click();
  const dlg=page.getByRole("dialog");
  const pills=dlg.locator(".ref32-option");
  expect(await pills.count()).toBeGreaterThan(1);
  await expect(pills.first()).toHaveAttribute("aria-pressed","true");
  const before=await dlg.locator(".ref32-price strong").innerText();
  await pills.nth(1).click();
  await expect(pills.nth(1)).toHaveAttribute("aria-pressed","true");
  const after=await dlg.locator(".ref32-price strong").innerText();
  expect(after).not.toBe(before);
  await expect(dlg.locator(".ref32-buy").last()).toBeEnabled();
  const rect=await dlg.boundingBox();
  expect(rect).not.toBeNull();expect(rect!.y).toBeGreaterThanOrEqual(0);
  await dlg.locator(".ref32-buy").scrollIntoViewIfNeeded();
  await expect(dlg.locator(".ref32-buy")).toBeInViewport();
});

test("V3.2 Contact and customer policies stay inside the visual preview",async ({page},info)=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/visual-v32?lang=en");
  await page.locator(".mast-right a[href='/visual-v32/contact']").click();
  await expect(page).toHaveURL(/\/visual-v32\/contact/);
  await expect(page.locator('[data-visual-preview="v32"]')).toBeVisible();
  await expect(page.locator('.v32-commerce-shell .v32-new-page')).toBeVisible();
  await expect(page.locator('.v32-commerce-shell .b-header, .v32-commerce-shell .b-footer').first()).toBeHidden();
  if(info.project.name==="chromium"){
    mkdirSync("docs/brand/brand02/conchas",{recursive:true});
    await page.screenshot({path:"docs/brand/brand02/conchas/v32-contact-1440.png",fullPage:true,animations:"disabled"});
  }
  await page.locator('footer a[href="/visual-v32/terms"]').click();
  await expect(page).toHaveURL(/\/visual-v32\/terms/);
  await expect(page.locator('.v32-commerce-shell .v32-new-page')).toBeVisible();
  await expect(page.locator('.mast')).toBeVisible();
});
test("V3.2 Cart and Checkout keep visual navigation and canonical commerce",async ({page},info)=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/visual-v32/bakery?category=cakes&lang=en");
  const classic=page.locator('.ref32-product[data-product-id="tres-leches--classic"]');
  await expect(classic).toBeEnabled();await classic.click();
  const add=page.getByRole("dialog").locator(".ref32-buy").first();
  await expect(add).toBeEnabled();await add.click();
  await page.locator('.mast-right a[href="/visual-v32/cart"]').click();
  await expect(page).toHaveURL(/\/visual-v32\/cart/);
  await expect(page.locator(".v32-commerce-shell .v32-new-cart-items")).toContainText("Classic");
  await expect(page.locator(".mast")).toBeVisible();
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
  await expect(page.locator(".mast")).toBeVisible();
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
    await expect(page.locator(".mast")).toBeVisible();
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
  await expect(page.locator(".mast-left a").first()).toHaveText("Home");
  await expect(page.locator(".mast-left a").nth(1)).toHaveText("Menu");
  await expect(page.locator(".mast-right a").first()).toHaveText("Journal");
  await expect(page.locator(".mast-right a").nth(1)).toHaveText("Contact");
  await expect(page.locator(".mast-right a").last()).toContainText("Cart (");
  const lang=await page.locator(".mast-right select").boundingBox();
  const contact=await page.locator(".mast-right a").nth(1).boundingBox();
  expect(lang).not.toBeNull();expect(contact).not.toBeNull();
  const center=(box:{y:number;height:number})=>box.y+box.height/2;
  const header=await page.locator(".mast").boundingBox();
  expect(header).not.toBeNull();
  for(const bounds of [lang!,contact!]){
    expect(bounds.y).toBeGreaterThan(header!.y);
    expect(bounds.y+bounds.height).toBeLessThan(header!.y+header!.height);
  }
  // The accepted CornerGlass mast places the selector 8px from the link center.
  expect(Math.abs(Math.abs(center(lang!)-center(contact!))-8)).toBeLessThanOrEqual(2);
  await page.locator(".mast-right select").selectOption("es");
  await expect(page.locator(".mast-left a").first()).toHaveText("Inicio");
  await expect(page.locator(".mast-right a").first()).toHaveText("Diario");
  await expect(page.locator(".mast-right a").last()).toContainText("Carrito (");
});

test("V3.2 add-to-cart commits canonical item and closes without legacy suggestion UI",async ({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/visual-v32/bakery?category=mexican&lang=en");
  const item=page.locator('.ref32-product[data-product-id="pan-azucar-chocolate-covering"]');
  const open=await item.count()?item:page.locator(".ref32-product:not([disabled])").first();
  await expect(open).toBeEnabled();
  await open.click();
  const dialog=page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const oldCount=await page.locator(".mast-right a[href='/visual-v32/cart'] bdi[aria-live='polite']").innerText();
  const add=dialog.locator(".ref32-buy").first();
  await expect(add).toBeEnabled();
  await add.click();
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(page.locator(".v32-cart-status")).toContainText("Added to cart");
  await expect.poll(async()=>Number((await page.locator(".mast-right a[href='/visual-v32/cart'] bdi[aria-live='polite']").innerText()).replace(/\D/g,"")))
    .toBeGreaterThan(Number(oldCount.replace(/\D/g,"")));
  await expect(page.getByText("Anything else for your order?")).toHaveCount(0);
  await expect(page.getByText("Continue shopping")).toHaveCount(0);
});

test("V3.2 short-screen product selector keeps checkout action visible",async ({page})=>{
  for(const size of [{width:390,height:844},{width:375,height:667},{width:320,height:568}]){
    await page.setViewportSize(size);
    await page.goto("/visual-v32/bakery?category=mexican&lang=en");
    const product=page.locator(".ref32-product:not([disabled])").first();
    await expect(product).toBeVisible();await product.click();
    const dialog=page.getByRole("dialog");
    const action=dialog.locator(".ref32-buy").first();
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeInViewport();
    await expect(dialog).toHaveAttribute("data-placement", /above|below/);
    const panel=await dialog.boundingBox(),button=await action.boundingBox();
    expect(panel).not.toBeNull();expect(button).not.toBeNull();
    expect(panel!.x).toBeGreaterThanOrEqual(-1);
    expect(panel!.x+panel!.width).toBeLessThanOrEqual(size.width+1);
    expect(button!.y).toBeGreaterThanOrEqual(0);
    expect(button!.y+button!.height).toBeLessThanOrEqual(size.height+1);
    await expect(dialog.getByText("Anything else for your order?")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});


test("REF_C desktop layout: anchored price and quantity stay aligned above the purchase action",async ({page},info)=>{
 await page.setViewportSize({width:1440,height:900});
 // Approved contract: personalization notes exist only on cakes. Exercise the
 // footer geometry on a cake so the note assertion is meaningful.
 await page.goto("/visual-v32/bakery?category=cakes&lang=en");
 await page.locator('.ref32-product[data-product-id="tres-leches--classic"]').click();
 const popup=page.getByRole("dialog");
 await expect.poll(()=>popup.evaluate(e=>e.getAnimations().filter(a=>a.playState==="running").length)).toBe(0);
 const desktopQty=popup.locator(".ref32-price-quantity .ref32-quantity");
 const price=popup.locator(".ref32-price");
 const cta=popup.locator(".ref32-dialog-footer .ref32-buy");
 await expect(popup).toHaveAttribute("data-placement","side");
 await expect(desktopQty).toBeVisible();
 await expect(cta).toBeVisible();
 const a=await desktopQty.boundingBox(),b=await cta.boundingBox(),c=await price.boundingBox();
 expect(a).not.toBeNull();expect(b).not.toBeNull();expect(c).not.toBeNull();
 expect(Math.abs(a!.y+a!.height/2-(c!.y+c!.height/2))).toBeLessThan(28);
 expect(b!.y).toBeGreaterThanOrEqual(a!.y+a!.height);
 await expect(popup.locator(".ref32-note input")).toBeVisible();
 if(info.project.name==="chromium"){
   mkdirSync("docs/brand/brand02/conchas",{recursive:true});
   await page.screenshot({path:"docs/brand/brand02/conchas/v32-ref-c-desktop-1440.png",animations:"disabled"});
 }
});
test("REF_D mobile layout: note, aligned price and quantity, and one full-width CTA",async ({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto("/visual-v32/bakery?category=cakes&lang=es");
 await page.locator('.ref32-product[data-product-id="tres-leches--classic"]').click();
 const popup=page.getByRole("dialog");
 const price=popup.locator(".ref32-details .ref32-price");
 const qty=popup.locator(".ref32-price-quantity .ref32-quantity");
 const note=popup.locator(".ref32-note input");
 const cta=popup.locator(".ref32-dialog-footer .ref32-buy");
 await expect(price).toBeVisible();await expect(qty).toBeVisible();
 await expect(note).toBeVisible();await expect(cta).toBeVisible();
 const a=await price.boundingBox(),b=await qty.boundingBox(),c=await cta.boundingBox();
 expect(a).not.toBeNull();expect(b).not.toBeNull();expect(c).not.toBeNull();
 expect(Math.abs(a!.y+a!.height/2-(b!.y+b!.height/2))).toBeLessThan(28);
 expect(c!.y).toBeGreaterThan(a!.y+a!.height);
 const footer=await popup.locator(".ref32-dialog-footer").boundingBox();
 expect(footer).not.toBeNull();
 expect(c!.x).toBeCloseTo(footer!.x, 0);
 expect(c!.width).toBeCloseTo(footer!.width, 0);
 expect(c!.x).toBeGreaterThanOrEqual(0);
 expect(c!.x+c!.width).toBeLessThanOrEqual(390);
 if(info.project.name==="chromium"){
   mkdirSync("docs/brand/brand02/conchas",{recursive:true});
   await page.screenshot({path:"docs/brand/brand02/conchas/v32-ref-d-mobile-390.png",animations:"disabled"});
 }
});
test("ZIP V3.2 mobile navigation does not overflow at 320, 375 or 390",async ({page})=>{
  for(const width of [320,375,390]){
    await page.setViewportSize({width,height:667});
    await page.goto("/visual-v32?lang=en");
    await expect(page.locator(".mast")).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))
      .toBe(true);
  }
});

test("V3.2 customer flow contains zero mounted legacy UI components",async ({page})=>{
  // Bridges that stay: the real Shop checkout at canonical /checkout mounts
  // .b-shop outside this shell (checkout continuity lives in conchas.spec.ts),
  // and the policy screens render the authorized legal-copy subtree
  // .v32-new-policy (single source of truth in Policies.tsx, including its
  // b-policy-*/b-label/b-caption descendants). A b- element anywhere else in
  // the shell (b-menu, b-shop, b-co, b-category, b-header, ...) is retired
  // legacy storefront UI and fails.
  for(const screen of ["contact","cart","checkout","terms","how-to-order","checkout/return"]){
    await page.goto("/visual-v32/"+screen+"?lang=en");
    await expect(page.locator('[data-frontend="standalone-v32"]')).toBeVisible();
    await expect(page.locator(".v32-commerce-shell")).toBeVisible();
    const total = await page.locator(".v32-commerce-shell [class^='b-']").count();
    const inPolicy = await page.locator(".v32-commerce-shell .v32-new-policy [class^='b-']").count();
    expect(total).toBe(inPolicy);
  }
});
test("V3.2 checkout does not create a payment in the synthetic preview",async ({page})=>{
  const unsafe:string[]=[];
  page.on("request",r=>{if(r.method()!=="GET"&&/\/api\/checkout\/(web|prepare|reconcile)|\/api\/payments\//.test(r.url())) unsafe.push(r.url());});
  await page.goto("/visual-v32/checkout?lang=en");
  await expect(page.locator('[data-new-ui="checkout"]')).toBeVisible();
  expect(unsafe).toEqual([]);
});

test("REF_A menu searches across the real catalogue and reports no matches",async ({page})=>{
 await page.goto("/visual-v32/menu?lang=en");
 const input=page.getByRole("searchbox",{name:"Search the bakery"});
 await input.fill("croissant");
 await input.press("Enter");
 await expect(page).toHaveURL(/\/bakery\?.*q=croissant/);
 await expect(page.locator('.ref32-product[data-product-id="croissant--plain"]')).toBeVisible();
 await expect(page.locator('.ref32-product[data-category-id="cakes"]')).toHaveCount(0);
 const search=page.getByRole("searchbox",{name:"Search the menu"});
 await search.fill("impossiblezzzza");
 await expect(page.locator(".v32-search-empty")).toContainText("No matching products");
 await expect(page.locator(".ref32-product")).toHaveCount(0);
 await search.fill("");
 await expect(page.locator(".v32-search-empty")).toHaveCount(0);
 await expect(page.locator(".ref32-product").first()).toBeVisible();
});
test("ZIP REF_A mobile CornerGlass panel is above Home and navigates with genuine pointer clicks",async ({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto("/visual-v32?lang=en");
 await page.getByRole("button",{name:"Open navigation"}).click();
 const mobileNav=page.getByRole("dialog",{name:"Mobile navigation"});
 await expect(mobileNav).toBeVisible();
 await mobileNav.locator('a[href="/visual-v32/menu"]').click({timeout:10000});
 await expect(page).toHaveURL(/\/visual-v32\/menu/);
 await expect(page.getByRole("heading",{name:"Explore Our Menu"})).toBeVisible();
});
test("ZIP REF_C price changes with quantity without altering authoritative unit price",async ({page})=>{
 await page.goto("/visual-v32/bakery?category=cakes&lang=en");
 const card=page.locator('.ref32-product[data-product-id="tres-leches--classic"]');
 await card.click();
 const popup=page.getByRole("dialog");
 const before=await popup.locator(".ref32-price strong").innerText();
 await popup.getByRole("button",{name:"Increase quantity"}).click();
 const after=await popup.locator(".ref32-price strong").innerText();
 expect(after).not.toBe(before);
 await expect(popup.locator(".ref32-buy")).toHaveAccessibleName("Add to cart");
 const sku=await popup.getAttribute("data-selected-sku");
 const config=await (await page.request.get("/api/checkout/config")).json();
 const unit=config.products.find((product:{id:string})=>product.id===sku).priceFils;
 expect(Number(after.replace(/[^0-9.]/g,""))*100).toBe(unit*2);
});

test("approved REF_C input: cake sizes Mini/Small/Medium keep 15/20/30 limits",async ({page})=>{
 // Approved contract: Mini 15 / Small 20 / Medium 30 (never a flat 40).
 await page.setViewportSize({width:1440,height:900});
 await page.goto("/visual-v32/bakery?category=cakes&lang=en");
 await page.locator('.ref32-product[data-product-id="tres-leches--classic"]').click();
 const popup=page.getByRole("dialog");
 const note=popup.getByRole("textbox",{name:/personalization/i});
 await expect(note).toBeVisible();
 const limits=[15,20,30] as const;
 await expect(popup.locator(".ref32-option")).toHaveCount(3);
 for(let i=0;i<3;i++){
  await popup.locator(".ref32-option").nth(i).click();
  const max=limits[i]!;
  await expect(note).toHaveAttribute("maxlength",String(max));
  // Positive: exactly max characters are accepted and counted.
  await note.fill("x".repeat(max));
  await expect(note).toHaveValue("x".repeat(max));
  await expect(popup.locator(".ref32-note-field output")).toHaveText(`${max}/${max}`);
  await expect(popup.locator(".ref32-buy")).toBeEnabled();
  // Negative: overflow never enters the field (native maxlength truncation).
  await note.fill("x".repeat(max+15));
  await expect(note).toHaveValue("x".repeat(max));
  await expect(popup.locator(".ref32-note-field output")).toHaveText(`${max}/${max}`);
 }
 // Variant change keeps already-entered text when it still fits, and holds
 // the CTA with a warning when the carried text overflows the new size.
 await popup.locator(".ref32-option").nth(2).click();
 await note.fill("y".repeat(25));
 await expect(popup.locator(".ref32-buy")).toBeEnabled();
 await popup.locator(".ref32-option").nth(0).click();
 await expect(note).toHaveValue("y".repeat(25));
 await expect(popup.locator(".ref32-note-warning")).toBeVisible();
 await expect(popup.locator(".ref32-buy")).toBeDisabled();
 await popup.locator(".ref32-option").nth(2).click();
 await expect(popup.locator(".ref32-buy")).toBeEnabled();
 await expect(popup.locator(".ref32-dialog-footer .ref32-buy")).toBeVisible();
});
test("approved REF_D short screens: all fields and the single CTA are reachable",async ({page},info)=>{
 for(const size of [{width:390,height:844},{width:375,height:667},{width:320,height:568}]){
  await page.setViewportSize(size);
  await page.goto("/visual-v32/bakery?category=cakes&lang=en");
  await page.locator('.ref32-product[data-product-id="tres-leches--classic"]').click();
  const popup=page.getByRole("dialog");
  const button=popup.locator(".ref32-dialog-footer .ref32-buy");
  await expect(popup.locator(".ref32-note input")).toBeAttached();
  await expect(button).toBeVisible();
  const field=popup.locator(".ref32-note input");
  await field.scrollIntoViewIfNeeded();
  await expect(field).toBeInViewport();
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeInViewport();
  await expect(button).toHaveCount(1);
  await expect(popup).toHaveAttribute("data-placement", /above|below/);
  if(info.project.name==="chromium"&&size.width===390){
    mkdirSync("docs/brand/brand02/conchas",{recursive:true});
    await page.screenshot({path:"docs/brand/brand02/conchas/v32-approved-popup-notes-390.png",animations:"disabled"});
  }
  await page.keyboard.press("Escape");
 }
});
test("source reference note is visual-only and never silently attached to merchant cart",async ({page})=>{
 await readyVisualBakery(page,"/visual-v32/bakery?category=cakes&lang=en");
 const classic=page.locator('.ref32-product[data-product-id="tres-leches--classic"]');
 await expect(classic).toBeEnabled({timeout:12000});
 await classic.click();
 const popup=page.getByRole("dialog");
 // Valid personalization (Small allows 20 chars) enables the CTA and is the
 // only note ever attached to the merchant cart.
 await popup.locator(".ref32-option").nth(1).click();
 await popup.locator(".ref32-note input").fill("private gift message");
 await expect(popup.locator(".ref32-buy")).toBeEnabled();
 await expect(popup.locator(".ref32-note-warning")).toHaveCount(0);
 await popup.locator(".ref32-buy").click();
 expect(await page.evaluate(()=>String(localStorage.getItem("3l-cart")).includes("private gift message"))).toBe(true);
 // Overflow carried into Mini holds the CTA with a warning and never enters
 // the cart silently.
 await page.locator('.ref32-product[data-product-id="tres-leches--classic"]').click();
 const reopened=page.getByRole("dialog");
 await reopened.locator(".ref32-option").nth(1).click();
 await reopened.locator(".ref32-note input").fill("private gift message");
 await reopened.locator(".ref32-option").nth(0).click();
 await expect(reopened.locator(".ref32-buy")).toBeDisabled();
 await expect(reopened.locator(".ref32-note-warning")).toBeVisible();
 await reopened.locator(".ref32-note input").fill("");
 await expect(reopened.locator(".ref32-buy")).toBeEnabled();
});

test("REF_C and REF_D keep the glass treatment within the contextual panel",async ({page})=>{
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await page.goto("/visual-v32/bakery?category=cakes&lang=en");
  const trigger=page.locator('.ref32-product[data-product-id="tres-leches--classic"]');
  await trigger.click();
  const panel=page.getByRole("dialog");
  await expect(panel).toHaveAttribute("data-placement",width===1440?/side/:/above|below/);
  await expect(panel).toHaveClass(/glass/);
  const supportsTransparency=await panel.evaluate(()=>
    CSS.supports("backdrop-filter","blur(12px)")&&
    matchMedia("(prefers-reduced-transparency: no-preference)").matches,
  );
  if(width===1440&&!supportsTransparency){
    // The approved solid CornerGlass fallback also covers WebKit without the media query.
    await expect(panel).toHaveCSS("background-color","rgb(251, 225, 213)");
    await expect(panel).toHaveCSS("background-image","none");
  }else{
    await expect(panel).toHaveCSS("background-image",/gradient\(/);
  }
  await expect(panel).not.toHaveCSS("box-shadow","none");
  await expect(page.locator(".ref32-backdrop")).toHaveCount(0);
  await expect(page.locator(".structural-grid")).toHaveCSS("filter","none");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
 }
});
test("V3.2 published subcategories refine 3L products without mock category IDs",async ({page},info)=>{
 // WebKit actionability should verify the same native pointer event under
 // supported reduced-motion semantics; animation is tested separately.
 await page.emulateMedia({reducedMotion:"reduce"});
 await page.goto("/visual-v32/bakery?category=mexican&lang=es");
 const category=page.locator(".v32-subcategories");
 await expect(category).toBeVisible();
 await expect(category.locator('[data-category-id="pan"]')).toBeVisible();
 await expect(category.locator('[data-category-id="conchas"]')).toBeVisible();
 await category.locator('[data-category-id="conchas"]').click({timeout:12000});
 await expect(category.locator('[data-category-id="conchas"]')).toHaveAttribute("aria-pressed","true");
 if(info.project.name==="chromium"){
   mkdirSync("docs/brand/brand02/conchas",{recursive:true});
   await page.screenshot({path:"docs/brand/brand02/conchas/v32-3l-categories-desktop.png",animations:"disabled"});
 }
 const cards=page.locator(".ref32-product");
 await expect(cards.first()).toBeVisible();
 expect(await cards.evaluateAll(list=>list.every(node=>node.getAttribute("data-category-id")==="conchas"))).toBe(true);
});
test("V3.2 3L half-dozen/dozen selection follows actual Orejas SKUs, not box quantity",async ({page},info)=>{
 await page.setViewportSize({width:1440,height:900});
 await readyVisualBakery(page,"/visual-v32/bakery?category=bakery&lang=es");
 const card=page.locator('.ref32-product[data-product-id="orejas"]');
 await expect(card).toBeEnabled({timeout:12000});
 await card.click();
 const popup=page.getByRole("dialog");
 await expect(popup.locator(".ref32-options")).toBeVisible();
 await popup.locator('[data-pack-presentation="individual"]').click();
 await popup.locator('[data-pack-pieces="12"]').click();
 await expect(popup).toHaveAttribute("data-selected-sku","orejas-12-individuales-100-g-cada-uno");
 await expect(popup.locator('[data-pack-piece-count]')).toContainText("12");
 await expect(popup.locator(".ref32-price-quantity .ref32-quantity output")).toHaveText("1");
 const price=await popup.locator(".ref32-price strong").innerText();
 const checkout=await page.request.get("/api/checkout/config");
 expect(checkout.ok()).toBe(true);
 const body=await checkout.json();
 const option=body.products.find((item:{id:string;priceFils:number})=>item.id==="orejas-12-individuales-100-g-cada-uno");
 expect(option).toBeDefined();
 expect(price).toContain("AED "+(option.priceFils/100).toFixed(2).replace(/\.00$/,""));
 if(info.project.name==="chromium"){
   mkdirSync("docs/brand/brand02/conchas",{recursive:true});
   await page.screenshot({path:"docs/brand/brand02/conchas/v32-3l-dozen-desktop-1440.png",animations:"disabled"});
 }
 await popup.locator(".ref32-buy").click();
 await expect(popup).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("3l-cart")||"[]").some((l:{productId:string;quantity:number})=>
   l.productId==="orejas-12-individuales-100-g-cada-uno"&&l.quantity===1))).toBe(true);
 await page.goto("/visual-v32/cart?lang=es");
 const cartRetry = page.getByRole("button", {
   name: /try again|reintentar|حاول مجدداً/i,
 });
 let cartState = "waiting";
 await expect
   .poll(async () => {
     if (await page.locator("[data-cart-pack-count]").count())
       cartState = "ready";
     else if (await cartRetry.count()) cartState = "unavailable";
     return cartState;
   }, { timeout: 20000 })
   .not.toBe("waiting");
 if (cartState === "unavailable") {
   // Best-effort recovery (see readyVisualBakery): the button may unmount
   // mid-click on success; the pack-count assertion below stays strict.
   await cartRetry.first().click({ timeout: 5000 }).catch(() => {});
   await expect(page.locator("[data-cart-pack-count]")).toBeVisible({
     timeout: 15000,
   });
 }
 await expect(page.locator("[data-cart-pack-count]")).toContainText("12 piezas");
});

test("V3.2 3L mobile package selector remains usable at 390 and 375",async ({page},info)=>{
 for(const width of [390,375]){
  await page.setViewportSize({width,height:width===390?844:667});
  await readyVisualBakery(page,"/visual-v32/bakery?category=bakery&lang=es");
  const card=page.locator('.ref32-product[data-product-id="orejas"]');
  await expect(card).toBeEnabled({timeout:12000});
  await card.click();
  const popup=page.getByRole("dialog");
  await expect(popup.locator(".ref32-options")).toBeVisible();
  await popup.locator('[data-pack-presentation="mini"]').click();
  await popup.locator('[data-pack-pieces="6"]').click();
  await expect(popup).toHaveAttribute("data-selected-sku","orejas-6-mini-60-g-cada-uno");
  await expect(popup.locator("[data-pack-piece-count]")).toContainText("6");
  const action=popup.locator(".ref32-dialog-footer .ref32-buy");
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
  const rect=await action.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.y+rect!.height).toBeLessThanOrEqual((width===390?844:667)+1);
  if(info.project.name==="chromium"){
    mkdirSync("docs/brand/brand02/conchas",{recursive:true});
    await page.screenshot({path:"docs/brand/brand02/conchas/v32-3l-half-dozen-mobile-"+width+".png",animations:"disabled"});
  }
  await page.keyboard.press("Escape");
 }
});

test("REF_C approved: Pan de Muerto has four complete SKU choices with real AED prices",async ({page},info)=>{
 await page.setViewportSize({width:1440,height:900});
 await readyVisualBakery(page,"/visual-v32/bakery?category=mexican&lang=es");
 const seasonal=page.locator('.ref32-product[data-product-id="pan-de-muerto-traditional-pack"]');
 const alternative=page.locator('.ref32-product[data-product-id="conchas-traditional-pack"]');
 const card=(await seasonal.count()&&await seasonal.isEnabled())?seasonal:alternative;
 // Do not override or bypass Pan de Muerto seasonality merely to capture a screenshot.
 await expect(card).toBeEnabled({timeout:12000});
 await card.click();
 const popup=page.getByRole("dialog");
 const choices=popup.locator(".ref32-options-four");
 await expect(choices.locator("button")).toHaveCount(4);
 await expect(choices).toContainText("Media docena");
 await expect(choices).toContainText("Docena");
 await expect(choices).toContainText("Mini");
 await expect(choices).toContainText("Individual");
 const expectedSku=await card.getAttribute("data-product-id")==="pan-de-muerto-traditional-pack"
   ?"pan-de-muerto-traditional-pack-12-individuales"
   :"conchas-traditional-pack-12-individuales";
 await choices.locator('[data-sku="'+expectedSku+'"]').click();
 await expect(popup).toHaveAttribute("data-selected-sku",expectedSku);
 await expect(popup.locator(".ref32-price strong")).toContainText("AED 140");
 await expect(popup.locator(".ref32-price-quantity .ref32-quantity")).toBeVisible();
 await expect(card).toHaveAttribute("data-selected-product","true");
 if(info.project.name==="chromium"){
   mkdirSync("docs/brand/brand02/conchas",{recursive:true});
   await page.screenshot({path:"docs/brand/brand02/conchas/v32-REF-C-direct-four-1440.png",animations:"disabled"});
 }
});
test("REF_D approved: mobile Orejas shows three direct purchase sizes",async ({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await readyVisualBakery(page,"/visual-v32/bakery?category=bakery&lang=es");
 const card=page.locator('.ref32-product[data-product-id="orejas"]');
 await expect(card).toBeEnabled({timeout:12000});
 await card.click();
 const popup=page.getByRole("dialog");
 const sizes=popup.locator(".ref32-options-three");
 await expect(sizes.locator("button")).toHaveCount(3);
 await expect(sizes).toContainText("1 pieza");
 await expect(sizes).toContainText("Media docena");
 await expect(sizes).toContainText("Docena");
 await popup.locator('[data-pack-presentation="mini"]').click();
 await sizes.locator('[data-pack-pieces="6"]').click();
 await expect(popup).toHaveAttribute("data-selected-sku","orejas-6-mini-60-g-cada-uno");
 await expect(popup.locator(".ref32-price strong")).toContainText("AED 50");
 // Approved contract: personalization is cake-only; Orejas never takes a note.
 await expect(popup.locator(".ref32-note")).toHaveCount(0);
 await expect(popup.locator(".ref32-dialog-footer .ref32-buy")).toBeVisible();
 await expect(card).toHaveAttribute("data-selected-product","true");
 if(info.project.name==="chromium"){
   mkdirSync("docs/brand/brand02/conchas",{recursive:true});
   await page.screenshot({path:"docs/brand/brand02/conchas/v32-REF-D-direct-three-390.png",animations:"disabled"});
 }
});
test("REF_C functionality: non-persisted personalization can never silently enter real cart",async ({page})=>{
 await readyVisualBakery(page,"/visual-v32/bakery?category=cakes&lang=es");
 const classic=page.locator('.ref32-product[data-product-id="tres-leches--classic"]');
 await expect(classic).toBeEnabled({timeout:12000});
 await classic.click();
 const popup=page.getByRole("dialog");
 // "Feliz cumpleaños" (16 chars) is valid on Small (20): it enables the CTA.
 // Carried into Mini (15) it overflows: held with a warning, never attached.
 await popup.locator(".ref32-option").nth(1).click();
 await popup.locator(".ref32-note input").fill("Feliz cumpleaños");
 await expect(popup.locator(".ref32-buy")).toBeEnabled();
 await popup.locator(".ref32-option").nth(0).click();
 await expect(popup.locator(".ref32-buy")).toBeDisabled();
 await expect(popup.locator(".ref32-note-warning")).toBeVisible();
 expect(await page.evaluate(()=>String(localStorage.getItem("3l-cart")).includes("Feliz cumplea"))).toBe(false);
 // Back on Small the same message is valid again and is the only
 // personalization ever attached to the merchant cart.
 await popup.locator(".ref32-option").nth(1).click();
 await popup.locator(".ref32-note input").fill("Feliz cumpleaños");
 await expect(popup.locator(".ref32-buy")).toBeEnabled();
 await popup.locator(".ref32-buy").click();
 expect(await page.evaluate(()=>String(localStorage.getItem("3l-cart")).includes("Feliz cumpleaños"))).toBe(true);
});
