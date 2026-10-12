import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { status } from "../fixtures/ux-states";
const phase = process.env.BRAND02_PHASE ?? "after";
for (const width of [390, 768, 1440])
  for (const locale of ["en", "es", "ar"]) {
    test(`${phase} storefront ${locale} ${width}`, async ({ page }, info) => {
      const out = `docs/brand/brand02/${phase}`;
      mkdirSync(out, { recursive: true });
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.route("https://**/*", (r) => r.abort());
      await page.addInitScript((l) => {
        localStorage.setItem("3l-language", l);
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
      }, locale);
      await page.route("**/api/checkout/reconcile", (r) =>
        r.fulfill({
          json: status({ paymentStatus: "paid", status: "Confirmed" }),
        }),
      );
      const scenes = {
        home: "/",
        category: "/menu?category=conchas",
        product: "/menu?product=conchas-traditional--chocolate",
        cart: "/cart",
        checkout: "/checkout",
        return: "/checkout/return",
      };
      const results: Record<string, unknown> = {};
      for (const [scene, path] of Object.entries(scenes)) {
        await page.goto(
          `${path}${path.includes("?") ? "&" : "?"}lang=${locale}`,
          { waitUntil: "networkidle" },
        );
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 700) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 25));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(350);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(await page.locator("html").getAttribute("dir")).toBe(
          locale === "ar" ? "rtl" : "ltr",
        );
        const broken = await page.locator("img").evaluateAll((images) =>
          images
            .filter((i) => {
              const img = i as HTMLImageElement;
              return (
                img.getBoundingClientRect().height > 0 &&
                img.complete &&
                img.naturalWidth === 0
              );
            })
            .map((i) => (i as HTMLImageElement).src),
        );
        expect(broken).toEqual([]);
        if (locale === "en" && info.project.name === "chromium")
          await page.screenshot({
            path: `${out}/${scene}-${width}.png`,
            fullPage: true,
          });
        if (phase === "after") {
          const axe = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          expect(axe.violations).toEqual([]);
          results[scene] = { broken, violations: axe.violations };
        }
      }
      expect(errors).toEqual([]);
      writeFileSync(
        `${out}/qa-${info.project.name}-${locale}-${width}.json`,
        JSON.stringify({ width, locale, errors, results }, null, 2),
      );
    });
  }
