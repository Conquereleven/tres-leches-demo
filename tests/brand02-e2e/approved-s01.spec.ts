import { test, expect } from "@playwright/test";

for (const width of [320,390,1440]) {
  test(`S01 unified journey and Journal stay intact at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await page.goto("/");
    const unified = page.locator(".s01-history-unified");
    await expect(unified).toHaveCount(1);
    await expect(unified.locator(".ref-bridge")).toHaveCount(1);
    await expect(unified.locator(".ref-family")).toHaveCount(1);
    await expect(page.locator(".b-menu-preview,.ref-featured")).toHaveCount(0);
    const childOrder = await unified.locator(":scope > *").evaluateAll(els =>
      els.map(el => el.classList.contains("ref-bridge") ? "route" : el.classList.contains("ref-family") ? "journal" : "unknown")
    );
    expect(childOrder).toEqual(["route","journal"]);
    await expect(unified.locator(".ref-route-motion")).toHaveCount(1);
    await expect(unified.locator(".ref-scroll-sketch")).toHaveCount(1);
    await expect(unified.locator(".ref-liza")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test("S01 reduced motion preserves final portrait without movement",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/");
  await expect(page.locator(".ref-sketch-final")).toBeVisible();
  await expect(page.locator(".ref-route-tracer")).toBeHidden();
});
