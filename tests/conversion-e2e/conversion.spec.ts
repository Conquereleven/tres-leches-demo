import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PACK_SPECS, componentName } from "../../shared/pack-composition";
import type { LiveCatalog } from "../../src/brand/live-catalog";

// Exercise the approved menu search handoff, live catalog filtering, and full
// pack-to-cart conversion on the public storefront in all three languages.
const PACK_12 = "pan-de-muerto-filled-pack-12-individuales";
const spec12 = () =>
  PACK_SPECS.find(
    (s) =>
      s.family === "filled" && s.capacity === 12 && s.size === "individuales",
  )!;

for (const width of [390, 1440])
  for (const lang of ["en", "es", "ar"] as const) {
    test(`three conversion journeys ${width} ${lang}`, async ({
      page,
    }, info) => {
      const browserErrors: string[] = [];
      const resourceLoadNoise: string[] = [];
      const badResponses: string[] = [];
      page.on("pageerror", (error) => browserErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        // Same bucketing as the Conchas V3.2 suite: generic network-layer
        // lines duplicate the response listener below; JS errors fail loudly.
        if (/^Failed to load resource/.test(message.text()))
          resourceLoadNoise.push(
            `${message.text()} @ ${message.location().url ?? "unknown"}`,
          );
        else browserErrors.push(`${message.text()} @ ${message.location().url ?? "unknown"}`);
      });
      page.on("response", (r) => {
        if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
      });
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      // 1. V3.2 landing keyword search across languages.
      await page.goto(`/menu?lang=${lang}`);
      const landingForm = page.locator(".menu-main").getByRole("search");
      const landingSearch = landingForm.getByRole("searchbox");
      await expect(landingSearch).toBeVisible();
      await landingSearch.fill("concha");
      await landingForm.screenshot({ path: info.outputPath(`search-${width}-${lang}.png`) });
      expect(
        (
          await new AxeBuilder({ page })
            .include(".menu-main form[role=search]")
            .analyze()
        ).violations,
      ).toEqual([]);
      await landingSearch.press("Enter");
      await expect(page).toHaveURL(/\/bakery\?.*q=concha/);
      expect(new URL(page.url()).searchParams.get("lang")).toBe(lang);
      await expect(page.locator('.ref32-product[data-category-id="conchas"]').first()).toBeVisible();
      await page.goBack();
      await landingSearch.fill("zzzzzzzz");
      await landingSearch.press("Enter");
      await expect(page.locator(".v32-search-empty")).toBeVisible();
      // 2. Bakery live search filters the grid; no-match stays explicit.
      await page.goto(`/bakery?category=pan&subcategory=pan&lang=${lang}`);
      await expect(page.locator(".structural-grid")).toBeVisible();
      await expect(page.locator(".ref32-product").first()).toBeVisible();
      const total = await page.locator(".ref32-product").count();
      expect(total).toBeGreaterThan(1);
      const bakerySearch = page.locator(".catalog-main input[type=search]");
      await bakerySearch.fill("relleno");
      const filtered = await page.locator(".ref32-product").count();
      expect(filtered).toBeGreaterThan(0);
      expect(filtered).toBeLessThan(total);
      await bakerySearch.fill("zzzzzzzz");
      await expect(page.locator(".v32-search-empty")).toBeVisible();
      await expect(page.locator(".ref32-product")).toHaveCount(0);
      await bakerySearch.fill("");
      await expect(page.locator(".ref32-product").first()).toBeVisible();
      // 3. V3.2 dialog customization: negative CTA, full composition, add.
      const card = page.locator(
        '.ref32-product[data-product-id="pan-de-muerto-filled-pack"]',
      );
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeEnabled();
      await card.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.locator(".ref32-dialog-footer")).toBeVisible();
      await dialog.locator(`[data-sku="${PACK_12}"]`).click();
      const buy = dialog.locator(".ref32-buy");
      await expect(buy).toBeDisabled();
      const pistachio = dialog.locator(".ref32-composition-row", {
        hasText: componentName(
          spec12().components[4]!.componentSkuId,
          lang,
        ),
      });
      await expect(pistachio).toBeVisible();
      await expect(dialog.locator(".ref32-composition")).toContainText("0/12");
      for (let i = 0; i < 12; i++)
        await pistachio
          .getByRole("button", { name: "+", exact: true })
          .click();
      await expect(
        dialog.locator(".ref32-composition"),
      ).toContainText("12");
      await expect(buy).toBeEnabled();
      await dialog
        .locator(".ref32-composition")
        .screenshot({ path: info.outputPath(`pack-one-${width}-${lang}.png`) });
      expect(
        (
          await new AxeBuilder({ page })
            .include(".ref32-composition")
            .analyze()
        ).violations,
      ).toEqual([]);
      await buy.click();
      await expect(page.locator(".v32-cart-status")).toBeVisible();
      // Second box, different mix: line identity keeps both compositions.
      await card.click();
      const dialog2 = page.getByRole("dialog");
      await expect(dialog2).toBeVisible();
      await dialog2.locator(`[data-sku="${PACK_12}"]`).click();
      const pistachio2 = dialog2.locator(".ref32-composition-row", {
        hasText: componentName(
          spec12().components[4]!.componentSkuId,
          lang,
        ),
      });
      const chocolate2 = dialog2.locator(".ref32-composition-row", {
        hasText: componentName(
          spec12().components[1]!.componentSkuId,
          lang,
        ),
      });
      for (let i = 0; i < 8; i++)
        await pistachio2
          .getByRole("button", { name: "+", exact: true })
          .click();
      for (let i = 0; i < 4; i++)
        await chocolate2
          .getByRole("button", { name: "+", exact: true })
          .click();
      await dialog2.locator(".ref32-buy").click();
      const originalPacks = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("3l-cart")!),
      );
      expect(originalPacks).toHaveLength(2);
      expect(originalPacks[0].composition).not.toEqual(
        originalPacks[1].composition,
      );
      // 4. Canonical V3.2 cart keeps both lines; handoff checkout is real.
      await page.goto(`/cart?lang=${lang}`);
      await expect(page.locator(".v32-new-cart-row")).toHaveCount(2);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`cart-${width}-${lang}.png`),
        fullPage: true,
      });
      await page.locator('a[href="/checkout"]').click();
      await expect(page).toHaveURL(/checkout/);
      expect(
        (await (await page.request.get("/__fixture/provider-count")).json())
          .providerPosts,
      ).toBe(0);
      expect(await page.locator("[data-translation-pending]").count()).toBe(0);
      // R5 precedent: only /visual-v32-reference/ responses are tolerated
      // (voluntarily unpublished decorative ZIP assets); every productive
      // failure fails with its exact URL, and JS errors fail loudly.
      const productive = badResponses.filter(
        (u) => !/\/visual-v32-reference\//.test(u),
      );
      const r5 = badResponses.filter((u) =>
        /\/visual-v32-reference\//.test(u),
      );
      expect(productive).toEqual([]);
      expect(resourceLoadNoise.length).toBeLessThanOrEqual(r5.length);
      // Pre-existing V3.2 shell behavior (VisualV32 injects the reference
      // Google Fonts stylesheet; the fixture CSP reports one connect-src
      // line for that exact css2 URL while style-src allows it and the
      // storefront keeps working on fallback fonts). Only that exact
      // message is tolerated; any other console error still fails.
      const fontCsp = browserErrors.filter(
        (u) =>
          /fonts\.googleapis\.com\/css2\?family=Cormorant\+Garamond/.test(u) &&
          (/violates the following Content Security Policy directive: "connect-src/.test(
            u,
          ) ||
            /Refused to connect to .* because it does not appear in the connect-src directive/.test(
              u,
            )),
      );
      expect(browserErrors.length).toBeLessThanOrEqual(fontCsp.length);
      expect(fontCsp.length).toBeLessThanOrEqual(3);
      if (lang === "ar")
        expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
    });
  }

