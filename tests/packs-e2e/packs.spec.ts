import { test, expect, type Page, type Locator } from "@playwright/test";
import { PACK_SPECS, componentName } from "../../shared/pack-composition";
import { mkdirSync } from "node:fs";

// RT01 V3.2: exercise the mounted .ref32 product dialog and .v32 cart.
// No application-side price, eligibility, provider or checkout logic is changed.
const shots = "work/qa/packs";
mkdirSync(shots, { recursive: true });
const spec = PACK_SPECS.find((s) =>
  s.family === "filled" && s.capacity === 12 && s.size === "individuales"
)!;
const cardId = "pan-de-muerto-filled-pack";
// Missing selectors must fail with useful diagnostics, not consume the entire job.
test.use({ actionTimeout: 15000, navigationTimeout: 30000 });

async function openBuilder(page: Page, language: "en" | "es" | "ar") {
  await page.goto("/bakery?category=mexican&lang=" + language);
  const card = page.locator('.ref32-product[data-product-id="' + cardId + '"]');
  await expect(card).toBeEnabled();
  await card.click();
  const dialog = page.locator(".ref32-dialog");
  await expect(dialog).toBeVisible();
  // Four direct V3.2 variant buttons replace the legacy two-stage selector.
  const variant = dialog.locator(`button[data-sku="${spec.packSkuId}"]`);
  await expect(variant).toBeVisible();
  await expect(variant).toBeEnabled();
  await variant.click();
  await expect(dialog).toHaveAttribute("data-selected-sku", spec.packSkuId);
  await expect(dialog.locator(".ref32-composition-row")).toHaveCount(5);
  return dialog;
}

async function chooseFlavor(dialog: Locator, id: string, amount: number, language: "en" | "es" | "ar") {
  const row = dialog.locator(".ref32-composition-row").filter({
    hasText: componentName(id, language),
  });
  await expect(row).toHaveCount(1);
  for (let i=0;i<amount;i++) {
    await row.getByRole("button",{name:"+",exact:true}).click();
  }
  await expect(row.locator("output")).toHaveText(String(amount));
}

async function readCart(page: Page) {
  return page.evaluate(() => (JSON.parse(localStorage.getItem("3l-cart") ?? "[]") as
    Array<{productId:string;quantity:number;composition?:Array<{componentSkuId:string;units:number}>}>)
    .map(l => ({
      productId:l.productId,
      quantity:l.quantity,
      composition:Object.fromEntries((l.composition ?? []).map(c=>[c.componentSkuId,c.units])),
    }))
  );
}

