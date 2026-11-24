import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import type { LiveCatalog } from "../../src/brand/live-catalog";
const shots = "work/qa/media-consistency";
mkdirSync(shots, { recursive: true });
/**
 * Published-image journey adapted to canonical V3.2 (RT01 P1 remediation).
 * The retired legacy menu (detail page, `.b-menu-photo`, `.b-menu-no-photo`,
 * `.b-co-*` cart with `.b-co-thumb`, `.b-product-gallery`,
 * `.b-category-showcase`) no longer renders: the product surface is the
 * approved bakery card (`.ref32-photo img`, pending placeholder otherwise),
 * `/cart` carries no photographs by design, and `/checkout` keeps the
 * existing real Shop flow. Showcase constancy maps to asserting the legacy
 * showcase stays absent (Conchas V3.2 precedent); gallery confinement maps
 * to exactly one primary img per card (no gallery UI in V3.2 by design).
 */
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
      await visit(`/bakery?category=conchas&lang=${lang}`);
      const card = page.locator(
        `.ref32-product[data-product-id="${target.id}"]`,
      );
      await expect(card.locator(".ref32-photo img").first()).toBeVisible();
      // Legacy editorial showcase stays absent (Conchas V3.2 precedent).
      await expect(page.locator(".b-category-showcase")).toHaveCount(0);
      // Add a real isolated cart line before publication, without accepting an order.
      await card.scrollIntoViewIfNeeded();
      await card.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.locator(".ref32-buy").click();
      if (lang === "en")
        await card.screenshot({
          path: `${shots}/${info.project.name}-${width}-before.png`,
        });
      for (const p of answer.products.filter((p) => ids.includes(p.id)))
        p.media = [];
      answer.revision = "fixture-media-removed";
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      for (const p of targets) {
        const c = page.locator(
          `.ref32-product[data-product-id="${p.id}"]`,
        );
        await expect(c.locator(".ref32-photo img")).toHaveCount(0);
        await expect(c.locator(".ref32-photo-pending")).toBeVisible();
      }
      if (lang === "en")
        await page
          .locator(
            '.ref32-product[data-product-id="conchas-filled--pistache"]',
          )
          .screenshot({
            path: `${shots}/${info.project.name}-${width}-removed.png`,
          });
      await visit(`/cart?lang=${lang}`);
      // The approved V3.2 cart carries no photographs by design.
      await expect(page.locator(".v32-new-cart-row")).not.toHaveCount(0);
      await expect(page.locator(".v32-new-cart-row img")).toHaveCount(0);
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
      await visit(`/bakery?category=conchas&lang=${lang}`);
      const replaced = page.locator(
        `.ref32-product[data-product-id="${target.id}"] .ref32-photo img`,
      );
      // The approved card renders the first webp derivative.
      await expect(replaced).toHaveAttribute(
        "src",
        other.derivatives.find((d) => d.format === "webp")?.src ??
          other.derivatives[0]!.src,
      );
      // Exactly the new primary: no gallery expansion in V3.2 by design.
      await expect(
        page.locator(
          `.ref32-product[data-product-id="${target.id}"] .ref32-photo img`,
        ),
      ).toHaveCount(1);
      if (lang === "en")
        await page.screenshot({
          path: `${shots}/${info.project.name}-${width}-replacement.png`,
          fullPage: true,
        });
      await visit(`/cart?lang=${lang}`);
      await expect(page.locator(".v32-new-cart-row img")).toHaveCount(0);
      // Commerce fields are byte-for-byte untouched by all media transitions.
      expect(answer.products.map((p) => p.options)).toEqual(
        original.products.map((p) => p.options),
      );
      expect(errors).toEqual([]);
    });
  }

/**
 * Operations suite below is UI-stable (operations workspace untouched by
 * V3.2) and needs no adaptation.
 */
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
  // V3.2: the approved card falls back to the pending placeholder when the
  // published image itself fails (onError), instead of a broken frame.
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
  await page.goto(`/bakery?category=conchas&lang=en`);
  const card = page.locator(
    `.ref32-product[data-product-id="${target.id}"]`,
  );
  await expect(card.locator(".ref32-photo-pending")).toBeVisible();
  await expect(card.locator(".ref32-photo img")).toHaveCount(0);
});

