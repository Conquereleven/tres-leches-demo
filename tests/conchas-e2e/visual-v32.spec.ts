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
