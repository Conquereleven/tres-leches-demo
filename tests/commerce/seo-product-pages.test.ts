// 3L-SEO-AEO-002 Track B: indexable product pages and the live sitemap are
// driven by the published catalog revision only. Synthetic data, disposable
// databases; no provider is contacted.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, seed } from "../../server/db/store";
import type { Actor, State } from "../../server/domain/model";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import {
  hubCommand,
  hubView,
  type HubFlags,
} from "../../server/catalog/product-hub";
import { storefrontCatalog } from "../../server/catalog/storefront-api";
import { RETIRED_SKUS } from "../../shared/commerce-policy";
import {
  PRODUCT_PATH,
  availability,
  productPage,
  productSitemapEntries,
  sitemapWithProducts,
} from "../../server/seo/product-pages";
import { productSlugFromPath } from "../../src/brand/menu";

const sources = loadBootstrapSources(process.cwd());
const admin: Actor = { id: "liza", role: "admin" };
const ON: HubFlags = {
  enabled: true,
  publishEnabled: true,
  publishBlocked: null,
};
const ORIGIN = "https://www.3ldubai.ae";
const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Menu — Pastelerías 3L Dubai</title>
    <meta name="description" content="Menu description" />
    <link rel="canonical" href="https://www.3ldubai.ae/menu" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home"},{"@type":"ListItem","position":2,"name":"Menu"}]}</script>
  </head>
  <body><div id="root"><header>chrome</header><main id="main-content"><h1>Menu</h1></main><footer>footer</footer></div></body>
