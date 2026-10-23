import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
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
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
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
      const root = `docs/brand/brand02/conchas`;
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
    mkdirSync("docs/brand/brand02/conchas", { recursive: true });
    const styles: { cardRatio: number; [key: string]: unknown }[] = [];
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
            cardBackground: getComputedStyle(card).backgroundColor,
            cardOverflow: getComputedStyle(card).overflow,
            cardWidth: c.width,
            cardHeight: c.height,
            imageWidth: img.getBoundingClientRect().width,
            sourceRatio:
              (img as HTMLImageElement).naturalWidth /
              (img as HTMLImageElement).naturalHeight,
            imageHeight: img.getBoundingClientRect().height,
            cardMargin: getComputedStyle(card).margin,
            titleMargin: getComputedStyle(
              document.querySelector(".b-menu-card h4")!,
            ).margin,
            selectorHeight: getComputedStyle(
              document.querySelector(".b-menu-selectors select")!,
            ).height,
            imageFit: getComputedStyle(img).objectFit,
            gridGap: getComputedStyle(grid).gap,
            transition: getComputedStyle(
              banner.querySelector("picture.is-active")!,
            ).transition,
          };
        }),
      );
      if (info.project.name === "chromium") {
        await capture(
          page,
          `docs/brand/brand02/conchas/reference-${category}-${width}.png`,
        );
        await page.locator(".b-menu-grid").screenshot({
          path: `docs/brand/brand02/conchas/grid-${category}-${width}.png`,
          // Isolate the comparison; fixed navigation is verified in full-page captures.
          style:
            ".b-header, .b-shopping-wa, .b-floating-cart { visibility: hidden !important; }",
        });
      }
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
    writeFileSync(
      `docs/brand/brand02/conchas/parity-${info.project.name}-${width}.json`,
      JSON.stringify({ pan: styles[0], conchas: styles[1] }, null, 2),
    );
    // PR #61: real food photographs fill the frame, deliberate illustrations
    // remain contained. All shared card geometry is still identical.
    expect(styles[0]!.imageFit).toBe("cover");
    expect(styles[1]!.imageFit).toBe("contain");
    expect({ ...styles[0], imageFit: "by-media-kind" }).toEqual({
      ...styles[1],
      imageFit: "by-media-kind",
    });
  });

for (const [slug, image] of [
  ["vainilla", "concha-tradicional-vainilla"],
  ["pistache", "concha-tradicional-pistache"],
  ["tricolor", "^/brand/icon\\.png$"],
] as const) {
  for (const [size, fils] of [
    ["Mini · 40 g", 1100],
    ["Individual · 70 g", 1300],
  ] as const) {
    test(`new traditional ${slug} ${size}: image, menu, cart and checkout`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 860 });
      const ready = page.waitForResponse((r) =>
        r.url().endsWith("/api/checkout/config"),
      );
      await page.goto(`/menu?product=conchas-traditional--${slug}&lang=es`);
      await ready;
      const card = page.locator('[data-menu-family="conchas-traditional"]');
      const img = card.locator(".b-menu-photo img");
      await expect
        .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
        .toBeGreaterThan(0);
      await expect(img).toHaveAttribute("src", new RegExp(image));
      const selector = card.locator(".b-menu-selectors select").first();
      await selector.selectOption({ label: size });
      await expect(card.locator(".b-menu-price")).toContainText(
        String(fils / 100),
      );
      if (slug === "tricolor") {
        await expect(card.locator(".b-add-to-cart > button")).toBeDisabled();
        await card
          .getByRole("combobox", { name: "Color", exact: true })
          .selectOption("green");
        await expect(card.locator(".b-pack-composition")).toContainText(
          "Verde",
        );
      }
      await expect(card.locator(".b-menu-options button").last()).toBeEnabled();
      await card.locator(".b-menu-options button").last().click();
      const cartReady = page.waitForResponse((r) =>
        r.url().endsWith("/api/checkout/config"),
      );
      await page.goto("/cart?lang=es");
      await cartReady;
      await expect(page.locator(".b-co-thumb")).toHaveAttribute(
        "src",
        new RegExp(image),
      );
      const checkoutReady = page.waitForResponse((r) =>
        r.url().endsWith("/api/checkout/config"),
      );
      await page.goto("/checkout?lang=es");
      await checkoutReady;
      if (await page.locator(".b-co-summary-toggle").isVisible())
        await page.locator(".b-co-summary-toggle").click();
      await expect(page.locator(".b-co-thumb")).toHaveAttribute(
        "src",
        new RegExp(image),
      );
    });
  }
}

