/**
 * 3L-SEO-AEO-002: Operations is a lazily loaded chunk. Customers never fetch
 * it, and a tab whose chunk disappeared (e.g. after a deploy) reloads once
 * instead of failing; it never loops.
 */
import { test, expect, type Page } from "@playwright/test";

const operations = (page: Page) =>
  page.locator(".ops-sidebar, .ops-auth h1, .ops-shell form").first();
const goToOperations = async (page: Page) => {
  if (new URL(page.url()).pathname !== "/") await page.goto("/");
  // Exercise the real React handler; an early synthetic popstate can run
  // before hydration installs its listener on slower WebKit CI machines.
  await page.getByRole("button", { name: "Gestión", exact: true }).click();
};

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
  let loads = 0;
  page.on("load", () => loads++);
  // A chunk removed by a deploy fails every request (Vite's modulepreload and the
  // import itself) until the page reloads; the reloaded page gets the new build.
  await page.route(/\/assets\/Workspace-[^/]+\.js$/, (route) =>
    loads < 2 ? route.abort() : route.continue(),
  );
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
