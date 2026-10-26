import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PACK_SPECS, componentName } from "../../shared/pack-composition";
import { packCopy, packCopyNumber } from "../../shared/pack-copy";
import { readFileSync } from "node:fs";
import type { LiveCatalog } from "../../src/brand/live-catalog";

for (const width of [390, 1440])
  for (const lang of ["en", "es", "ar"] as const) {
    test(`three conversion journeys ${width} ${lang}`, async ({
      page,
    }, info) => {
      const browserErrors: string[] = [];
      page.on("pageerror", (error) => browserErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(message.text());
      });
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const resources = JSON.parse(
          readFileSync(`src/brand/locales/${lang}/menu.json`, "utf8"),
        ),
        copy = packCopy(lang),
        catalog: LiveCatalog = await (
          await page.request.get("/api/storefront/catalog")
        ).json();
      const spec = PACK_SPECS.find(
        (s) =>
          s.family === "filled" &&
          s.capacity === 12 &&
          s.size === "individuales",
      )!;
      await page.goto(`/menu?product=pan-de-muerto-filled-pack&lang=${lang}`);
      // The published detail defaults to this 12-individual pack. Its native
      // selector stores the human size label, while SKU identity stays in state.
      await expect(page.locator(".b-menu-selectors select")).toHaveValue(
        "12 individuales",
      );
      const builder = page.locator(".b-pack-builder"),
        spins = builder.getByRole("spinbutton"),
        add = page.locator(".b-add-to-cart > button");
      await expect(builder.locator("legend")).toHaveText(copy.buildHeading);
      await spins.first().fill("1");
      await expect(builder.getByRole("progressbar")).toHaveAttribute(
        "value",
        "1",
      );
      await expect(add).toBeDisabled();
      await expect(add).toHaveText(packCopyNumber(copy.remainingCta, 11));
      await builder.screenshot({
        path: info.outputPath(`pack-one-${width}-${lang}.png`),
      });
      expect(
        (await new AxeBuilder({ page }).include(".b-pack-builder").analyze())
          .violations,
      ).toEqual([]);
      await builder
        .getByRole("button", {
          name: `${copy.fillRemaining}: ${componentName(spec.components[0]!.componentSkuId, lang)}`,
          exact: true,
        })
        .click();
      await expect(spins.first()).toHaveValue("12");
      await expect(builder).toContainText(copy.ready);
      await expect(add).toBeEnabled();
      await expect(
        page.getByRole("textbox", { name: copy.numberBoxes, exact: true }),
      ).toHaveValue("1");
      await add.click();
      const panel = page.locator(".b-complementary");
      await expect(panel).toBeVisible();
      await expect(
        panel.getByRole("link", {
          name: resources.conversion_viewCart,
          exact: true,
        }),
      ).toBeVisible();
      await spins.first().fill("8");
      await spins.nth(1).fill("4");
      await add.click();
      const originalPacks = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("3l-cart")!),
      );
      expect(originalPacks).toHaveLength(2);
      expect(originalPacks[0].composition).not.toEqual(
        originalPacks[1].composition,
      );
      await page.goto(`/menu?lang=${lang}`);
      const search = page.getByRole("searchbox", {
        name: resources.conversion_searchLabel,
      });
      for (const q of ["milk", "leche", "cake", "conchas"]) {
        await search.fill(q);
        await expect(
          page.locator(".b-search-results li").first(),
        ).toBeVisible();
      }
      await search.fill("milk");
      await expect(page.locator(".b-search-results a").first()).toHaveAttribute(
        "href",
        /product=milk/,
      );
      await page
        .locator(".b-discovery-search")
        .screenshot({ path: info.outputPath(`search-${width}-${lang}.png`) });
      expect(
        (
          await new AxeBuilder({ page })
            .include(".b-discovery-search")
            .analyze()
        ).violations,
      ).toEqual([]);
      const milkUrl = await page
        .locator(".b-search-results a")
        .first()
        .getAttribute("href");
      await page.locator(".b-search-results a").first().click();
      await expect(page).toHaveURL(/product=milk/);
      await expect(page.locator(".b-menu-selectors select")).toHaveValue(
        catalog.products
          .find((p) => p.id === "milk")!
          .options.find(
            (o) =>
              o.id ===
              new URL(milkUrl!, "http://fixture.invalid").searchParams.get(
                "sku",
              ),
          )!.size!,
      );
      await page.goto(`/menu?product=tres-leches--classic&lang=${lang}`);
      await page.locator(".b-add-to-cart > button").click();
      const milk = page.locator('[data-recommendation="milk"]');
      await expect(milk).toBeVisible();
      const milkOption = catalog.products
        .find((p) => p.id === "milk")!
        .options.find((o) => o.size?.includes("190"))!;
      await expect(
        milk.getByRole("button", {
          name: resources.conversion_add,
          exact: true,
        }),
      ).toBeDisabled();
      await milk.getByRole("combobox").selectOption(milkOption.id);
      await panel.screenshot({
        path: info.outputPath(`recommendations-${width}-${lang}.png`),
      });
      expect(
        (await new AxeBuilder({ page }).include(".b-complementary").analyze())
          .violations,
      ).toEqual([]);
      await milk
        .getByRole("button", { name: resources.conversion_add, exact: true })
        .click();
      await expect(milk).toHaveCount(0);
      await panel
        .getByRole("link", { name: resources.conversion_viewCart, exact: true })
        .click();
      await expect(page.locator(".b-co-item")).toHaveCount(4);
      const updated = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("3l-cart")!),
      );
      expect(
        updated.filter((l: { composition?: unknown }) => l.composition),
      ).toEqual(originalPacks);
      expect(
        updated.find(
          (l: { productId: string }) => l.productId === milkOption.id,
        )?.quantity,
      ).toBe(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`cart-${width}-${lang}.png`),
        fullPage: true,
      });
      await page.locator(".b-co-summary a.b-co-cta").click();
      await expect(page).toHaveURL(/checkout/);
      expect(
        (await (await page.request.get("/__fixture/provider-count")).json())
          .providerPosts,
      ).toBe(0);
      expect(await page.locator("[data-translation-pending]").count()).toBe(0);
      expect(browserErrors).toEqual([]);
      if (lang === "ar")
        expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
    });
  }

