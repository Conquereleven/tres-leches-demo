/**
 * 3L-SEO-AEO-002: Operations is a lazily loaded chunk. Customers never fetch
 * it, and a tab whose chunk disappeared (e.g. after a deploy) reloads once
 * instead of failing; it never loops.
 */
import { test, expect, type Page } from "@playwright/test";

const operations = (page: Page) =>
  page.locator(".ops-sidebar, .ops-auth h1, .ops-shell form").first();
const goToOperations = (page: Page) =>
  page.evaluate(() => {
    history.pushState({}, "", "/operations/inbox");
    dispatchEvent(new PopStateEvent("popstate"));
  });

test("customers do not download Operations; staff get it on demand", async ({
  page,
}) => {
  const chunks: string[] = [];
  page.on("request", (r) => {
    if (/\/assets\/Workspace-[^/]+\.js$/.test(r.url())) chunks.push(r.url());
  });
  for (const path of ["/", "/menu", "/cart", "/checkout", "/terms"]) {
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible();
  }
  expect(chunks).toEqual([]);
  await goToOperations(page);
  await expect(operations(page)).toBeVisible();
  expect(chunks.length).toBe(1);
  await page.reload();
  await expect(operations(page)).toBeVisible();
});

test("a missing Operations chunk reloads the page once", async ({
  page,
  browserName,
}) => {
  let failed = 0;
  let loads = 0;
  page.on("load", () => loads++);
  await page.route(/\/assets\/Workspace-[^/]+\.js$/, (route) => {
    if (failed++ === 0) return route.abort();
    return route.continue();
  });
  await page.goto("/");
  await goToOperations(page);
  await expect.poll(() => loads).toBe(2);
  expect(new URL(page.url()).pathname).toBe("/operations/inbox");
  // After a deploy the reloaded page names a new chunk, which loads normally.
  // WebKit keeps the failed fetch of the same URL for the reloaded document, so
  // only Chromium can show the full recovery with an unchanged build.
  if (browserName === "chromium") await expect(operations(page)).toBeVisible();
});

test("a chunk that keeps failing does not reload in a loop", async ({
  page,
}) => {
  let loads = 0;
  page.on("load", () => loads++);
  await page.route(/\/assets\/Workspace-[^/]+\.js$/, (route) => route.abort());
  await page.goto("/");
  await goToOperations(page);
  await page.waitForTimeout(3000);
  expect(loads).toBeLessThanOrEqual(2);
  await expect(operations(page)).toHaveCount(0);
});