for (const width of [390, 768, 1440])
  test(`final batch whole images in Pan reference frames and checkout continuity ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const visit = async (path: string) => {
      const ready = page.waitForResponse((r) =>
        r.url().endsWith("/api/checkout/config"),
      );
      await page.goto(path);
      await ready;
    };
    const root = "docs/brand/brand02/conchas";
    mkdirSync(root, { recursive: true });
    await visit("/menu?category=conchas");
    const banner = page.locator(".b-category-showcase");
    await banner.scrollIntoViewIfNeeded();
    await expect(banner.locator("picture.is-active img")).toHaveAttribute(
      "src",
      /3l-media-002\/conchas-0-m002-026-/,
    );
    await expect(
      banner.locator('img[src*="conchas_de_pistache_sobre_tabla_de_madera"]'),
    ).toHaveCount(0);
    const bannerStyle = await banner.evaluate((el) => ({
      ratio: getComputedStyle(el).aspectRatio,
      radius: getComputedStyle(el).borderRadius,
    }));
    await expect(banner.locator("picture.is-active img")).not.toHaveAttribute(
      "src",
      /square-v2/,
    );
    expect(bannerStyle.ratio).toBe("3 / 2");
    expect(parseFloat(bannerStyle.radius)).toBeGreaterThan(0);
    if (info.project.name === "chromium")
      await capture(page, `${root}/opening-${width}.png`);
    for (const [id, image] of [
      ["conchas-filled--pistache", "conchas_de_pistache_sobre_tabla_de_madera"],
      ["conchas-traditional-pack", "docena_de_conchas_de_chocolate_envuelta"],
      ["conchas-filled-pack", "conchas_de_pistache_envueltas_en_celofán"],
    ]) {
      await page.evaluate(() => localStorage.removeItem("3l-cart"));
      await visit(`/menu?product=${id}`);
      const card = page.locator(".b-menu-options");
      const img = card.locator(".b-menu-photo img");
      await expect(img).toHaveAttribute("src", new RegExp(image));
      await expect
        .poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth))
        .toBeGreaterThan(0);
      expect(
        await card
          .locator(".b-menu-photo")
          .evaluate((el) => getComputedStyle(el).aspectRatio),
      ).toBe("1 / 1");
      expect(await img.evaluate((el) => getComputedStyle(el).objectFit)).toBe(
        "contain",
      );
      expect(
        (await new AxeBuilder({ page }).include(".b-menu-options").analyze())
          .violations,
      ).toEqual([]);
      const add = card.locator("button").last();
      await expect(add).toBeEnabled();
      if (info.project.name === "chromium")
        await page.screenshot({
          path: `${root}/${id}-${width}.png`,
          fullPage: true,
        });
      await add.click();
      for (const path of ["cart", "checkout"]) {
        await visit(`/${path}`);
        if (await page.locator(".b-co-summary-toggle").isVisible())
          await page.locator(".b-co-summary-toggle").click();
        const thumb = page.locator(".b-co-thumb");
        await expect(thumb).toHaveAttribute("src", new RegExp(image));
        const frame = await thumb.evaluate((el) => {
          const b = el.getBoundingClientRect();
          return {
            ratio: b.width / b.height,
            radius: parseFloat(getComputedStyle(el).borderRadius),
          };
        });
        expect(frame.ratio).toBeCloseTo(1, 1);
        expect(frame.radius).toBeGreaterThan(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (info.project.name === "chromium")
          await page.screenshot({
            path: `${root}/${id}-${path}-${width}.png`,
            fullPage: true,
          });
      }
    }
    expect(errors).toEqual([]);
  });

for (const width of [390, 768, 1440])
  test(`all eight approved Conchas uniform frames, row alignment and journey ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const visit = async (path: string) => {
      const ready = page.waitForResponse((r) =>
        r.url().endsWith("/api/checkout/config"),
      );
      await page.goto(path);
      await ready;
    };
    await visit("/menu?category=conchas");
    const cards = page.locator(".b-menu-card");
    await expect(cards).toHaveCount(8);
    expect(
      await cards.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-product-id")),
      ),
    ).toEqual([
      "conchas-traditional--chocolate",
      "conchas-traditional--vainilla",
      "conchas-traditional--pistache",
      "conchas-traditional--tricolor",
      "conchas-filled--pistache",
      "conchas-traditional-pack",
      "conchas-filled-pack",
      "conchas-tricolor-pack",
    ]);
    for (const id of [
      "conchas-traditional--tricolor",
      "conchas-tricolor-pack",
    ]) {
      await expect(
        page.locator(`[data-product-id="${id}"] .b-menu-photo img`),
      ).toHaveAttribute("src", "/brand/icon.png");
    }
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          card
            .locator(".b-menu-photo img")
            .evaluate((i: HTMLImageElement) => i.naturalWidth),
        )
        .toBeGreaterThan(0);
    }
    const frames = await cards.evaluateAll((nodes) =>
      nodes.map((card) => {
        const frame = card.querySelector(".b-menu-photo")!,
          img = frame.querySelector("img")!;
        const b = frame.getBoundingClientRect(),
          css = getComputedStyle(frame);
        return {
          id: card.getAttribute("data-product-id"),
          width: b.width,
          height: b.height,
          top: b.top,
          bottom: b.bottom,
          ratio: css.aspectRatio,
          radius: css.borderRadius,
          background: css.backgroundColor,
          overflow: css.overflow,
          fit: getComputedStyle(img).objectFit,
          imageHeight: img.getBoundingClientRect().height,
          imageWidth: img.getBoundingClientRect().width,
          sourceRatio:
            (img as HTMLImageElement).naturalWidth /
            (img as HTMLImageElement).naturalHeight,
        };
      }),
    );
    for (const f of frames) {
      expect(f.ratio).toBe("1 / 1");
      expect(f.radius).toBe("20px");
      expect(f.overflow).toBe("hidden");
      expect(f.fit).toBe("contain");
      expect(f.sourceRatio).toBe(1);
      expect(f.background).toBe(frames[0]!.background);
      expect(f.height).toBeCloseTo(frames[0]!.height, 0);
      expect(f.width / f.height).toBeCloseTo(1, 2);
      expect(Math.abs(f.imageHeight - f.height)).toBeLessThan(1);
      expect(Math.abs(f.imageWidth - f.width)).toBeLessThan(1);
    }
    for (const a of frames)
      for (const b of frames)
        if (Math.abs(a.top - b.top) < 1)
          expect(a.bottom).toBeCloseTo(b.bottom, 0);
    const root = "docs/brand/brand02/conchas";
    mkdirSync(root, { recursive: true });
    writeFileSync(
      `${root}/geometry-${info.project.name}-${width}.json`,
      JSON.stringify(frames, null, 2),
    );
    if (info.project.name === "chromium")
      await capture(page, `${root}/eight-cards-${width}.png`);
    const ids = frames.map((f) => f.id!);
    for (const id of ids) {
      await visit(`/menu?product=${id}`);
      const frame = page.locator(".b-menu-photo");
      expect(
        await frame.evaluate((el) => getComputedStyle(el).aspectRatio),
      ).toBe("1 / 1");
      expect(
        await frame.evaluate((el) => getComputedStyle(el).borderRadius),
      ).toBe("20px");
      if (id === "conchas-traditional--tricolor") {
        await page
          .getByRole("combobox", { name: "Color", exact: true })
          .selectOption("green");
        await expect(page.locator(".b-pack-composition")).toContainText(
          "Green",
        );
      }
      await page.locator(".b-menu-options button").last().click();
    }
    for (const path of ["cart", "checkout"]) {
      await visit(`/${path}`);
      if (await page.locator(".b-co-summary-toggle").isVisible())
        await page.locator(".b-co-summary-toggle").click();
      const thumbs = page.locator(".b-co-thumb");
      await expect(thumbs).toHaveCount(8);
      for (const thumb of await thumbs.all()) {
        const f = await thumb.evaluate((el) => {
          const b = el.getBoundingClientRect(),
            s = getComputedStyle(el);
          return {
            ratio: b.width / b.height,
            radius: s.borderRadius,
            fit: s.objectFit,
            background: s.backgroundColor,
          };
        });
        expect(f.ratio).toBeCloseTo(1, 2);
        expect(f.radius).toBe("12px");
        expect(f.fit).toBe("contain");
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (info.project.name === "chromium")
        await page.screenshot({
          path: `${root}/eight-${path}-${width}.png`,
          fullPage: true,
        });
    }
    expect(errors).toEqual([]);
  });
