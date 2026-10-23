import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import type { LiveCatalog } from "../../src/brand/live-catalog";
const shots = "work/qa/media-consistency";
mkdirSync(shots, { recursive: true });
for (const width of [390, 768, 1440])
  for (const lang of ["en", "es", "ar"]) {
    test(`published images and removals across product/cart/checkout ${width} ${lang}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const catalog: LiveCatalog = await (
        await page.request.get("/api/storefront/catalog")
      ).json();
      const ids = [
        "conchas-traditional--tricolor",
        "conchas-filled--pistache",
        "conchas-filled-pack",
      ];
      const targets = catalog.products.filter((p) => ids.includes(p.id));
      const original = structuredClone(catalog);
      const target = targets.find((p) => p.id === "conchas-filled--pistache")!;
      const image = catalog.assets.find(
        (a) => a.id === target.media[0]!.assetId,
      )!;
      // Fixture revisions modify browser media only; authoritative SKU/quote data unchanged.
      let answer = structuredClone(catalog);
      await page.route("**/api/storefront/catalog", (route) =>
        route.fulfill({
          json: answer,
          headers: { "Cache-Control": "no-store" },
        }),
      );
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      // Let the real configuration response finish before leaving a document.
      // Otherwise WebKit reports test-driven request cancellation as a CORS error.
      const visit = async (url: string) => {
        const config = page.waitForResponse((r) =>
          r.url().endsWith("/api/checkout/config"),
        );
        await page.goto(url);
        await (await config).finished();
      };
      await visit(`/menu?category=conchas&lang=${lang}`);
      const card = page.locator(`[data-product-id="${target.id}"]`);
      await expect(card.locator(".b-menu-photo img").first()).toBeVisible();
      const editorial = await page
        .locator(".b-category-showcase img")
        .evaluateAll((imgs) => imgs.map((i) => i.getAttribute("src")));
      // Add a real isolated cart line before publication, without accepting an order.
      await card.locator(".b-menu-options button.b-button").click();
      if (lang === "en")
        await card.screenshot({
          path: `${shots}/${info.project.name}-${width}-before.png`,
        });
      for (const p of answer.products.filter((p) => ids.includes(p.id)))
        p.media = [];
      answer.revision = "fixture-media-removed";
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      for (const p of targets) {
        const c = page.locator(`[data-product-id="${p.id}"]`);
        await expect(c.locator(".b-menu-photo img")).toHaveCount(0);
        await expect(c.locator(".b-menu-no-photo")).toBeVisible();
      }
      expect(
        await page
          .locator(".b-category-showcase img")
          .evaluateAll((imgs) => imgs.map((i) => i.getAttribute("src"))),
      ).toEqual(editorial);
      if (lang === "en")
        await page
          .locator('[data-product-id="conchas-filled--pistache"]')
          .screenshot({
            path: `${shots}/${info.project.name}-${width}-removed.png`,
          });
      await visit(`/menu?product=${target.slug}&lang=${lang}`);
      await expect(page.locator(".b-menu-photo img")).toHaveCount(0);
      await expect(page.locator(".b-menu-no-photo")).toBeVisible();
      await visit(`/cart?lang=${lang}`);
      await expect(page.locator(".b-co-item img.b-co-thumb")).toHaveCount(0);
      await expect(page.locator(".b-co-item .b-co-thumb-empty")).toHaveText(
        "3L",
      );
      await visit(`/checkout?lang=${lang}`);
      await expect(page.locator("img.b-co-thumb")).toHaveCount(0);
      // Assign a different approved published asset; do not expand authored gallery.
      const other = catalog.assets.find(
        (a) =>
          a.id !== image.id && a.derivatives.some((d) => d.format === "webp"),
      )!;
      const changed = answer.products.find((p) => p.id === target.id)!;
      changed.media = [{ assetId: other.id, role: "primary", order: 0 }];
      answer = { ...answer, revision: "fixture-media-replaced" };
      await visit(`/menu?product=${target.slug}&lang=${lang}`);
      await expect(page.locator(".b-menu-photo img")).toHaveAttribute(
        "src",
        other.derivatives.find((d) => d.format === "webp" && d.width === 640)
          ?.src ??
          other.derivatives.find((d) => d.format === "webp")?.src ??
          other.derivatives[0]!.src,
      );
      await expect(page.locator(".b-product-gallery img")).toHaveCount(0);
      if (lang === "en")
        await page.screenshot({
          path: `${shots}/${info.project.name}-${width}-replacement.png`,
          fullPage: true,
        });
      await visit(`/cart?lang=${lang}`);
      await expect(page.locator("img.b-co-thumb")).toHaveCount(1);
      // Commerce fields are byte-for-byte untouched by all media transitions.
      expect(answer.products.map((p) => p.options)).toEqual(
        original.products.map((p) => p.options),
      );
      expect(errors).toEqual([]);
    });
  }

test("Operations lists factual product sizes without another flavour's family subtitle", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/operations/products");
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("conchas");
  const rows = page.locator(".ph-row");
  for (const flavor of ["chocolate", "vainilla", "pistache", "tricolor"]) {
    const row = rows
      .filter({
        hasText: new RegExp(`Concha tradicional (de )?${flavor}`, "i"),
      })
      .first();
    await expect(row).toBeVisible();
    await expect(row.locator("small")).toContainText("Mini");
    await expect(row.locator("small")).not.toContainText("chocolate");
  }
  await expect(
    rows
      .filter({ hasText: "Concha rellena de pistache" })
      .first()
      .locator("small"),
  ).toContainText("Individual");
  await page.screenshot({
    path: `${shots}/${info.project.name}-operations-subtitles.png`,
    fullPage: true,
  });
});

test("a failed published image shows a neutral placeholder instead of an authored photograph", async ({
  page,
}) => {
  const catalog: LiveCatalog = await (
    await page.request.get("/api/storefront/catalog")
  ).json();
  const target = catalog.products.find(
    (p) => p.id === "conchas-filled--pistache",
  )!;
  const asset = structuredClone(catalog.assets[0]!);
  asset.id = "fixture-missing-image";
  asset.version = "fixture-missing-version";
  asset.derivatives = [
    {
      src: "/brand/hub/fixture-missing.png",
      width: 640,
      height: 640,
      format: "webp",
    },
  ];
  catalog.assets.push(asset);
  target.media = [{ assetId: asset.id, role: "primary", order: 0 }];
  await page.route("**/api/storefront/catalog", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.route("**/brand/hub/fixture-missing.png", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.goto(`/menu?product=${target.slug}`);
  await expect(page.locator(".b-menu-photo .b-menu-no-photo")).toBeVisible();
  await expect(page.locator(".b-menu-photo img")).toHaveCount(0);
});

test("homepage named products follow publication while category/editorial previews stay independent", async ({
  page,
}) => {
  const catalog: LiveCatalog = await (
    await page.request.get("/api/storefront/catalog")
  ).json();
  const target = catalog.products.find(
    (p) => p.id === "tres-leches-premium--dulce-de-leche",
  )!;
  target.media = [];
  await page.route("**/api/storefront/catalog", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.goto("/");
  await expect(
    page.locator(".ref-cakes a").first().locator(".b-menu-no-photo"),
  ).toBeVisible();
  await expect(page.locator(".ref-cakes a").first().locator("img")).toHaveCount(
    0,
  );
  await expect(page.locator(".b-preview-grid img")).toHaveCount(5);
});

test("product cards keep one square primary, with gallery confined to detail and editorial at 3:2", async ({
  page,
}) => {
  const catalog: LiveCatalog = await (
    await page.request.get("/api/storefront/catalog")
  ).json();
  const target = catalog.products.find(
    (p) => p.id === "conchas-filled--pistache",
  )!;
  const missing = structuredClone(catalog.assets[0]!);
  missing.id = "fixture-broken-gallery";
  missing.version = "fixture-broken-gallery";
  missing.derivatives = [
    {
      src: "/brand/hub/fixture-broken-gallery.png",
      format: "webp",
      width: 640,
      height: 640,
    },
  ];
  catalog.assets.push(missing);
  target.media = [
    target.media[0]!,
    { assetId: missing.id, role: "gallery", order: 1 },
  ];
  await page.route("**/api/storefront/catalog", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.route("**/brand/hub/fixture-broken-gallery.png", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.goto("/menu?category=conchas");
  const card = page.locator(`[data-product-id="${target.id}"]`);
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator(".b-menu-photo picture")).toHaveCount(1);
  await expect(card.locator(".b-official-rotation")).toHaveCount(0);
  const photo = card.locator(".b-menu-photo img");
  await expect(photo).toBeVisible();
  await expect(photo).toHaveCSS("object-fit", "cover");
  const square = await card.locator(".b-menu-photo").evaluate((el) => {
    const b = el.getBoundingClientRect();
    return Math.abs(b.width / b.height - 1) < 0.02;
  });
  expect(square).toBe(true);
  // The unchanged category presentation is editorial, independent of product images.
  const editorial = page.locator(".b-category-showcase");
  if (await editorial.count()) {
    const ratio = await editorial.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return b.width / b.height;
    });
    expect(ratio).toBeGreaterThan(1.48);
    expect(ratio).toBeLessThan(1.52);
  }
  await page.goto(`/menu?product=${target.slug}`);
  await expect(page.locator(".b-product-gallery")).toBeVisible();
  await expect(page.locator(".b-menu-photo .b-official-rotation")).toHaveCount(0);
});

test("dynamic homepage HTML cannot show stale bundled product photos before JavaScript loads", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('data-catalog="dynamic"');
  expect(html).not.toContain('data-product-media="bundled"');
  expect(html).toContain('class="b-menu-no-photo"');
  expect(html).toContain('class="b-preview-grid"');
  expect(html).toContain("editorial-mexico-dubai.webp");
});
