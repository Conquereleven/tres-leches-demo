import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expectCheckoutConfig } from "../helpers/storefront";

/**
 * RT01 RC-05: canonical V3.2 conchas acceptance.
 *
 * The retired legacy menu (`/menu` with `.b-menu-*` anatomy, incidental
 * `/api/checkout/config` waits, `.b-co-thumb` continuity) no longer renders:
 * canonical `/menu`, `/bakery`, `/cart` and policies all mount the approved
 * V3.2 shell (see `src/brand/Root.tsx`), while `/checkout` keeps the existing
 * real Shop flow. Every legacy contract below is mapped to its V3.2 approved
 * equivalent instead of deleted:
 *
 * - incidental config waits  -> visible catalog readiness + one explicit
 *   `GET /api/checkout/config` 200 per test (server authority, never gating).
 * - `Mini · 40 g` / `Individual · 70 g` selectors -> V3.2 dialog `[data-sku]`
 *   variant buttons (labels unchanged: conchas catalog is out of scope and
 *   stays identical to the released catalog).
 * - blocked CTA            -> tricolor single keeps an approved hold: `.ref32-buy`
 *   stays disabled until a color is chosen (positive + negative assertions).
 * - 40-char inscription    -> cakes keep Mini/Small/Medium 15/20/30; Conchas and
 *   Orejas dialogs render NO inscription field (`.ref32-note` count 0).
 * - legacy banner rotation -> published subcategory navigation
 *   (`[data-category-source="published"]`) with legacy banner selectors
 *   asserted absent; photography fallback is img-or-approved-pending (RC-06).
 * - cart/checkout thumbs   -> V3.2 cart rows (server name + each-price) and the
 *   real Shop `/checkout` review; prices always come from the server.
 */

const CONCHAS_IDS = [
  "conchas-traditional--chocolate",
  "conchas-traditional--vainilla",
  "conchas-traditional--tricolor",
  "conchas-traditional-pack",
  "conchas-tricolor-pack",
] as const;

const catalog = (lang: string) =>
  `/bakery?category=conchas&subcategory=conchas&lang=${lang}`;

/**
 * RT01 R4: approved media authority per product (`src/brand/media.tsx` +
 * `media-manifest.json` + `category-media.json`). Three visible products carry an
 * assigned product asset; the two tricolor products intentionally resolve to
 * NO product media (`selectedProductMedia` returns undefined for them) and
 * must never display another SKU's photograph. No fictitious photos are
 * demanded: with-media SKUs assert their real photo, without-media SKUs
 * assert the approved pending placeholder (or the family fallback in
 * bundled mode) plus the wrong-photo negative.
 */
const PRODUCTS_WITH_MEDIA = [
  "conchas-traditional--chocolate",
  "conchas-traditional--vainilla",
  "conchas-traditional-pack",
] as const;
const PRODUCTS_WITHOUT_MEDIA = [
  "conchas-traditional--tricolor",
  "conchas-tricolor-pack",
] as const;

test("conchas SKU-to-photo mapping: real photo per SKU, never a wrong one", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await readyCatalog(page, catalog("en"));
  await expectCheckoutConfig(request);
  const cards = page.locator(".ref32-product");
  await expect.poll(() => cards.count()).toBe(CONCHAS_IDS.length);
  const frames = await cards.evaluateAll((nodes) =>
    nodes.map((n) => ({
      id: n.getAttribute("data-product-id"),
      src: n.querySelector(".ref32-photo img")?.getAttribute("src") ?? null,
      pending: n.querySelector(".ref32-photo-pending") !== null,
    })),
  );
  const byId = new Map(frames.map((f) => [f.id, f]));
  // Positive: every SKU with approved media shows its real photograph.
  const productSrcs = new Set<string>();
  for (const id of PRODUCTS_WITH_MEDIA) {
    const f = byId.get(id);
    expect(f, `card for ${id}`).toBeDefined();
    expect(f!.pending, `${id} must show its photo, not a placeholder`).toBe(
      false,
    );
    expect(f!.src, `${id} photo src`).toBeTruthy();
    productSrcs.add(f!.src!);
  }
  // No two SKUs share one photograph: a shared src is a misassigned image.
  expect(productSrcs.size).toBe(PRODUCTS_WITH_MEDIA.length);
  // Tricolor products have no approved product media: pending placeholder or
  // the family fallback image — never another SKU's photograph (negative).
  for (const id of PRODUCTS_WITHOUT_MEDIA) {
    const f = byId.get(id);
    expect(f, `card for ${id}`).toBeDefined();
    if (f!.src)
      expect(
        productSrcs.has(f!.src),
        `${id} shows another SKU's photo: ${f!.src}`,
      ).toBe(false);
    else
      expect(
        f!.pending,
        `${id} without photo needs the pending placeholder`,
      ).toBe(true);
  }
  expect(errors).toEqual([]);
});