for(const width of [390,768,1440]) for(const language of ["en","es","ar"] as const) {
  test(String(width)+"px "+language+": V3.2 personalized 12-piece mix is complete, priced and durable",async({page})=>{
    await page.setViewportSize({width,height:1000});
    const errors:string[]=[];
    page.on("pageerror",(e)=>errors.push(e.message));
    const dialog=await openBuilder(page,language);
    const buy=dialog.locator(".ref32-buy");
    await expect(buy).toBeDisabled();
    await chooseFlavor(dialog,spec.components[4]!.componentSkuId,8,language);
    await expect(buy).toBeDisabled();
    await chooseFlavor(dialog,spec.components[1]!.componentSkuId,4,language);
    await expect(dialog.locator(".ref32-composition p")).toContainText("12/12");
    for (const plus of await dialog.locator(".ref32-composition-row").getByRole("button", {name: "+", exact: true}).all()) {
      await expect(plus).toBeDisabled();
    }
    await expect(dialog.locator(".ref32-price strong")).toContainText(/235/);
    await expect(buy).toBeEnabled();
    const config=await(await page.request.get("/api/checkout/config")).json();
    expect(config.products.find((p:{id:string})=>p.id===spec.packSkuId)?.priceFils).toBe(23500);
    await buy.scrollIntoViewIfNeeded();
    await buy.click();
    await expect(dialog).toHaveCount(0);
    await page.goto("/cart?lang="+language);
    await expect(page.locator(".v32-new-cart-row")).toHaveCount(1);
    const expected=[{
      productId:spec.packSkuId,
      quantity:1,
      composition:{
        [spec.components[4]!.componentSkuId]:8,
        [spec.components[1]!.componentSkuId]:4,
      },
    }];
    await expect.poll(()=>readCart(page)).toEqual(expected);
    const cartRow = page.locator(".v32-new-cart-row");
    await expect(cartRow).toContainText(`${componentName(spec.components[4]!.componentSkuId)} × 8`);
    await expect(cartRow).toContainText(`${componentName(spec.components[1]!.componentSkuId)} × 4`);
    await page.reload();
    await expect.poll(()=>readCart(page)).toEqual(expected);
    const quoted=await page.request.post("/api/checkout/quote",{
      headers:{Origin:"http://127.0.0.1:3272","Idempotency-Key":crypto.randomUUID()},
      data:{
        lines:[{productId:spec.packSkuId,quantity:1,composition:[
          {componentSkuId:spec.components[4]!.componentSkuId,units:8},
          {componentSkuId:spec.components[1]!.componentSkuId,units:4},
        ]}],
        fulfillmentMethod:"pickup",
      },
    });
    expect(quoted.status(),await quoted.text()).toBe(200);
    expect((await quoted.json()).totalFils).toBe(23500);
    await page.goto("/checkout?lang="+language);
    const summary = page.locator(".b-co-summary-items .b-pack-composition");
    await expect(summary).toHaveCount(1);
    await expect(summary).toContainText(`${componentName(spec.components[4]!.componentSkuId, language)} × 8`);
    await expect(summary).toContainText(`${componentName(spec.components[1]!.componentSkuId, language)} × 4`);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("local hosted checkout carries exact mixture to paid order, kitchen and preview-only ticket; manager cannot publish", async ({
  page,
  request,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const spec = PACK_SPECS.find(
    (s) =>
      s.family === "filled" && s.capacity === 12 && s.size === "individuales",
  )!;
  const composition = [
    { componentSkuId: spec.components[4]!.componentSkuId, units: 8 },
    { componentSkuId: spec.components[1]!.componentSkuId, units: 4 },
  ];
  const config = await (await request.get("/api/checkout/config")).json();
  const date = config.dates.min;
  const body = {
    lines: [{ productId: spec.packSkuId, quantity: 2, composition }],
    fulfillmentMethod: "pickup",
    pickup: { pickupDate: date, preferredTime: "4:00 PM – 9:00 PM" },
    customer: {
      firstName: "Pack",
      lastName: "UAT",
      phone: "0500000000",
      email: "uat@example.invalid",
    },
    billing: {
      sameAsDelivery: false,
      name: "Pack UAT",
      address1: "Fixture street",
      city: "Dubai",
      country: "AE",
    },
  };
  const headers = {
    Origin: "http://127.0.0.1:3272",
    "Idempotency-Key": crypto.randomUUID(),
  };
  const quote = await (
    await request.post("/api/checkout/quote", {
      headers,
      data: { lines: body.lines, fulfillmentMethod: "pickup" },
    })
  ).json();
  expect(quote.totalFils).toBe(47000);
  const response = await request.post("/api/checkout/web", {
    headers: { ...headers, "X-Checkout-Quote-Revision": quote.quoteRevision },
    data: body,
  });
  expect(response.status(), await response.text()).toBe(200);
  const checkout = await response.json();
  const replay = await request.post("/api/checkout/web", {
    headers,
    data: body,
  });
  expect((await replay.json()).orderId).toBe(checkout.orderId);
  await request.post("/__fixture/paid");
  const status = await request.post("/api/checkout/reconcile", {
    headers,
    data: { key: headers["Idempotency-Key"] },
  });
  expect(status.status(), await status.text()).toBe(200);
  expect((await status.json()).paymentStatus).toBe("paid");
  const login = await page.request.post("/api/login", {
    headers,
    data: { id: "admin", password: "pack-fixture-password" },
  });
  expect(login.status()).toBe(200);
  // Authenticate with the real server, then install its fixture-only session in
  // this HTTP loopback browser context. Linux WebKit rejects Secure cookies and
  // overrides a manually supplied Cookie header on HTTP. Production still emits
  // Secure/HttpOnly cookies; no application auth or cookie policy is relaxed.
  expect(login.headers()["set-cookie"]).toContain("; HttpOnly; Secure;");
  const adminCookie = login.headers()["set-cookie"]?.split(";")[0];
  expect(adminCookie).toBeTruthy();
  await page.context().addCookies([
    {
      name: "tl_session",
      value: adminCookie!.slice("tl_session=".length),
      url: "http://127.0.0.1:3272",
      httpOnly: true,
      secure: false,
      sameSite: "Strict",
    },
  ]);
  await page.goto(`/operations/orders/${checkout.orderId}`);
  await expect(page.getByText(/Pistachio × 8/).first()).toBeVisible();
  await expect(page.getByText(/Chocolate × 4/).first()).toBeVisible();
  await page.screenshot({
    path: `${shots}/${info.project.name}-order.png`,
    fullPage: true,
  });
  await page.goto("/operations/production");
  await expect(page.getByText(/Pistachio × 8/).first()).toBeVisible();
  await page.screenshot({
    path: `${shots}/${info.project.name}-kitchen.png`,
    fullPage: true,
  });
  await page.goto("/operations/print");
  await page
    .getByRole("combobox", { name: "Order", exact: true })
    .selectOption(checkout.orderId);
  await expect(page.getByText(/Pistachio × 8/).first()).toBeVisible();
  await page.screenshot({
    path: `${shots}/${info.project.name}-ticket.png`,
    fullPage: true,
  });
  await page.goto("/operations/products");
  await page.getByText("Pack flavor eligibility", { exact: true }).click();
  await page.screenshot({
    path: `${shots}/${info.project.name}-hub.png`,
    fullPage: true,
  });
  const managerLogin = await page.request.post("/api/login", {
    headers,
    data: { id: "manager", password: "pack-fixture-password" },
  });
  expect(managerLogin.status(), await managerLogin.text()).toBe(200);
  const managerCookie = managerLogin.headers()["set-cookie"]?.split(";")[0];
  const managerHeaders = { ...headers, Cookie: managerCookie };
  const managerViewResponse = await page.request.get("/api/product-hub", {
    headers: managerHeaders,
  });
  expect(managerViewResponse.status(), await managerViewResponse.text()).toBe(
    200,
  );
  const view = await managerViewResponse.json();
  expect(view.permissions.canPublish).toBe(false);
  const denied = await page.request.post("/api/product-hub/commands", {
    headers: managerHeaders,
    data: {
      type: "publish",
      expectedVersion: view.version,
      expectedPublishedRevision: view.published.id,
    },
  });
  expect(denied.status()).toBe(403);
});

test("V3.2 distinct flavors keep independent cart identities and server quote",async({page})=>{
  const first=await openBuilder(page,"en");
  await chooseFlavor(first,spec.components[4]!.componentSkuId,12,"en");
  await first.locator(".ref32-buy").click();
  const second=await openBuilder(page,"en");
  await chooseFlavor(second,spec.components[1]!.componentSkuId,12,"en");
  await second.locator(".ref32-buy").click();
  await page.goto("/cart");
  await expect(page.locator(".v32-new-cart-row")).toHaveCount(2);
  const saved=await readCart(page);
  expect(saved).toHaveLength(2);
  expect(saved[0]!.composition[spec.components[4]!.componentSkuId]).toBe(12);
  expect(saved[1]!.composition[spec.components[1]!.componentSkuId]).toBe(12);
  const quoted=await page.request.post("/api/checkout/quote",{
    headers:{Origin:"http://127.0.0.1:3272","Idempotency-Key":crypto.randomUUID()},
    data:{lines:saved.map(l=>({
      productId:l.productId,
      quantity:l.quantity,
      composition:Object.entries(l.composition).map(([componentSkuId,units])=>({componentSkuId,units})),
    })),fulfillmentMethod:"pickup"},
  });
  expect(quoted.status(),await quoted.text()).toBe(200);
  expect((await quoted.json()).totalFils).toBe(47000);
});
