# Indexable product pages · `/menu/<slug>` (3L-SEO-AEO-002 Track B)

**Integration completed against main `8f5cc785fe408b0288a3b8403983787cf57721ec` (PR36 packs) and current Track A.** The sole textual conflict was the SEO import block in `server/http.ts`; both import lists were preserved. The lazy Operations route and `/menu/<slug>` routing were combined. No pack/cart/payment domain or catalog data was changed.

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

Storefront browser suites on this branch: storefront-dynamic 4/4, i18n 17/17, conchas 52/52, official-media 10/10, checkout 21/21. Menu suite 14/19: the same 5 tests fail identically on clean `main` (pack price expectations), so they are pre-existing and unrelated. The storefront-dynamic suite caught a real defect in this branch (the legacy redirect dropped `lang=`); fixed and covered by a unit assertion.

## Known limits

- Fixed: the page has one H1 — the product name — before and after JavaScript (`StorePages.tsx`; `tests/storefront-dynamic-e2e/product-page.spec.ts`).
- Product descriptions are empty in the published catalog; pages show name, photo, options and prices only until approved descriptions are published in Product Hub.
- English-only documents; no `hreflang` until ES/AR documents exist (see Track A plan, section 8).
- `lastmod` needs a real `publishedAt` on publication (currently `null` live).

## Final integration gate · 16 October 2026

- Real size offers now link to `/menu/<slug>?sku=<existing SKU>`, selecting only a matching option of that product. Canonical remains the parameter-free product URL. Invalid/cross-product SKU values cannot introduce an option. Pack composition is never a URL variant or a schema offer. The eight approved pack offers retain 60/115/72/140 and 100/190/120/235 AED. This meets Google's distinct variant-URL guidance: https://developers.google.com/search/docs/appearance/structured-data/product-variants#guidelines .
- Product Hub description regression covers private draft isolation and immediate published HTML/JSON-LD update; existing browser publication tests also check EN/ES/AR descriptions after hydration. No Production content was published.
- Local combined suite: 625/625 commerce/HTTP checks; typecheck/lint/build PASS; 14/14 SEO/dynamic-catalog/lazy-Operations Chromium/WebKit checks, including all eight size links and canonical consistency. Packs and checkout regression/CI evidence is reported with final PR SHAs.
- The old statements above about zero descriptions and null publication dates describe 15 October, not a requirement or fallback. Current Production facts are recorded in the final audit report. Server documents remain English and canonicalize language queries; ES/AR interactive behavior stays supported, with no fabricated hreflang.

## Two-step Production release (founder approval required)

1. Approve/merge PR33 first. Require current-head commerce, packs and SEO CI green. Record live deployment, published revision and flags; obtain a consistent private SQLite backup using the existing authorized release procedure and verify restore offline. Deploy only approved Track A; preserve all env vars/provider gates. Smoke health, www/cart/checkout, dynamic revision/prices, API noindex, alias redirects, media304 and Operations lazy load. No provider calls or catalog publication. Roll back code only to the recorded compatible snapshot-capable build if needed; never replace the current database with an old backup.
2. Refresh PR34 onto the resulting main, preserve the already tested Track A ancestry and re-run checks if the merge tree differs. Approve/merge/deploy Track B separately. Verify published-product SSR/description/canonical/JSON-LD/sitemap, eight fixed pack SKUs, all variant links, multilingual UI, cart/checkout and immutable history. Roll back to released Track A code if needed; keep SQLite/current catalog untouched. Sitemap submission requires verified Search Console/Bing access and is separate from code deploy. No Meta activation.

Apex remediation is separately authorized DNS work, not a silent part of either deploy. www product pages can ship while apex is awaiting DNS, but do not call domain-wide SEO finished until HTTPS apex redirects pass.