async function readyCatalog(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator(".structural-grid")).toBeVisible();
  await expect(page.locator(".ref32-product").first()).toBeVisible();
}

async function capture(page: Page, path: string) {
  // Full-page captures do not trigger below-fold lazy images by themselves.
  for (const frame of await page.locator(".ref32-product .ref32-photo").all()) {
    await frame.scrollIntoViewIfNeeded();
    await expect
      .poll(() => frame.evaluate((node) =>
        !!node.querySelector('.ref32-photo-pending, [data-media-state="load-error"]') ||
        (node.querySelector("img")?.naturalWidth ?? 0) > 0,
      ))
      .toBe(true);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path, fullPage: true });
}

async function openDialog(page: Page, productId: string) {
  const card = page.locator(`.ref32-product[data-product-id="${productId}"]`);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeEnabled();
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".ref32-dialog-footer")).toBeVisible();
  return { card, dialog };
}

for (const width of [390, 768, 1440])
  for (const locale of ["en", "es", "ar"]) {
    test(`conchas journey ${width} ${locale}`, async ({ page, request }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      // V3.2 readiness is the visible catalog, never an incidental API fetch.
      // Server authority stays as one explicit, navigation-independent check.
      await readyCatalog(page, catalog(locale));
      await expectCheckoutConfig(request);
      const root = `docs/brand/brand02/conchas`;
      mkdirSync(root, { recursive: true });
      const shot = async (name: string) => {
        if (locale === "en" && info.project.name === "chromium")
          await capture(page, `${root}/${name}-${width}.png`);
      };
      const card = page.locator(
        '[data-product-id="conchas-traditional--chocolate"]',
      );
      await card.scrollIntoViewIfNeeded();
      // Approved photography or the approved pending placeholder: never a
      // broken frame and never a concept image passed off as a photograph.
      await expect(
        card.locator(".ref32-photo img, .ref32-photo-pending").first(),
      ).toBeVisible();
      await shot("menu");
      const { dialog } = await openDialog(
        page,
        "conchas-traditional--chocolate",
      );
      // Conchas have no inscription field: personalization is cake-only.
      await expect(dialog.locator(".ref32-note")).toHaveCount(0);
      await expect(
        (await new AxeBuilder({ page }).include(".ref32-dialog").analyze())
          .violations,
      ).toEqual([]);
      const buy = dialog.locator(".ref32-buy");
      await expect(buy).toBeEnabled();
      await expect(dialog.locator(".ref32-price strong")).toContainText(locale === "ar" ? /د\.إ/ : /AED/);
      await buy.click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(card).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("Escape").catch(() => {});
      await shot("product");
      await page.goto(`/cart?lang=${locale}`);
      await expect(page.locator('[data-new-ui="cart"]')).toBeVisible();
      const row = page.locator(".v32-new-cart-items .v32-new-cart-row").first();
      await expect(row).toContainText(locale === "ar" ? /د\.إ/ : /AED/);
      await expect(row.locator('input[type="number"]')).toHaveAttribute(
        "max",
        "100",
      );
      await shot("cart");
      await page.goto(`/checkout?lang=${locale}`);
      await expect(page.locator(".b-shop .b-co-header")).toBeVisible();
      await expect(page.locator("main")).toContainText(locale === "ar" ? /كونشا|كونتشا/ : /concha/i);
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
  for (const mode of ["avif", "webp", "family"])
    test(`digital image fallback ${mode}`, async ({ page, request }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      if (mode === "avif")
        await page.route("**/*.avif", (r) => r.abort());
      else if (mode === "webp")
        await page.route("**/*.webp", (r) => r.abort());
      else
        await page.route("**/brand/menu/conchas-*.webp", (r) => r.abort());
      await readyCatalog(page, catalog("en"));
      await expectCheckoutConfig(request);
      const cards = page.locator(".ref32-product");
      await expect(cards.first()).toBeVisible();
      // Photography never gates the purchase: every card keeps an approved
      // frame (real photo or approved pending placeholder) and the dialog
      // stays buyable with no page error. Both modes prove graceful
      // degradation when derivatives are unreachable: webp aborts every webp
      // derivative (cards keep their frame via the pending placeholder or a
      // non-webp derivative, never a broken image passed off as a photo);
      // family aborts the authored conchas photos. Read all frames in one
      // browser snapshot because onError replaces images as requests finish.
      const frames = page.locator(".ref32-photo");
      if (mode === "avif") {
        const approvedArt = cards.locator('picture[data-media-kind="digital-illustration"] img');
        await approvedArt.scrollIntoViewIfNeeded();
        await expect.poll(() => approvedArt.evaluate((photo: HTMLImageElement) =>
          photo.naturalWidth > 0 ? new URL(photo.currentSrc).pathname : "",
        )).toMatch(/^\/brand\/approved\/docena_de_conchas_de_chocolate_envuelta-square-v2-\d+\.webp$/);
      }
      for (const frame of await frames.all()) {
        await frame.scrollIntoViewIfNeeded();
        await expect.poll(() => frame.evaluate((node) =>
          !!node.querySelector('.ref32-photo-pending, [data-media-state="load-error"]') ||
          (node.querySelector("img")?.naturalWidth ?? 0) > 0,
        )).toBe(true);
      }
      await expect
        .poll(() =>
          frames.evaluateAll((nodes) =>
            nodes.flatMap((frame, index) => {
              const content = frame.querySelectorAll(
                'img, .ref32-photo-pending, [data-media-state="load-error"]',
              );
              if (content.length !== 1)
                return [`frame ${index}: ${content.length} elements`];
              const [image] = content;
              return image instanceof HTMLImageElement &&
                image.complete &&
                image.naturalWidth === 0
                ? [`frame ${index}: image failed without a placeholder`]
                : [];
            }),
          ),
        )
        .toEqual([]);
      const { dialog } = await openDialog(
        page,
        "conchas-traditional--chocolate",
      );
      await expect(dialog.locator(".ref32-buy")).toBeEnabled();
      expect(errors).toEqual([]);
    });

for (const width of [390, 768, 1440])
  test(`shared Pan and Conchas presentation ${width}`, async ({
    page,
    request,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    // ?category=conchas selects the mexican filter (Pan + Conchas) with the
    // published subcategory switcher; ?category=mexican would fall back to
    // the unfiltered "all" view without that navigation.
    await readyCatalog(page, `/bakery?category=conchas&lang=en`);
    await expectCheckoutConfig(request);
    mkdirSync("docs/brand/brand02/conchas", { recursive: true });
    // Published navigation owns the Pan/Conchas split; the retired legacy
    // banner anatomy must not render anywhere on the canonical shell.
    const nav = page.locator('[data-category-source="published"]');
    await expect(nav).toBeVisible();
    await expect(nav.locator('[data-category-id="pan"]')).toBeVisible();
    await expect(nav.locator('[data-category-id="conchas"]')).toBeVisible();
    await expect(page.locator(".b-category-showcase")).toHaveCount(0);
    await expect(page.locator(".b-official-rotation")).toHaveCount(0);
    await nav.locator('[data-category-id="conchas"]').click();
    await expect
      .poll(() => page.locator(".ref32-product").count())
      .toBe(CONCHAS_IDS.length);
    expect(
      await page
        .locator(".ref32-product")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute("data-product-id")).sort(),
        ),
    ).toEqual([...CONCHAS_IDS].sort());
    await nav.locator('[data-category-id="pan"]').click();
    await expect(page.locator(".ref32-product").first()).toBeVisible();
    expect(
      await page
        .locator(".ref32-product")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute("data-product-id")),
        ),
    ).not.toContain("conchas-traditional--chocolate");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (info.project.name === "chromium")
      await capture(page, `docs/brand/brand02/conchas/reference-conchas-${width}.png`);
    expect(
      (await new AxeBuilder({ page }).include(".structural-grid").analyze())
        .violations,
    ).toEqual([]);
  });