</html>`;
const social = {
  path: "/brand/icon.png",
  width: 410,
  height: 410,
  alt: "logo",
};
const render = (state: State, slug: string) =>
  productPage(state, slug, {
    origin: ORIGIN,
    menuTemplate: TEMPLATE,
    socialImage: social,
  });

function setup() {
  const state: State = seed();
  state.catalog = structuredClone(sources.approved);
  state.catalogFoundation = planCatalogBootstrap(
    state.catalog,
    sources,
  ).foundation;
  const store = new Store(":memory:", "test", state);
  const view = () => {
    const v = hubView(store.read(), admin, ON);
    assert.equal(v.available, true);
    return v as Extract<typeof v, { available: true }>;
  };
  type Product = ReturnType<typeof view>["products"][number];
  const payload = (p: Product) => ({
    product: {
      id: p.id,
      slug: p.slug,
      familyId: p.familyId!,
      categoryId: p.categoryId!,
      name: p.name,
      description: p.description,
      commercialState: p.commercialState,
      translations: structuredClone(p.translations),
      media: structuredClone(p.media),
    },
    variants: p.variants.map((v) => ({
      skuId: v.skuId,
      flavor: v.flavor,
      size: v.size,
      packQuantity: v.packQuantity,
      commercialState: v.commercialState,
      translations: v.translations,
      media: v.media,
      catalogName: v.catalogName,
      priceFils: v.priceFils,
      active: v.active,
      availability: v.availability,
    })),
  });
  const save = (p: ReturnType<typeof payload>) =>
    hubCommand(
      store,
      admin,
      randomUUID(),
      { type: "saveProduct", expectedVersion: view().version, ...p },
      ON,
    );
  const publish = () =>
    hubCommand(
      store,
      admin,
      randomUUID(),
      {
        type: "publish",
        expectedVersion: view().version,
        expectedPublishedRevision: view().published.id,
      },
      ON,
    );
  const cake = () =>
    view().products.find(
      (p) =>
        p.categoryId === "cakes" &&
        p.commercialState === "published" &&
        p.variants.filter((v) => v.active).length >= 2,
    )!;
  return { store, view, payload, save, publish, cake };
}

type Ld = Record<string, unknown> & {
  "@type": string;
  offers?: { price: string; priceCurrency: string; availability: string };
  sku?: string;
  hasVariant?: {
    sku: string;
    offers: { price: string; priceCurrency: string; availability: string };
  }[];
};
const jsonLd = (html: string) =>
  [
    ...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g),
  ].map((m) => JSON.parse(m[1]!) as Ld);
const offersOf = (ld: Ld) =>
  ld["@type"] === "ProductGroup"
    ? ld.hasVariant!.map((v) => ({ sku: v.sku, ...v.offers }))
    : [{ sku: ld.sku as string, ...ld.offers! }];

test("a published product renders crawlable HTML whose prices match the catalog and JSON-LD", () => {
  const { store } = setup();
  const catalog = storefrontCatalog(store.read());
  for (const p of catalog.products) {
    const page = render(store.read(), p.slug);
    assert.equal(page.status, 200, p.slug);
    if (page.status !== 200) continue;
    const html = page.html;
    const name = p.content.en.name!;
    const esc = name.replace(/&/g, "&amp;");
    // One page title, one H1, own canonical; the menu's head is gone.
    assert.equal(html.match(/<title>/g)!.length, 1);
    assert.ok(
      html.includes(`<title>${esc} — Pastelerías 3L Dubai</title>`),
      p.slug,
    );
    assert.equal(html.match(/<h1/g)!.length, 1, p.slug);
    assert.ok(html.includes(`<h1>${esc}</h1>`), p.slug);
    assert.ok(
      html.includes(`<link rel="canonical" href="${ORIGIN}/menu/${p.slug}" />`),
    );
    assert.doesNotMatch(
      html,
      /Menu description|href="https:\/\/www\.3ldubai\.ae\/menu" \/>/,
    );
    assert.match(html, /<header>chrome<\/header>/);
    assert.match(html, /<footer>footer<\/footer>/);
    // Structured data: exactly the published SKUs, prices and availability.
    const ld = jsonLd(html);
    assert.equal(ld.length, 2, p.slug);
    const product = ld.find(
      (x) => x["@type"] === "Product" || x["@type"] === "ProductGroup",
    )!;
    assert.equal(
      product["@type"],
      p.options.length > 1 ? "ProductGroup" : "Product",
    );
    const offers = offersOf(product);
    assert.deepEqual(
      offers.map((o) => [o.sku, o.price, o.priceCurrency, o.availability]),
      p.options.map((o) => [
        o.id,
        (o.priceFils / 100).toFixed(2),
        "AED",
        availability(o),
      ]),
      p.slug,
    );
    assert.equal(
      ld.find((x) => x["@type"] === "BreadcrumbList")!
        .itemListElement instanceof Array,
      true,
    );
    assert.doesNotMatch(html, /"aggregateRating"|"review"|"gtin/);
    // Visible prices agree with the structured data.
    for (const o of p.options)
      assert.ok(
        html.includes(`<li data-sku="${o.id}">`) &&
          html.includes(`AED ${(o.priceFils / 100).toFixed(2)}`),
        o.id,
      );
    // Retired SKUs never appear.
    for (const sku of RETIRED_SKUS) assert.ok(!html.includes(`"${sku}"`), sku);
  }
});

test("packs offer only their fixed-price pack SKUs, never flavour combinations", () => {
  const { store } = setup();
  const catalog = storefrontCatalog(store.read());
  const packs = catalog.products.filter(
    (p) => catalog.families.find((f) => f.id === p.familyId)?.pack,
  );
  assert.ok(packs.length > 0);
  for (const p of packs) {
    const page = render(store.read(), p.slug);
    assert.equal(page.status, 200);
    if (page.status !== 200) continue;
    const offers = jsonLd(page.html).flatMap((x) =>
      x["@type"] === "Product" || x["@type"] === "ProductGroup"
        ? offersOf(x)
        : [],
    );
    assert.deepEqual(
      offers.map((o) => o.sku).sort(),
      p.options.map((o) => o.id).sort(),
    );
  }
});

test("drafts never show; publication updates the page and sitemap without a build", () => {
  const { store, payload, save, publish, cake } = setup();
  const target = cake();
  const before = render(store.read(), target.slug!);
  assert.equal(before.status, 200);
  const p = payload(target);
  const [priced] = p.variants;
  const oldPrice = priced!.priceFils;
  priced!.priceFils += 700;
  p.product.translations.en.name = "Draft Name Never Public";
  save(p);
  // Saved but unpublished: the public page and sitemap are unchanged.
  const draft = render(store.read(), target.slug!);
  assert.equal(
    draft.status === 200 && draft.html,
    before.status === 200 && before.html,
  );
  assert.ok(
    draft.status === 200 && !draft.html.includes("Draft Name Never Public"),
  );
  publish();
  const after = render(store.read(), target.slug!);
  assert.equal(after.status, 200);
  if (after.status !== 200) return;
  assert.ok(after.html.includes("<h1>Draft Name Never Public</h1>"));
  const sku = after.product.options.find((o) => o.id === priced!.skuId)!;
  assert.equal(sku.priceFils, oldPrice + 700);
  assert.ok(
    after.html.includes(`"price":"${((oldPrice + 700) / 100).toFixed(2)}"`),
  );
});

test("an archived product disappears: 410 for its URL and absent from the sitemap", () => {
  const { store, payload, save, publish, cake } = setup();
  const target = cake();
  const url = `${ORIGIN}/menu/${target.slug}`;
  assert.ok(
    productSitemapEntries(store.read(), ORIGIN)!.some((e) =>
      e.includes(`<loc>${url}</loc>`),
    ),
  );
  const p = payload(target);
  p.product.commercialState = "archived";
  for (const v of p.variants) v.commercialState = "archived";
  save(p);
  publish();
  const gone = render(store.read(), target.slug!);
  assert.equal(gone.status, 410);
  assert.ok(
    !productSitemapEntries(store.read(), ORIGIN)!.some((e) =>
      e.includes(`<loc>${url}</loc>`),
    ),
  );
  assert.equal(render(store.read(), "never-existed-product").status, 404);
});

test("missing or invalid published revision fails safely: 503, no product URLs", () => {
  const state = seed();
  state.catalog = structuredClone(sources.approved);
  assert.equal(render(state, "tres-leches--classic").status, 503);
  assert.equal(productSitemapEntries(state, ORIGIN), null);
  const broken = seed();
  broken.catalog = structuredClone(sources.approved);
  broken.catalogFoundation = planCatalogBootstrap(
    broken.catalog,
    sources,
  ).foundation;
  broken.catalog[0]!.priceFils += 1; // foundation no longer matches the commercial catalog
  assert.equal(render(broken, "tres-leches--classic").status, 503);
});

test("sitemap: published products only, no lastmod without a real publication date", () => {
  const { store } = setup();
  const catalog = storefrontCatalog(store.read());
  const entries = productSitemapEntries(store.read(), ORIGIN)!;
  assert.equal(entries.length, catalog.products.length);
  const xml = sitemapWithProducts(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://www.3ldubai.ae/</loc>\n  </url>\n</urlset>\n',
    entries,
  );
  assert.equal(xml.match(/<url>/g)!.length, catalog.products.length + 1);
  assert.ok(xml.trim().endsWith("</urlset>"));
  if (!catalog.publishedAt) assert.doesNotMatch(entries.join(""), /<lastmod>/);
  for (const e of entries)
    assert.match(e, /<loc>https:\/\/www\.3ldubai\.ae\/menu\/[a-z0-9-]+<\/loc>/);
});

test("slugs: one permanent path shape, parsed the same by server and browser", () => {
  for (const slug of [
    "tres-leches--classic",
    "carrot-cake",
    "conchas-filled--pistache",
  ]) {
    assert.ok(PRODUCT_PATH.test(`/menu/${slug}`), slug);
    assert.equal(productSlugFromPath(`/menu/${slug}`), slug);
  }
  for (const path of [
    "/menu",
    "/menu/",
    "/menu/A",
    "/menu/a/b",
    "/menu/-x",
    "/menu/x-",
    "/menu/x%20y",
    "/menu/../terms",
  ]) {
    assert.equal(PRODUCT_PATH.test(path), false, path);
    if (path !== "/menu/") assert.equal(productSlugFromPath(path), null, path);
  }
  const { store } = setup();
  const slugs = storefrontCatalog(store.read()).products.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slugs are unique");
  for (const slug of slugs) assert.ok(PRODUCT_PATH.test(`/menu/${slug}`), slug);
});

test("product text is escaped in HTML and cannot close the JSON-LD script", () => {
  const { store, payload, save, publish, cake } = setup();
  const p = payload(cake());
  p.product.translations.en.name = `Cake <script>alert(1)</script> & "quotes"`;
  save(p);
  publish();
  const page = render(store.read(), p.product.slug!);
  assert.equal(page.status, 200);
  if (page.status !== 200) return;
  assert.doesNotMatch(page.html, /<script>alert/);
  assert.match(
    page.html,
    /Cake &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;quotes&quot;/,
  );
  for (const ld of jsonLd(page.html)) assert.ok(ld["@type"]);
});

// ---- Compiled server: real routes, headers and redirects --------------------
const built = existsSync("dist/client/menu.html");
const PORT = 3413;
const get = (path: string) =>
  new Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: PORT, path }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => (body += c));
      res.on("end", () =>
        resolve({ status: res.statusCode!, headers: res.headers, body }),
      );
    });
    req.on("error", reject);
    req.end();
  });
async function withServer(
  env: Record<string, string>,
  fn: () => Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), "seo-products-"));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/storefront-dynamic-server.ts"],
    {
      env: {
        ...process.env,
        DB_PATH: join(dir, "state.sqlite"),
        PORT: String(PORT),
        API_PORT: String(PORT),
        APP_ORIGIN: `http://127.0.0.1:${PORT}`,
        ...env,
      },
      stdio: "ignore",
    },
  );
  try {
    for (let i = 0; i < 150; i++) {
      try {
        if ((await get("/api/health")).status === 200) break;
      } catch {
        /* starting */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    await fn();
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 200));
    rmSync(dir, { recursive: true, force: true });
  }
}