test("search no-results, URL, keyboard and offline recovery", async ({
  page,
  context,
  browserName,
}) => {
  await page.goto("/menu?q=milk&lang=en");
  const input = page.getByRole("searchbox", { name: "Search the bakery" });
  await expect(input).toHaveValue("milk");
  await expect(page.locator(".b-search-results a").first()).toHaveAttribute(
    "href",
    /product=milk/,
  );
  await input.focus();
  if (browserName === "webkit") {
    // Safari's system Full Keyboard Access setting controls whether Tab
    // visits buttons. Verify the control itself accepts focus and activation.
    await page.getByRole("button", { name: "Clear search" }).focus();
  } else {
    await page.keyboard.press("Tab");
  }
  await expect(
    page.getByRole("button", { name: "Clear search" }),
  ).toBeFocused();
  // Safari's default full-keyboard-access setting may skip links on Tab.
  // Focus and Enter still verify keyboard activation on both engines.
  await page.locator(".b-search-results a").first().focus();
  await expect(page.locator(".b-search-results a").first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/product=milk/);
  await page.goBack();
  await expect(input).toHaveValue("milk");
  await input.fill("zzzzzzzz");
  await expect(
    page.getByText("No matching products available. Try a different search."),
  ).toBeVisible();
  await input.fill("milk");
  await context.setOffline(true);
  await expect(
    page.getByText("You are offline. Reconnect to check current availability."),
  ).toBeVisible();
  await expect(page.locator(".b-search-results li")).toHaveCount(0);
  await context.setOffline(false);
  await expect(page.locator(".b-search-results a").first()).toHaveAttribute(
    "href",
    /product=milk/,
  );
});

test("current published availability gates search and recommendations", async ({
  page,
}) => {
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
  await page.goto("/menu?q=milk&lang=en");
  await expect(
    page.locator('.b-search-results a[href*="product=milk"]'),
  ).toHaveCount(0);
  await page.goto("/menu?product=tres-leches--classic&lang=en");
  await page.locator(".b-add-to-cart > button").click();
  await expect(page.locator(".b-recommendation")).toHaveCount(0);
  await expect(page.locator(".b-complementary-nav a")).toBeVisible();
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
  await page.goto("/menu?q=milk&lang=en");
  await expect(
    page.getByText("The current menu is unavailable. Please try again."),
  ).toBeVisible();
  await expect(page.locator(".b-search-results li")).toHaveCount(0);
  failed = false;
  await page
    .locator(".b-discovery-search")
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  await expect(page.locator(".b-search-results a").first()).toHaveAttribute(
    "href",
    /product=milk/,
  );
});