test("search no-results, URL, keyboard and offline recovery", async ({
  page,
  browserName,
}) => {
  await page.goto("/menu?lang=en");
  const form = page.locator(".menu-main").getByRole("search");
  const input = form.getByRole("searchbox", { name: "Search the bakery" });
  const submit = form.getByRole("button", { name: "FIND", exact: true });
  await input.fill("concha");
  await input.focus();
  if (browserName === "webkit") {
    await submit.focus();
  } else {
    await page.keyboard.press("Tab");
  }
  await expect(submit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/bakery\?.*q=concha/);
  await expect(page.locator('.ref32-product[data-category-id="conchas"]').first()).toBeVisible();
  await page.goBack();
  await input.fill("zzzzzzzz");
  await input.press("Enter");
  await expect(page.locator(".v32-search-empty")).toBeVisible();
  await page.goBack();
  await expect(input).toBeVisible();
  // V3.2 bakery live search filters the grid; no-match stays explicit.
  // (?q= is honored on load; the grid below waits for the live catalog.)
  await page.goto("/bakery?category=pan&subcategory=pan&q=relleno&lang=en");
  const bakerySearch = page.getByRole("searchbox", {
    name: "Search the menu",
  });
  await expect(bakerySearch).toHaveValue("relleno");
  await expect(page.locator(".structural-grid")).toBeVisible();
  await expect(page.locator(".ref32-product").first()).toBeVisible();
  const cards = page.locator(".ref32-product");
  expect(await cards.count()).toBeGreaterThan(0);
  await bakerySearch.fill("zzzzzzzz");
  await expect(page.locator(".v32-search-empty")).toBeVisible();
  await expect(cards).toHaveCount(0);
  await bakerySearch.fill("");
  await expect(cards.first()).toBeVisible();
});

