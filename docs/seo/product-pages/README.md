# Indexable product pages · `/menu/<slug>` (3L-SEO-AEO-002 Track B)

**Merge after Codex #31 (Pack Builder).** This branch touches files #31 also changes: `src/brand/MenuCatalog.tsx` (1 line), `src/brand/menu.ts`, `src/brand/Root.tsx` (1 line) and `server/http.ts` (one block before static serving). Rebase on `main` once #31 merges, then re-run the gates below.

## Behaviour

| Request                                   | Dynamic catalog ON (Production)                  | Dynamic catalog OFF          |
| ----------------------------------------- | ------------------------------------------------ | ---------------------------- |
| `/menu/<published slug>`                  | **200** server-rendered product page             | 404 (no published authority) |
| `/menu/<slug no longer sold>`             | **410** + `noindex`, menu shell                  | 404                          |
| `/menu/<unknown slug>`                    | **404** + `noindex`, menu shell                  | 404                          |
| any product URL, revision missing/invalid | **503** + `Retry-After: 30` + `noindex`          | 404                          |
| `/menu?product=<slug>`                    | **301** → `/menu/<slug>`                         | unchanged (client view)      |
| `/menu/<slug>/`                           | 301 → `/menu/<slug>` (PR #24 rule)               | same                         |
| `/sitemap.xml`                            | built public pages **+ every published product** | built file                   |

Source of truth: `storefrontCatalog(state)`, the exact projection behind `GET /api/storefront/catalog` (published Catalog Foundation revision, `State.catalog` prices, retired-SKU and seasonal rules). No Product Hub draft, build-time catalog or client value is read. A publication changes the page and sitemap on the next request, without a build (`Cache-Control: no-cache`).

## What the page contains

- Head: `<title>{EN name} — Pastelerías 3L Dubai</title>`, factual meta description (name, category, option count, published AED price range, "Order online for delivery or pickup in Dubai"), self canonical, Open Graph image = the product's published photograph.
- Body (no JavaScript needed): H1 product name, approved photograph with its published alt text, category, published description **only if one exists** (none of the 74 live products has one yet), options with AED price and availability, links to how-to-order, delivery policy, full menu and up to 12 products of the same family. Header and footer are the build's prerendered `/menu` chrome.
- JSON-LD: `Product` + `Offer` for one option; `ProductGroup` (`productGroupID`, `variesBy: size`, `hasVariant` → `Product` + `Offer` per SKU) for several. `price`, `priceCurrency: AED`, `availability` (InStock / OutOfStock from the same rules checkout uses), brand, image, seller → `#business`. No GTIN, rating or review. `BreadcrumbList` Home › Menu › product.
- Packs: only the published fixed-price pack SKUs are offers; no flavour combination gets a page or an offer.
- With JavaScript the existing interactive product view (options, quantity, add to cart) renders on top, as `/menu?product=` did. Menu links now point to `/menu/<slug>`.

## Evidence (this branch, local, synthetic data)

`tests/commerce/seo-product-pages.test.ts` — 10 tests:

1. Every published product: one title, one H1, own canonical, menu head removed, JSON-LD SKUs/prices/availability equal to the catalog, visible prices match, no retired SKU.
2. Packs: offers equal the pack's fixed-price SKUs.
3. A saved draft changes nothing public; after publish the H1 and price update without a build.
4. Archived product → 410 and removed from the sitemap; never-existing slug → 404.
5. Missing revision, or foundation not matching the commercial catalog → 503, no product URLs.
6. Sitemap lists published products only; no `lastmod` while `publishedAt` is null.
7. Slug shape shared by server and browser (including `--`), unique slugs.
8. Product text is escaped in HTML and cannot close the JSON-LD script.
9. Compiled server: 200 page with dynamic marker and prices, live sitemap count, legacy 301, slash 301, 404 menu shell with `noindex`, private routes still `noindex`, `/menu` and checkout config still 200.
10. Compiled server without a foundation: 503 + `Retry-After` + `noindex`; sitemap equals the built file.

Browser (Chromium + WebKit, 390 and 1440 px, `storefront-dynamic-server` fixture): no-JS page shows H1, 3 options and AED price; with JS the interactive view renders, add-to-cart works (`CART (1)`), no console errors, no horizontal overflow; ES and AR pack pages keep `lang`/`dir` (`rtl`); `/menu?product=` lands on `/menu/<slug>`; 20 menu links use the new URL; click-through and Back work. Screenshots: `no-js-1440.png`, `product-390.png`, `product-1440.png`, `pack-es-390.png`, `pack-ar-390.png`.

## Known limits

- After JavaScript renders, the page H1 is the menu page's "Menu"; the product name is in the interactive card. The server HTML (what non-rendering crawlers and the first paint see) has the product H1. Making the interactive view use the product name as H1 is a `MenuCatalog.tsx` change for after #31.
- Product descriptions are empty in the published catalog; pages show name, photo, options and prices only until approved descriptions are published in Product Hub.
- English-only documents; no `hreflang` until ES/AR documents exist (see Track A plan, section 8).
- `lastmod` needs a real `publishedAt` on publication (currently `null` live).
