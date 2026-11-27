import { expect, test, type Page } from "@playwright/test";

test.skip(!process.env.VR009_SYNTHETIC_PREVIEW, "VR009 uses the authorized disposable RT01.3 Product Hub fixture");

async function select(page: Page, id: string) {
  const product = page.locator(`button[data-product-id="${id}"]`);
  await product.click();
  const panel = page.getByRole("dialog");
  await expect(panel).toHaveAttribute("data-product-id",id);
  return { product, panel };
}

test("VR009 contextual opening has stable geometry and keyboard return across the responsive range", async ({page}) => {
  test.setTimeout(180_000);
  for (const width of [320,360,375,390,414,430,600,768,1440]) {
    await page.setViewportSize({width,height:800});
    await page.goto(`/bakery?category=pan&lang=${width===768?"ar":"en"}`);
    const tiles=page.locator(".product-grid .tile");
    await expect(tiles.first()).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const positions=()=>tiles.evaluateAll(nodes=>nodes.map(node=>{
      const box=node.getBoundingClientRect();
      return [box.left+scrollX,box.top+scrollY,box.width,box.height].map(value=>Math.round(value));
    }));
    const before=await positions();
    const ids=await tiles.locator("button[data-product-id]").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("data-product-id")!));
    for (const id of new Set([ids[0],ids[Math.floor(ids.length/2)],ids.at(-1)!])) {
      const {product,panel}=await select(page,id);
      await expect(panel).toHaveCSS("position","absolute");
      await expect.poll(async()=>{
        const [a,b]=await Promise.all([product.boundingBox(),panel.boundingBox()]);
        if(!a||!b||b.x < -1||b.x+b.width>width+1)return false;
        const side=await panel.getAttribute("data-placement");
        if(width>=1024)return side==="side";
        const tip=await panel.evaluate(el=>parseFloat(getComputedStyle(el).getPropertyValue("--pointer-x")));
        return Math.abs(a.x+a.width/2-b.x-tip)<3 &&
          (side==="above" ? b.y+b.height<=a.y : b.y>=a.y+a.height);
      }).toBe(true);
      expect(await positions()).toEqual(before);
      await panel.locator(".ref32-buy").scrollIntoViewIfNeeded();
      await expect(panel.locator(".ref32-buy")).toBeInViewport();
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(product).toBeFocused();
      expect(await positions()).toEqual(before);
    }
  }
});

