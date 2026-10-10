import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
for (const width of [390, 1440])
  for (const locale of ["en", "es", "ar"]) {
    test(`conchas journey ${width} ${locale}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const visit = async (url: string) => {
        const config = page.waitForResponse((r) =>
          r.url().endsWith("/api/checkout/config"),
        );
        await page.goto(url);
        await config;
      };
      const root = `docs/brand/conchas-qa/${process.env.CONCHAS_BASELINE ? "before" : "after"}`;
      mkdirSync(root, { recursive: true });
      const shot = async (name: string) => {
        if (locale === "en" && info.project.name === "chromium")
          await page.screenshot({
            path: `${root}/${name}-${width}.png`,
            fullPage: true,
          });
      };
      await visit(`/menu?category=conchas&lang=${locale}`);
      const card = page.locator(
        '[data-product-id="conchas-traditional--chocolate"]',
      );
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator("img")).toBeVisible();
      if (!process.env.CONCHAS_BASELINE) {
        await expect(card.locator("picture")).toHaveAttribute(
          "data-media-kind",
          "digital-illustration",
        );
        for (const id of [
          "conchas-filled--pistache",
          "conchas-traditional-pack",
          "conchas-filled-pack",
        ])
          await expect(
            page.locator(`[data-product-id="${id}"] img`),
          ).not.toHaveAttribute("src", /concha-tradicional-chocolate/);
      }
      await shot("menu");
      await visit(
        `/menu?product=conchas-traditional--chocolate&lang=${locale}`,
      );
      await expect(page.locator(".b-menu-photo img")).toBeVisible();
      if (!process.env.CONCHAS_BASELINE) {
        const image = page.locator(".b-menu-photo img");
        await expect
          .poll(() => image.evaluate((i: HTMLImageElement) => i.naturalWidth))
          .toBeGreaterThan(0);
        expect(await image.evaluate((i) => getComputedStyle(i).objectFit)).toBe(
          "contain",
        );
        await expect(page.locator(".b-menu-media-note")).toContainText(
          locale === "en"
            ? "Digital illustration"
            : locale === "es"
              ? "Ilustración digital"
              : "رسم رقمي",
        );
        expect(
          (await new AxeBuilder({ page }).include(".b-menu-options").analyze())
            .violations,
        ).toEqual([]);
        await page
          .locator(".b-menu-selectors select")
          .selectOption({ index: 1 });
        await expect(page.locator(".b-menu-photo img")).toHaveAttribute(
          "src",
          /concha-tradicional-chocolate/,
        );
      }
      await shot("product");
      await page.locator(".b-menu-options button").last().click();
      await visit(`/cart?lang=${locale}`);
      await expect(page.locator(".b-co-thumb")).toBeVisible();
      if (!process.env.CONCHAS_BASELINE)
        await expect(page.locator(".b-co-thumb")).toHaveAttribute(
          "src",
          /concha-tradicional-chocolate/,
        );
      await shot("cart");
      await visit(`/checkout?lang=${locale}`);
      if (width === 390) await page.locator(".b-co-summary-toggle").click();
      await expect(page.locator(".b-co-thumb")).toBeVisible();
      if (!process.env.CONCHAS_BASELINE)
        await expect(page.locator(".b-co-thumb")).toHaveAttribute(
          "src",
          /concha-tradicional-chocolate/,
        );
      await shot("checkout");
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(await page.locator("html").getAttribute("dir")).toBe(
        locale === "ar" ? "rtl" : "ltr",
      );
    });
  }

if (!process.env.CONCHAS_BASELINE)
  for (const mode of ["webp", "family"])
    test(`digital image fallback ${mode}`, async ({ page }) => {
      await page.route("**/concha-tradicional-chocolate-*.avif", (r) =>
        r.abort(),
      );
      if (mode === "family")
        await page.route("**/concha-tradicional-chocolate-*.webp", (r) =>
          r.abort(),
        );
      const config = page.waitForResponse((r) =>
        r.url().endsWith("/api/checkout/config"),
      );
      await page.goto("/menu?product=conchas-traditional--chocolate");
      await config;
      const img = page.locator(".b-menu-photo img");
      await expect
        .poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth))
        .toBeGreaterThan(0);
      await expect(img).toHaveAttribute(
        "src",
        mode === "family"
          ? /menu\/conchas-traditional.webp/
          : /concha-tradicional-chocolate/,
      );
    });
