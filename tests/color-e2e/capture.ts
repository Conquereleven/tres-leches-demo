// Local visual evidence only. All financial returns and operations data are mocks.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { status, workspace } from "../fixtures/ux-states";
const phase = process.env.COLOR_PHASE ?? "before";
const out = "work/qa/color-refresh-v2";
mkdirSync(`${out}/${phase}`, { recursive: true });
const browser = await chromium.launch();
const records: Record<string, unknown> = {};
const errors: string[] = [];
for (const width of [390, 768, 1440]) {
  for (const lang of ["en", "es", "ar"]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    await context.route("https://**/*", (r) => r.abort()); // Never contact a payment or external provider.
    await context.addInitScript((locale) => {
      localStorage.setItem("3l-language", locale);
      localStorage.setItem(
        "3l-cart",
        JSON.stringify([
          {
            productId: "conchas-traditional-chocolate-individual-70-g",
            quantity: 4,
          },
        ]),
      );
      sessionStorage.setItem(
        "3l-checkout",
        JSON.stringify({ key: "00000000-0000-4000-8000-000000000000" }),
      );
    }, lang);
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/workspace", (r) => r.fulfill({ json: workspace() }));
    await page.route("**/api/auth/me", (r) =>
      r.fulfill({
        json: {
          agent: { id: "test-admin", name: "Fixture Admin", role: "admin" },
        },
      }),
    );
    let payment = "confirmed";
    await page.route("**/api/checkout/reconcile", (r) =>
      r.fulfill({
        json: status(
          payment === "confirmed"
            ? { status: "Confirmed", paymentStatus: "paid" }
            : {
                paymentStatus: "failed",
                status: "Awaiting Payment",
                actionRequired: "retry_payment",
              },
        ),
      }),
    );
    const scenes = process.env.COLOR_ONLY
      ? lang === "en"
        ? [process.env.COLOR_ONLY]
        : []
      : lang === "en"
        ? [
            "home",
            "catalog",
            "category",
            "product",
            "cart",
            "checkout",
            "details",
            "review",
            "form-error",
            "confirmation",
            "error",
            "policy",
            "modal",
            "operations",
          ]
        : ["home", "category", "checkout"];
    for (const scene of scenes) {
      payment = scene === "error" ? "failed" : "confirmed";
      const path: Record<string, string> = {
        home: "/",
        catalog: "/menu",
        category: "/menu?category=conchas",
        product: "/menu?product=conchas-traditional--chocolate",
        cart: "/cart",
        checkout: "/checkout",
        confirmation: "/checkout/return",
        error: "/checkout/return",
        policy: "/privacy",
        modal: "/menu",
        details: "/checkout",
        review: "/checkout",
        "form-error": "/checkout",
        operations: "/operations/orders",
      };
      await page.goto("http://127.0.0.1:3240" + path[scene], {
        waitUntil: "networkidle",
      });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      // Allow the existing preload/reveal hooks to settle; never alter runtime motion.
      await page.waitForTimeout(850);
      {
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 20));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(300);
      }
      if (["details", "review", "form-error"].includes(scene)) {
        await page.getByRole("radio", { name: "PICKUP", exact: true }).check();
        await page.getByLabel("Pickup date").fill("2026-10-13");
        await page
          .getByRole("combobox", { name: "Pickup time", exact: true })
          .selectOption("4:00 PM – 9:00 PM");
        await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();
        if (scene === "form-error")
          await page.getByRole("button", { name: "REVIEW ORDER" }).click();
        if (scene === "review") {
          await page.getByLabel("First name", { exact: true }).fill("Visual");
          await page.getByLabel("Last name", { exact: true }).fill("Fixture");
          await page
            .getByLabel("Email for payment receipt")
            .fill("visual@example.invalid");
          await page.getByLabel("Mobile number").fill("0500000000");
          await page
            .getByLabel("Street address", { exact: true })
            .fill("Fixture street");
          await page.getByLabel("City", { exact: true }).fill("Dubai");
          await page.getByRole("button", { name: "REVIEW ORDER" }).click();
        }
      }
      if (scene === "modal") {
        await page.setViewportSize({ width: 390, height: 900 });
        await page
          .getByRole("button", { name: "Open menu", exact: true })
          .click();
        await page.setViewportSize({ width, height: 900 });
      }
      const name = `${scene}-${lang}-${width}`;
      const geometry = await page.evaluate(() =>
        Array.from(document.querySelectorAll("body *"))
          .filter(
            (el) =>
              el instanceof HTMLElement &&
              getComputedStyle(el).display !== "none",
          )
          .map((el) => {
            const r = el.getBoundingClientRect(),
              s = getComputedStyle(el);
            return {
              tag: el.tagName,
              cls: el.getAttribute("class"),
              x: r.x,
              y: r.y,
              w: r.width,
              h: r.height,
              font: s.font,
              fontSize: s.fontSize,
              lineHeight: s.lineHeight,
              padding: s.padding,
              margin: s.margin,
              borderRadius: s.borderRadius,
              objectFit: s.objectFit,
              aspectRatio: s.aspectRatio,
              transform: s.transform,
              transition: s.transitionDuration,
              animation: s.animationDuration,
              media:
                el instanceof HTMLImageElement
                  ? el.getAttribute("src")
                  : el instanceof HTMLVideoElement
                    ? el.getAttribute("poster")
                    : null,
            };
          }),
      );
      const colors = await page.evaluate(() =>
        Array.from(document.querySelectorAll("body *")).map((el) => {
          const s = getComputedStyle(el);
          return [s.color, s.backgroundColor, s.borderColor, s.boxShadow];
        }),
      );
      const brokenImages = await page.evaluate(() =>
        Array.from(document.images)
          .filter((i) => i.complete && i.naturalWidth === 0)
          .map((i) => i.getAttribute("src")),
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      const violations =
        scene === "operations"
          ? []
          : (
              await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze()
            ).violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => ({
                target: n.target,
                summary: n.failureSummary,
              })),
            }));
      await page.screenshot({
        path: `${out}/${phase}/${name}.jpg`,
        type: "jpeg",
        quality: 78,
        fullPage: true,
      });
      records[name] = { geometry, colors, overflow, violations, brokenImages };
      if (scene === "modal") await page.setViewportSize({ width, height: 900 });
    }
    await context.close();
  }
}
await browser.close();
if (process.env.COLOR_ONLY) {
  Object.assign(records, {
    ...JSON.parse(readFileSync(`${out}/${phase}.json`, "utf8")).records,
    ...records,
  });
}
writeFileSync(
  `${out}/${phase}.json`,
  JSON.stringify({ records, errors }, null, 2),
);
if (phase === "after") {
  const before = JSON.parse(readFileSync(`${out}/before.json`, "utf8"));
  const comparisons = Object.entries(records).map(([name, value]) => ({
    name,
    geometryUnchanged:
      JSON.stringify((value as { geometry: unknown }).geometry) ===
      JSON.stringify(before.records[name].geometry),
    operationsColorsUnchanged:
      !name.startsWith("operations") ||
      JSON.stringify((value as { colors: unknown }).colors) ===
        JSON.stringify(before.records[name].colors),
  }));
  writeFileSync(
    `${out}/comparison.json`,
    JSON.stringify({ comparisons, errors }, null, 2),
  );
  console.log(JSON.stringify(comparisons));
  const regressions = comparisons.filter(
    (result) => !result.geometryUnchanged || !result.operationsColorsUnchanged,
  );
  const unsafeScenes = Object.entries(records).filter(([name, value]) => {
    const scene = value as {
      overflow: boolean;
      violations: unknown[];
      brokenImages: unknown[];
    };
    return (
      scene.violations.length > 0 ||
      scene.brokenImages.length > 0 ||
      (scene.overflow && !before.records[name].overflow)
    );
  });
  if (regressions.length || unsafeScenes.length || errors.length) {
    throw new Error(
      `Visual gate failed: ${regressions.length} preservation regressions, ${unsafeScenes.length} unsafe scenes, ${errors.length} page errors`,
    );
  }
}
console.log(
  `${phase}: ${Object.keys(records).length} scenes; ${errors.length} page errors`,
);