test("homepage named products follow publication while category/editorial previews stay independent", async ({
  page,
  request,
}) => {
  // V3.2: the home carries no named products; the bakery card is the named
  // product surface and the home editorial images are static reference
  // assets. Publication changes the card, never the editorial surfaces, and
  // never bakes published photos into server HTML.
  const catalog: LiveCatalog = await (
    await page.request.get("/api/storefront/catalog")
  ).json();
  const target = catalog.products.find(
    (p) => p.id === "tres-leches-premium--dulce-de-leche",
  )!;
  const homeBefore = await (await request.get("/")).text();
  const editorialBefore = homeBefore.match(
    /\/brand\/approved\/editorial-mexico-dubai\.webp/g,
  );
  expect(editorialBefore?.length).toBeGreaterThan(0);
  expect(homeBefore).not.toContain("/brand/hub/");
  target.media = [];
  await page.route("**/api/storefront/catalog", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.goto("/bakery?category=cakes&lang=en");
  const card = page.locator(
    `.ref32-product[data-product-id="${target.id}"]`,
  );
  await expect(card.locator(".ref32-photo-pending")).toBeVisible();
  await expect(card.locator(".ref32-photo img")).toHaveCount(0);
  const homeAfter = await (await request.get("/")).text();
  expect(
    homeAfter.match(/\/brand\/approved\/editorial-mexico-dubai\.webp/g),
  ).toEqual(editorialBefore);
  expect(homeAfter).not.toContain("/brand/hub/");
});

test("product cards keep one approved primary, with no gallery and no editorial showcase", async ({
  page,
}) => {
  // V3.2: every card frame is the approved 4/3 cover (the retired
  // illustration/contain vs photograph/cover split and the `picture`
  // rotation are gone by approved design); there is no gallery UI and no
  // category showcase. A gallery-role asset must never surface anywhere.
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
  await page.goto("/bakery?category=conchas&lang=en");
  const card = page.locator(
    `.ref32-product[data-product-id="${target.id}"]`,
  );
  await card.scrollIntoViewIfNeeded();
  const frame = card.locator(".ref32-photo");
  await expect(frame).toBeVisible();
  const ratio = await frame.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return b.width / b.height;
  });
  expect(ratio).toBeGreaterThan(4 / 3 - 0.02);
  expect(ratio).toBeLessThan(4 / 3 + 0.02);
  const photo = card.locator(".ref32-photo img");
  await expect(photo).toBeVisible();
  await expect(photo).toHaveCSS("object-fit", "cover");
  await expect(card.locator(".ref32-photo img")).toHaveCount(1);
  await expect(card.locator(".ref32-photo picture")).toHaveCount(0);
  // A failing gallery-role asset never surfaces on any card either.
  await expect(card.locator(".ref32-photo-pending")).toHaveCount(0);
  // The same approved frame contract holds for the pan family.
  await page.goto("/bakery?category=pan&lang=en");
  const photographic = page.locator(
    '.ref32-product[data-product-id="pan-de-muerto-traditional--ajonjoli"] .ref32-photo img',
  );
  await expect(photographic).toBeVisible();
  await expect(photographic).toHaveCSS("object-fit", "cover");
  // Legacy editorial showcase stays absent.
  await expect(page.locator(".b-category-showcase")).toHaveCount(0);
  await expect(page.locator(".b-official-rotation")).toHaveCount(0);
  // The purchase dialog carries no gallery UI.
  const panCard = page.locator(
    '.ref32-product[data-product-id="pan-de-muerto-filled-pack"]',
  );
  await panCard.scrollIntoViewIfNeeded();
  await panCard.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".b-product-gallery")).toHaveCount(0);
  await expect(dialog.locator("img")).toHaveCount(0);
});

test("dynamic homepage HTML cannot show stale bundled product photos before JavaScript loads", async ({
  request,
}) => {
  // V3.2: server HTML carries the dynamic catalog marker and editorial
  // reference assets, but never bundled product markers nor published
  // product photos (published /brand/hub/ images are runtime-only).
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('data-catalog="dynamic"');
  expect(html).not.toContain('data-product-media="bundled"');
  expect(html).toContain("editorial-mexico-dubai.webp");
  expect(html).not.toContain("/brand/hub/");
});
