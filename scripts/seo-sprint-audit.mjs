// Read-only lab measurements against an explicitly started loopback fixture.
// No field CWV claims. Run baseline/candidate separately while the machine is idle.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
const [origin, route, output, dist = "dist/client"] = process.argv.slice(2);
if (
  !origin ||
  !["127.0.0.1", "localhost"].includes(new URL(origin).hostname) ||
  !route?.startsWith("/") ||
  !output
)
  throw new Error(
    "Usage: node scripts/seo-sprint-audit.mjs http://127.0.0.1:PORT /route output.json [dist/client]",
  );
const browser = await chromium.launch();
const runs = [];
try {
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.seoLab = { lcp: null, cls: 0, eventDurations: [] };
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.seoLab.lcp = e.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          if (!e.hadRecentInput) window.seoLab.cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          if (e.interactionId) window.seoLab.eventDurations.push(e.duration);
      }).observe({ type: "event", buffered: true, durationThreshold: 16 });
    });
    await page.goto(origin + route);
    await page.locator("[data-product-id]").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    const select = page.locator("select").first();
    if (await select.count()) {
      await select.focus();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(300);
    const result = await page.evaluate(() => ({
      ...window.seoLab,
      overflow: document.documentElement.scrollWidth > innerWidth,
      resources: performance
        .getEntriesByType("resource")
        .map((e) => ({ url: e.name, transferBytes: e.transferSize })),
      images: Array.from(document.images)
        .filter((i) => i.closest("main"))
        .map((i) => ({
          src: i.currentSrc,
          width: i.width,
          height: i.height,
          naturalWidth: i.naturalWidth,
          naturalHeight: i.naturalHeight,
        })),
      fonts: document.fonts.status,
    }));
    const bundles = [
      ...new Set(
        result.resources
          .map((r) => new URL(r.url).pathname)
          .filter((p) => /^\/assets\/.*\.(js|css)$/.test(p)),
      ),
    ];
    result.bundles = bundles.map((path) => {
      const bytes = readFileSync(resolve(dist, "." + path));
      return {
        path,
        bytes: bytes.length,
        gzipBytes: gzipSync(bytes, { level: 9 }).length,
      };
    });
    result.maxObservedInteractionMs = result.eventDurations.length
      ? Math.max(...result.eventDurations)
      : null;
    runs.push(result);
    await context.close();
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        origin,
        route,
        conditions:
          "3 cold browser contexts, 390x844, local machine, no network/CPU throttle. LCP/CLS and sampled keyboard event timings are lab diagnostics, not field INP or CrUX certification.",
        runs,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
