import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
async function capture(page: Page, path: string) {
  // Full-page captures do not trigger below-fold lazy images by themselves.
  for (const frame of await page.locator(".b-menu-card .b-menu-photo").all()) {
    await frame.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        frame
          .locator("picture.is-active img, img")
          .first()
          .evaluate((i: HTMLImageElement) => i.naturalWidth),
      )
      .toBeGreaterThan(0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: true });
}
for (const width of [390, 768, 1440])
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
          await capture(page, `${root}/${name}-${width}.png`);
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
        await expect(page.locator(".b-menu-media-note")).toHaveCount(0);
        expect(await page.locator("main").innerText()).not.toMatch(
          /digital illustration|AI generated|digitally generated|concept image|ilustración digital|رسم رقمي/i,
        );
        expect(await image.getAttribute("alt")).not.toMatch(
          /digital|illustration|generated/i,
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
      if (await page.locator(".b-co-summary-toggle").isVisible())
        await page.locator(".b-co-summary-toggle").click();
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

for (const width of [390, 768, 1440])
  test(`shared Pan and Conchas presentation ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const styles: unknown[] = [];
    for (const category of ["pan", "conchas"]) {
      const config = page.waitForResponse((r) =>
        r.url().endsWith("/api/checkout/config"),
      );
      await page.goto(`/menu?category=${category}`);
      await config;
      const showcase = page.locator(".b-category-showcase");
      await showcase.scrollIntoViewIfNeeded();
      const rotation = showcase.locator(".b-official-rotation");
      const first = rotation.locator("picture.is-active img");
      await expect
        .poll(() => first.evaluate((i: HTMLImageElement) => i.naturalWidth))
        .toBeGreaterThan(0);
      const src = await first.getAttribute("src");
      await expect(first).not.toHaveAttribute("src", src!, { timeout: 10000 });
      await rotation.focus();
      const held = await first.getAttribute("src");
      await page.waitForTimeout(3800);
      await expect(first).toHaveAttribute("src", held!);
      styles.push(
        await page.evaluate(() => {
          const banner = document.querySelector(".b-category-showcase")!;
          const card = document.querySelector(".b-menu-card .b-menu-photo")!;
          const img = card.querySelector("img")!;
          const grid = document.querySelector(".b-menu-grid")!;
          const b = banner.getBoundingClientRect();
          const c = card.getBoundingClientRect();
          return {
            bannerRatio: Math.round((b.width / b.height) * 100),
            bannerMargin: getComputedStyle(banner).marginBottom,
            cardRatio: Math.round((c.width / c.height) * 100),
            cardRadius: getComputedStyle(card).borderRadius,
            imageFit: getComputedStyle(img).objectFit,
            gridGap: getComputedStyle(grid).gap,
            transition: getComputedStyle(
              banner.querySelector("picture.is-active")!,
            ).transition,
          };
        }),
      );
      if (info.project.name === "chromium")
        await capture(
          page,
          `docs/brand/conchas-qa/after/reference-${category}-${width}.png`,
        );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await rotation.scrollIntoViewIfNeeded();
      await rotation.evaluate((node: HTMLElement) => node.blur());
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(rotation.locator("picture.is-active img")).toHaveAttribute(
        "src",
        src!,
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
    }
    expect(styles[0]).toEqual(styles[1]);
  });

for (const [slug, image] of [
  ["vainilla", "concha-tradicional-vainilla"],
  ["pistache", "concha-tradicional-pistache"],
  ["tricolor", "concha-tradicional-tricolor-mexico"],
] as const) {
  for (const [size, fils] of [["Mini · 40 g", 1100], ["Individual · 70 g", 1300]] as const) {
    test(`new traditional ${slug} ${size}: image, menu, cart and checkout`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 860 });
      const ready = page.waitForResponse(r => r.url().endsWith("/api/checkout/config"));
      await page.goto(`/menu?product=conchas-traditional--${slug}&lang=es`);
      await ready;
      const card = page.locator('[data-menu-family="conchas-traditional"]');
      const img = card.locator(".b-menu-photo img");
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
      await expect(img).toHaveAttribute("src", new RegExp(image));
      const selector = card.locator(".b-menu-selectors select");
      await selector.selectOption({ label: size });
      await expect(card.locator(".b-menu-price")).toContainText(String(fils / 100));
      await expect(card.locator(".b-menu-options button").last()).toBeEnabled();
      await card.locator(".b-menu-options button").last().click();
      const cartReady = page.waitForResponse(r => r.url().endsWith("/api/checkout/config"));
      await page.goto("/cart?lang=es");
      await cartReady;
      await expect(page.locator(".b-co-thumb")).toHaveAttribute("src", new RegExp(image));
      const checkoutReady = page.waitForResponse(r => r.url().endsWith("/api/checkout/config"));
      await page.goto("/checkout?lang=es");
      await checkoutReady;
      if (await page.locator(".b-co-summary-toggle").isVisible()) await page.locator(".b-co-summary-toggle").click();
      await expect(page.locator(".b-co-thumb")).toHaveAttribute("src", new RegExp(image));
    });
  }
}