for (const [slug, single] of [
  ["vainilla", "conchas-traditional-vainilla-mini-40-g"],
  ["tricolor", "conchas-traditional-tricolor-mini-40-g"],
] as const) {
  for (const [size, sku, price] of [
    ["Mini · 40 g", single, single.endsWith("40-g") ? "AED 11" : "AED 18"],
    [
      "Individual · 70 g",
      single.replace("mini-40-g", "individual-70-g"),
      single.endsWith("40-g") ? "AED 13" : "AED 21",
    ],
  ] as const) {
    test(`new traditional ${slug} ${size}: image, menu, cart and checkout`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width: 390, height: 860 });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await readyCatalog(page, catalog("es"));
      await expectCheckoutConfig(request);
      const { dialog } = await openDialog(page, `conchas-traditional--${slug}`);
      // Conchas carry no inscription: personalization stays cake-only.
      await expect(dialog.locator(".ref32-note")).toHaveCount(0);
      const option = dialog.locator(".ref32-option", { hasText: size }).first();
      await expect(option).toBeVisible();
      await option.click();
      await expect(dialog).toHaveAttribute("data-selected-sku", sku);
      // Server price for the chosen variant, never a client-side multiple.
      await expect(dialog.locator(".ref32-price strong")).toHaveText(price);
      if (slug === "tricolor") {
        // Approved hold (maps the retired blocked-CTA contract): a single
        // tricolor needs its color before the buy enables.
        const buy = dialog.locator(".ref32-buy");
        await expect(buy).toBeDisabled();
        await dialog
          .locator(".ref32-extra select")
          .selectOption({ label: "Verde" });
        await expect(buy).toBeEnabled();
      } else {
        await expect(dialog.locator(".ref32-buy")).toBeEnabled();
      }
      const amount = await dialog.locator(".ref32-price strong").innerText();
      await dialog.locator(".ref32-buy").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.goto("/cart?lang=es");
      await expect(page.locator('[data-new-ui="cart"]')).toBeVisible();
      const row = page.locator(".v32-new-cart-items .v32-new-cart-row").first();
      await expect(row).toContainText("AED");
      await expect(row).toContainText(amount.replace("AED ", ""));
      // The customer cart localizes the editor and keeps the selected color ID.
      if (slug === "tricolor") {
        const color = row.locator(".v32-new-tricolor select");
        await expect(color).toHaveValue("green");
        await expect(color.locator("option:checked")).toHaveText("Verde");
      }
      await page.goto("/checkout?lang=es");
      await expect(page.locator(".b-shop .b-co-header")).toBeVisible();
      await expect(page.locator("main")).toContainText(/concha/i);
      expect(errors).toEqual([]);
    });
  }
}