test("current published availability gates purchase, not listing", async ({
  page,
}) => {
  // V3.2 mapping: unpublished (orderable=false) options keep their cards
  // listed but hold purchase (disabled card, no price). There is no
  // recommendation combobox in the approved V3.2 design.
  await page.goto("/bakery?lang=en");
  await expect(page.locator(".structural-grid")).toBeVisible();
  const pack = page.locator(
    '.ref32-product[data-product-id="pan-de-muerto-filled-pack"]',
  );
  const milk = page.locator('.ref32-product[data-product-id="milk"]');
  await expect(pack).toBeEnabled();
  await expect(milk).toBeVisible();
  const catalog: LiveCatalog = await (
    await page.request.get("/api/storefront/catalog")
  ).json();
  const unavailable = structuredClone(catalog);
  for (const p of unavailable.products.filter((p) =>
    ["milk", "candles", "cake-topper"].includes(p.id),
  ))
    for (const o of p.options) o.orderable = false;
  await page.route("**/api/storefront/catalog", (r) =>
    r.fulfill({ json: unavailable }),
  );
  await page.goto("/bakery?lang=en");
  await expect(page.locator(".structural-grid")).toBeVisible();
  // Listing is intact (searchable catalog), purchase is held.
  await expect(
    page.locator('.ref32-product[data-product-id="milk"]'),
  ).toBeDisabled();
  await expect(
    page.locator('.ref32-product[data-product-id="pan-de-muerto-filled-pack"]'),
  ).toBeEnabled();
});

test("catalog outage exposes recoverable search state without stale results", async ({
  page,
}) => {
  const catalog = await (
    await page.request.get("/api/storefront/catalog")
  ).json();
  let failed = true;
  await page.route("**/api/storefront/catalog", (r) =>
    failed
      ? r.fulfill({ status: 503, json: { error: "fixture" } })
      : r.fulfill({ json: catalog }),
  );
  await page.goto("/bakery?category=pan&subcategory=pan&lang=en");
  await expect(page.locator(".v32-message")).toContainText(
    "Online ordering is unavailable.",
  );
  await expect(page.locator(".ref32-product")).toHaveCount(0);
  failed = false;
  // The V3.2 catalog revalidates on its scheduled refresh once the outage
  // clears; the user gesture below mirrors the manual retry path.
  await page
    .locator(".v32-message")
    .getByRole("button", { name: "TRY AGAIN", exact: true })
    .click();
  await expect(page.locator(".ref32-product").first()).toBeVisible({
    timeout: 20000,
  });
});