test(
  "server: product pages, live sitemap, legacy links and private routes",
  { skip: !built && "run npm run build first" },
  async () => {
    await withServer({}, async () => {
      const catalog = JSON.parse(
        (await get("/api/storefront/catalog")).body,
      ) as ReturnType<typeof storefrontCatalog>;
      const product = catalog.products.find((p) => p.options.length > 1)!;
      const page = await get(`/menu/${product.slug}`);
      assert.equal(page.status, 200);
      assert.match(String(page.headers["content-type"]), /text\/html/);
      assert.equal(page.headers["cache-control"], "no-cache");
      assert.match(page.body, /<html data-catalog="dynamic"/);
      assert.ok(
        page.body.includes(
          `<link rel="canonical" href="https://www.3ldubai.ae/menu/${product.slug}" />`,
        ),
      );
      for (const o of product.options)
        assert.ok(
          page.body.includes(`"price":"${(o.priceFils / 100).toFixed(2)}"`),
          o.id,
        );
      // The same build's approved header and footer, and the app bundle.
      assert.match(
        page.body,
        /<script type="module" crossorigin src="\/assets\//,
      );
      assert.match(page.body, /<footer/);
      // Live sitemap: the built public pages plus every published product.
      const sitemap = await get("/sitemap.xml");
      assert.equal(sitemap.status, 200);
      assert.ok(
        sitemap.body.includes("<loc>https://www.3ldubai.ae/terms</loc>"),
      );
      assert.equal(
        (sitemap.body.match(/\/menu\/[a-z0-9-]+<\/loc>/g) ?? []).length,
        catalog.products.length,
      );
      // Old links move to the permanent URL; unknown and slashed paths behave.
      const legacy = await get(`/menu?product=${product.slug}`);
      assert.equal(legacy.status, 301);
      assert.equal(legacy.headers.location, `/menu/${product.slug}`);
      assert.equal(
        (await get(`/menu/${product.slug}/`)).headers.location,
        `/menu/${product.slug}`,
      );
      const missing = await get("/menu/not-a-real-product");
      assert.equal(missing.status, 404);
      assert.match(String(missing.headers["x-robots-tag"]), /noindex/);
      assert.match(
        missing.body,
        /<main id="main-content">/,
        "a usable menu shell, not a JSON error",
      );
      // Private pages stay private; checkout and the menu still answer.
      for (const path of ["/cart", "/checkout", "/operations/orders"])
        assert.match(
          String((await get(path)).headers["x-robots-tag"]),
          /noindex/,
          path,
        );
      assert.equal((await get("/menu")).status, 200);
      assert.equal((await get("/api/checkout/config")).status, 200);
    });
  },
);

test(
  "server: without a published revision, product URLs answer 503 and the sitemap stays static",
  { skip: !built && "run npm run build first" },
  async () => {
    await withServer({ FIXTURE_FOUNDATION: "absent" }, async () => {
      const page = await get("/menu/tres-leches--classic");
      assert.equal(page.status, 503);
      assert.equal(page.headers["retry-after"], "30");
      assert.match(String(page.headers["x-robots-tag"]), /noindex/);
      const sitemap = await get("/sitemap.xml");
      assert.equal(sitemap.status, 200);
      assert.equal(
        sitemap.body,
        readFileSync("dist/client/sitemap.xml", "utf8"),
      );
    });
  },
);