for (const width of [390, 768, 1440])
  test(`final batch whole images in Pan reference frames and checkout continuity ${width}`, async ({
    page,
    request,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    const resourceLoadNoise: string[] = [];
    const badResponses: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      // Generic network-layer lines carry no URL and duplicate the response
      // listener below (same underlying request); they are bucketed apart so
      // JS errors still fail loudly while resource URLs classify by response.
      if (/^Failed to load resource/.test(m.text()))
        resourceLoadNoise.push(`${m.text()} @ ${m.location().url ?? "unknown"}`);
      else errors.push(`${m.text()} @ ${m.location().url ?? "unknown"}`);
    });
    // Classify every failed network resource by exact URL. R5 reference
    // assets under /visual-v32-reference/ are voluntarily absent by design
    // (the ZIP is never published under public/): observed exact URL is
    // /visual-v32-reference/ref-home.png (decorative blossom background,
    // aria-hidden, page stays fully buyable). Only that documented directory
    // is allowlisted; any productive 404 (photo, API, route) fails below.
    page.on("response", (r) => {
      if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
    });
    const root = "docs/brand/brand02/conchas";
    mkdirSync(root, { recursive: true });
    await readyCatalog(page, catalog("en"));
    await expectCheckoutConfig(request);
    // V3.2 geometry contract (replaces the retired square-frame + banner
    // rotation checks): every approved frame shares ratio, radius, overflow
    // and cover fit; the legacy banner anatomy stays absent.
    await expect(page.locator(".b-category-showcase")).toHaveCount(0);
    for (const id of [
      "conchas-traditional--chocolate",
      "conchas-traditional--vainilla",
      "conchas-traditional-pack",
    ] as const) {
      await page.evaluate(() => localStorage.removeItem("3l-cart"));
      const { dialog } = await openDialog(page, id);
      await expect(dialog.locator(".ref32-note")).toHaveCount(0);
      await expect(dialog.locator(".ref32-buy")).toBeEnabled();
      if (info.project.name === "chromium")
        await page.screenshot({ path: `${root}/${id}-${width}.png` });
      await dialog.locator(".ref32-buy").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    if (info.project.name === "chromium")
      await capture(page, `${root}/opening-${width}.png`);
    for (const path of ["cart", "checkout"]) {
      await page.goto(`/${path}`);
      if (path === "cart") {
        await expect(page.locator('[data-new-ui="cart"]')).toBeVisible();
        await expect(
          page.locator(".v32-new-cart-items .v32-new-cart-row"),
        ).not.toHaveCount(0);
      } else {
        await expect(page.locator(".b-shop .b-co-header")).toBeVisible();
        await expect(page.locator("main")).toContainText(/concha/i);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (info.project.name === "chromium")
        await page.screenshot({
          path: `${root}/packs-${path}-${width}.png`,
          fullPage: true,
        });
    }
    // R5 reference ZIP assets are never published under public/ by design.
    // Only that documented /visual-v32-reference/ directory is tolerated;
    // every other failed response (photo, API, route) fails with its exact
    // URL, and resource-load console lines are tolerated only up to the
    // number of allowlisted R5 responses (same requests, no silent extras).
    const productive = badResponses.filter(
      (u) => !/\/visual-v32-reference\//.test(u),
    );
    const r5 = badResponses.filter((u) => /\/visual-v32-reference\//.test(u));
    expect(productive).toEqual([]);
    expect(resourceLoadNoise.length).toBeLessThanOrEqual(r5.length);
    expect(errors).toEqual([]);
  });

for (const width of [390, 768, 1440])
  test(`all five visible Conchas uniform frames and journey ${width}`, async ({
    page,
    request,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await readyCatalog(page, catalog("en"));
    await expectCheckoutConfig(request);
    const cards = page.locator(".ref32-product");
    await expect
      .poll(() => cards.count())
      .toBe(CONCHAS_IDS.length);
    expect(
      await cards.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-product-id")).sort(),
      ),
    ).toEqual([...CONCHAS_IDS].sort());
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded();
      await expect(
        card.locator(".ref32-photo img, .ref32-photo-pending").first(),
      ).toBeVisible();
    }
    const frames = await cards.evaluateAll((nodes) =>
      nodes.map((card) => {
        const frame = card.querySelector(".ref32-photo")!;
        const img = frame.querySelector("img");
        const b = frame.getBoundingClientRect();
        const css = getComputedStyle(frame);
        return {
          id: card.getAttribute("data-product-id"),
          width: b.width,
          height: b.height,
          top: b.top,
          bottom: b.bottom,
          ratio: css.aspectRatio,
          radius: css.borderRadius,
          overflow: css.overflow,
          fit: img ? getComputedStyle(img).objectFit : "pending",
          mediaKind: img?.closest("picture")?.dataset.mediaKind,
          pending: img === null,
        };
      }),
    );
    for (const f of frames) {
      expect(f.ratio).toBe(width < 1024 ? "1.045 / 1" : "auto");
      expect(f.radius).toBe(frames[0]!.radius);
      expect(Number.parseFloat(f.radius.split(" ").find(value => Number.parseFloat(value) > 0) ?? "0")).toBeGreaterThan(0);
      expect(f.overflow).toBe("hidden");
      // Approved photography fills the frame; the approved pending
      // placeholder is the only imageless state (RC-06).
      expect(f.fit).toBe(f.pending ? "pending" : f.mediaKind === "digital-illustration" ? "contain" : "cover");
      expect(f.width).toBeCloseTo(frames[0]!.width, 0);
      if (width < 1024) expect(f.width / f.height).toBeCloseTo(1.045, 2);
      else expect(f.height).toBeCloseTo(frames[0]!.height, 1);
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
      await capture(page, `${root}/visible-cards-${width}.png`);
    for (const id of CONCHAS_IDS) {
      const { dialog } = await openDialog(page, id);
      // Conchas never take an inscription; tricolor singles hold the buy
      // until a color is chosen (approved negative + positive pair).
      await expect(dialog.locator(".ref32-note")).toHaveCount(0);
      if (id === "conchas-traditional--tricolor") {
        await expect(dialog.locator(".ref32-buy")).toBeDisabled();
        await dialog
          .locator(".ref32-extra select")
          .selectOption({ label: "Green" });
        await expect(dialog.locator(".ref32-buy")).toBeEnabled();
      } else {
        await expect(dialog.locator(".ref32-buy")).toBeEnabled();
      }
      await dialog.locator(".ref32-buy").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await page.goto("/cart");
    await expect(page.locator('[data-new-ui="cart"]')).toBeVisible();
    await expect(
      page.locator(".v32-new-cart-items .v32-new-cart-row"),
    ).toHaveCount(CONCHAS_IDS.length);
    await page.goto("/checkout");
    await expect(page.locator(".b-shop .b-co-header")).toBeVisible();
    await expect(page.locator("main")).toContainText(/concha/i);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (info.project.name === "chromium") {
      await page.goto(catalog("en"));
      await readyCatalog(page, catalog("en"));
      await capture(page, `${root}/visible-cart-${width}.png`);
    }
    expect(errors).toEqual([]);
  });