test("VR009 live SKUs, Panettone combinations, commercial minimums and persisted checkout", async ({page,request,baseURL}) => {
  const headers={Origin:new URL(baseURL!).origin};
  const catalogue=await (await request.get("/api/storefront/catalog")).json();
  const configuration=await (await request.get("/api/checkout/config")).json();
  const price=(id:string)=>configuration.products.find((entry:{id:string})=>entry.id===id).priceFils;
  const baking=catalogue.products.filter((entry:{categoryId:string})=>entry.categoryId==="panettone");
  expect(baking).toHaveLength(3);
  for (const p of baking) {
    await page.goto("/menu/"+p.slug+"?lang=en");
    const {panel}=await select(page,p.id);
    const options=panel.locator("button[data-sku]");
    await expect(options).toHaveCount(2);
    for (const id of await options.evaluateAll(nodes=>nodes.map(el=>el.getAttribute("data-sku")!))) {
      await panel.locator(`[data-sku="${id}"]`).click();
      await expect(panel).toHaveAttribute("data-selected-sku",id);
      await expect(panel.locator(".ref32-price strong")).toContainText(String(price(id)/100));
    }
    await expect(panel.locator(".ref32-note")).toHaveCount(0);
    await page.keyboard.press("Escape");
  }

  await page.goto("/bakery?category=pan&lang=en");
  const {panel}=await select(page,"pan-de-muerto-traditional--azucar");
  await panel.locator('[data-variant-id="pan-de-muerto-traditional--ajonjoli"]').click();
  await expect(panel).toHaveAttribute("data-selected-sku",/ajonjoli/);
  await panel.locator('[data-variant-id="pan-de-muerto-traditional--azucar"]').click();
  const individual=panel.locator('[data-sku*="individual"]');
  await individual.click();
  const sku=(await individual.getAttribute("data-sku"))!;
  await expect(panel).toHaveAttribute("data-selected-sku",sku);
  await expect(panel.locator(".quantity output")).toHaveText("6");
  await expect(panel.getByRole("button",{name:"Decrease quantity"})).toBeDisabled();
  await expect(panel.locator(".ref32-note")).toHaveCount(0);
  await panel.getByRole("button",{name:"Increase quantity"}).click();
  await expect(panel.locator(".quantity output")).toHaveText("7");
  await panel.getByRole("button",{name:"Decrease quantity"}).click();
  const quote=(quantity:number,extra:Record<string,unknown>={})=>request.post("/api/checkout/quote",{
    headers,data:{lines:[{productId:sku,quantity,...extra}],fulfillmentMethod:"pickup"},
  });
  expect((await quote(5)).ok()).toBe(false);
  expect((await quote(6,{cakeMessage:"Invalid synthetic inscription"})).ok()).toBe(false);
  const pickup=await quote(6);
  expect(pickup.ok()).toBe(true);
  expect((await pickup.json()).subtotalFils).toBe(price(sku)*6);
  const zone=configuration.zones.find((entry:{id:string})=>entry.id==="jlt-cluster-a");
  const deliveryQuote=(zoneId:string)=>request.post("/api/checkout/quote",{
    headers,data:{lines:[{productId:sku,quantity:6}],fulfillmentMethod:"delivery",zoneId},
  });
  const delivery=await deliveryQuote(zone.id);
  expect(delivery.ok()).toBe(true);
  expect(await delivery.json()).toMatchObject({subtotalFils:price(sku)*6,feeFils:zone.deliveryFeeAed*100});
  expect((await deliveryQuote("vr009-outside-coverage")).ok()).toBe(false);
  const invalidCombo=await quote(6,{productId:"panettone-pistacchio-unpublished-size"});
  expect(invalidCombo.ok()).toBe(false);
  expect(configuration.slots.length).toBeGreaterThan(0);
  await panel.locator(".ref32-buy").click();
  await page.goto("/cart");
  await page.reload();
  await expect(page.locator(".v32-new-cart-row")).toHaveCount(1);
  await page.getByRole("link",{name:/checkout/i}).click();
  await expect(page.locator(".vr009-checkout .b-co-header")).toBeVisible();
  await expect(page.locator(".v32-new-payment-block")).toHaveCount(0);
  await page.getByRole("radio",{name:"PICKUP",exact:true}).check();
  const pickupDate=page.getByLabel("Pickup date");
  await pickupDate.fill(configuration.dates.max);
  await page.getByLabel("Pickup time").selectOption(configuration.slots[0]);
  await page.getByRole("radio",{name:"DELIVERY",exact:true}).check();
  await expect(page.getByRole("heading",{name:"Delivery details"})).toBeVisible();
  const day=page.getByLabel("Delivery date");
  await day.fill(configuration.dates.max);
  await page.getByLabel("Delivery time").selectOption(configuration.slots[0]);
  await page.goBack();
  const row=page.locator(".v32-new-cart-row");
  await row.getByRole("spinbutton").fill("7");
  await row.getByRole("spinbutton").blur();
  await expect(row.getByRole("spinbutton")).toHaveValue("7");
  await row.getByRole("button",{name:"Remove"}).click();
  await expect(row).toHaveCount(0);
});

test("VR009 localized Rosca, reduced motion, menu and real cake personalization", async ({page,request,baseURL}) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  for (const locale of ["en","es","ar"]) {
    await page.goto("/?lang="+locale);
    await expect(page.locator(".v32-family-portrait")).toHaveAttribute("data-entrance","complete");
    await expect(page.locator("html")).toHaveAttribute("dir",locale==="ar"?"rtl":"ltr");
    const toggle=page.locator("#rosca-toggle");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded","true");
    await expect(page.locator("#rosca-content")).not.toHaveAttribute("inert","");
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded","false");
    await expect(toggle).toBeFocused();
  }
  await page.goto("/menu?lang=en");
  await expect(page.locator(".category-cake")).toBeVisible();
  await page.getByRole("link",{name:/explore cakes/i}).click();
  await expect(page).toHaveURL(/category=cakes/);
  const {panel}=await select(page,"tres-leches--classic");
  const controls=panel.locator("[data-cake-sizes] button");
  await expect(controls).toHaveCount(3);
  for (const [i,limit] of [15,20,30].entries()) {
    await controls.nth(i).click();
    await expect(panel.locator(".ref32-note input")).toHaveAttribute("maxlength",String(limit));
  }
  const sku=(await panel.getAttribute("data-selected-sku"))!;
  const headers={Origin:new URL(baseURL!).origin};
  const invalid=await request.post("/api/checkout/quote",{headers,data:{
    lines:[{productId:sku,quantity:1,cakeMessage:"x".repeat(31)}],fulfillmentMethod:"pickup",
  }});
  expect(invalid.ok()).toBe(false);
  await panel.locator(".ref32-note input").fill("Happy birthday");
  await panel.locator(".ref32-buy").click();
  await page.goto("/cart");
  await expect(page.locator("[data-cart-cake-message]")).toContainText("Happy birthday");
});
