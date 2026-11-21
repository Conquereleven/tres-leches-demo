import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

for (const width of [320,390,1440]) {
  test(`S01 unified journey and Journal stay intact at ${width}px`, async ({page}, info) => {
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
    if (info.project.name === "chromium" && (width === 390 || width === 1440)) {
      mkdirSync("docs/brand/brand02/conchas", { recursive: true });
      await page.screenshot({
        path: `docs/brand/brand02/conchas/s01-home-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
  });
}
test("S01 reduced motion preserves final portrait without movement",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/");
  await expect(page.locator(".ref-sketch-final")).toBeVisible();
  await expect(page.locator(".ref-route-tracer")).toBeHidden();
});
