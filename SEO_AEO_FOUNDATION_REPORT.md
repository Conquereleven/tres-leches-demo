# SEO & AEO foundation — Pastelerías 3L Dubai

Agent A1 · branch `feat/3l-seo-aeo-foundation` · base `main` @ `def0c1f` · 13 October 2026

Scope: technical SEO/AEO that does not depend on Product Hub activation. Nothing here
was deployed, merged or run against Production data. Live checks were plain `curl`
GET/HEAD requests only.

No search engine or AI assistant is obliged to crawl, index, rank, quote or show any of
this. The work removes technical obstacles and states verified facts in a
machine-readable way; it does not guarantee visibility.

---

## 1. Current state (evidence)

### 1.1 Production origin

- The canonical origin configured in the repository is **`https://www.3ldubai.ae`**
  (`docs/order-experience/rc1-release-plan.md`: "`APP_ORIGIN` — keep
  `https://www.3ldubai.ae`"; `docs/checkout/paymennt-web-test.md`). The brief mentioned
  `www.3lpastelerias.ae`: that hostname does not appear anywhere in the repository and
  does not answer (`curl` → no connection).
- `GET https://www.3ldubai.ae/api/health` → `{"environment":"production","mode":"live","revision":"def0c1f8…"}`:
  Production runs exactly `main`, and its bundle names match a local build of `main`
  (`index-NoR7xVQe.js`, `index-CCWL1fKP.css`). Local findings therefore describe what is live.
- `https://tres-leches-pasteleria-demo-production.up.railway.app/` serves the same site with `200`.
- `https://tres-leches-pasteleria-demo-paymennt-test.up.railway.app/` reports `environment: staging` and is publicly reachable.

### 1.2 Live status codes (before this branch)

| Request (`https://www.3ldubai.ae`)                                     | Status | Type | Note                                                                                     |
| ---------------------------------------------------------------------- | ------ | ---- | ---------------------------------------------------------------------------------------- |
| `/`                                                                    | 200    | html | 79,781 bytes, prerendered home                                                           |
| `/menu`, `/how-to-order`                                               | 200    | html | **same 79,781 bytes as `/`** (home content, home title)                                  |
| `/cart`, `/checkout`, `/checkout/return`                               | 200    | html | same home document, no `noindex`                                                         |
| `/operations/inbox`, `/operations/orders`, `/operations/orders/TL-1`   | 200    | html | same home document, **no `noindex`, no `X-Robots-Tag`**                                  |
| `/operations`, `/admin`                                                | 308    | —    | → `/operations/inbox`                                                                    |
| `/terms`, `/privacy`, `/refund-policy`, `/delivery-policy`, `/contact` | 200    | html | own prerendered content and title                                                        |
| `/contact/`                                                            | 200    | html | duplicate of `/contact`                                                                  |
| `/menu/`                                                               | 404    | json | inconsistent with `/contact/`                                                            |
| `/?lang=es`, `/?lang=ar`, `/menu?lang=es`                              | 200    | html | byte-identical English document (language is applied in the browser)                     |
| `/index.html`, `/terms.html`                                           | 200    | html | duplicates of `/` and `/terms`                                                           |
| `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/favicon.ico`             | 404    | json | none exists                                                                              |
| `/does-not-exist`, `/menu/pan-de-muerto`, `/.env`                      | 404    | json | real 404 (good); body is JSON `{"code":"INTERNAL_ERROR","message":"Ruta no encontrada"}` |
| `/api/health`                                                          | 200    | json |                                                                                          |
| `/api/workspace`                                                       | 401    | json | private data needs a session (good)                                                      |
| `/api/storefront/catalog`                                              | 404    | json | dynamic catalog adoption is off, as documented                                           |
| `/api/checkout/config`                                                 | 200    | json | 49 KB; the menu needs it to render                                                       |
| `http://www.3ldubai.ae/menu`                                           | 301    | —    | → `https://www.3ldubai.ae/menu` (good)                                                   |
| `http://3ldubai.ae/`                                                   | 200    | html | **"AEserver Parking Page"** (Apache, 5,675 bytes)                                        |
| `https://3ldubai.ae/…`                                                 | —      | —    | **no TLS connection**                                                                    |

DNS: `www.3ldubai.ae` → CNAME `agpvjymd.up.railway.app`; bare `3ldubai.ae` → `165.22.30.248`
(registrar parking host). The apex→www redirect implemented in `server/http.ts` and tested in
`tests/commerce/canonical-host.test.ts` is correct but **never runs**, because the bare domain
does not point at the application.

Response headers on `/` (live): CSP, `X-Content-Type-Options`, `Referrer-Policy`; **no
`Cache-Control`, `ETag` or `Last-Modified` on any static file**, including the content-hashed
bundles. The Railway edge applies gzip (`index-NoR7xVQe.js` 389 KB, CSS 31 KB over the wire).

### 1.3 What a crawler without JavaScript received (before)

- `/`: complete home page: one `<h1>` ("Soaked in Tradition."), six `<h2>`, story, ten ordering
  steps, the founder text, footer with legal entity, address and three phone numbers, 38 real
  `<a href>` links (menu, category filters, policies, contact, `tel:`, WhatsApp). Good.
- Policy and contact pages: complete own content and title — but **every one carried the home
  page's meta description and `og:description`**. `scripts/prerender-brand.mjs` replaced the
  description with a single-line regular expression while `index.html` formats that tag over
  several lines, so the replacement silently never matched.
- `/menu`, `/how-to-order`, `/cart`, `/checkout`, `/operations/*`: **the home page** (title,
  description, `<h1>` and body), i.e. up to nine extra URLs duplicating `/`.
- No canonical URL, no `og:url`/`og:image`/`og:type`, no Twitter card, no JSON-LD, no hreflang anywhere.
- `<html lang="en">` present. Language is client-side only (`?lang=` or `localStorage`,
  `src/brand/localization.tsx`): the server always sends English.
- Menu, product details, prices: rendered in the browser only (documented in
  `docs/product-hub/storefront-dynamic-catalog.md`, "Without JavaScript … the menu needs JavaScript").

### 1.4 Internal links

Navigation, footer, category tiles and policy links are real anchors. Buttons are used only for
actions (language, dialogs, video, "Gestión" → Operations, which is therefore not a crawlable
link — good). Category and product views are query strings (`/menu?category=jars`,
`/menu?product=<slug>`) resolved in the browser: they are filters of one document, not pages.

---

## 2. Findings by severity

| #   | Severity | Finding                                                                                                                                                                                                                                    | Status                                                                 |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| F1  | High     | Bare domain `3ldubai.ae` shows a registrar parking page over HTTP and has no HTTPS. Anyone typing or linking the bare domain does not reach the shop; link equity is not consolidated.                                                     | **Owner/DNS action** (§6)                                              |
| F2  | High     | No canonical URL while the same content answers on `www.3ldubai.ae`, the Railway hostname, `/index.html`, `/x.html`, trailing-slash and `?lang=`/`?category=` variants.                                                                    | **Fixed** (canonical per page)                                         |
| F3  | High     | `/menu` and `/how-to-order` served the home document (title, description, body) to crawlers.                                                                                                                                               | **Fixed** (own documents)                                              |
| F4  | High     | Operations, cart and checkout answered `200` with indexable home content and no `noindex`.                                                                                                                                                 | **Fixed** (`X-Robots-Tag`)                                             |
| F5  | High     | The public staging host is indexable and duplicates the shop.                                                                                                                                                                              | **Fixed** (whole non-production deployments `noindex`)                 |
| F6  | Medium   | No `robots.txt`, no `sitemap.xml`.                                                                                                                                                                                                         | **Fixed** (generated at build)                                         |
| F7  | Medium   | All policy/contact pages carried the home description (silent regex bug).                                                                                                                                                                  | **Fixed** + test                                                       |
| F8  | Medium   | No structured data for the business.                                                                                                                                                                                                       | **Fixed** (`Bakery`, `WebSite`, `BreadcrumbList`, verified facts only) |
| F9  | Medium   | No `og:url`, `og:image`, `og:type`, Twitter card; `og:description` was the slogan on every page.                                                                                                                                           | **Fixed**; proper 1200×630 image is an owner input                     |
| F10 | Medium   | `/menu/` → 404 while `/contact/` → 200 duplicate.                                                                                                                                                                                          | **Fixed** (301 to the slash-less URL)                                  |
| F11 | Medium   | One 1.43 MB JavaScript bundle (387 KB gzip) for every public page, including the whole Operations workspace; the prerendered DOM is discarded and re-rendered (`createRoot`), so on slow devices the largest paint waits for the bundle.   | **Proposed** (§5.1)                                                    |
| F12 | Medium   | Spanish and Arabic exist only after JavaScript runs; there is no URL a crawler can fetch in ES/AR, so hreflang cannot be declared honestly.                                                                                                | **Proposed** (§5.2)                                                    |
| F13 | Medium   | No product URLs: products are `?product=` views of `/menu`.                                                                                                                                                                                | **Architecture** (§7), Product Hub dependency                          |
| F14 | Low      | No caching headers on static files.                                                                                                                                                                                                        | **Partly fixed** (hashed bundles immutable); rest proposed             |
| F15 | Low      | 404 for a page is JSON with code `INTERNAL_ERROR` in Spanish. Correct status, poor for a person.                                                                                                                                           | Proposed (UX)                                                          |
| F16 | Low      | Home preloads a 196 KB below-the-fold SVG (`editorial-journey.svg`) and a 327 KB WebP (`editorial-mexico-dubai.webp`) competes early.                                                                                                      | Proposed (§5.4)                                                        |
| F17 | Low      | 14 of 26 home images have no `width`/`height`. Measured layout shift is nevertheless ≤ 0.03, so no change was made to approved markup.                                                                                                     | No action                                                              |
| F18 | Info     | `document.title` and `<html lang>` follow the language only on policy pages / after script; `/favicon.ico` is 404 (the PNG `<link rel="icon">` is present, 410×410 — not a multiple of 48 px as Google recommends for the search favicon). | Proposed                                                               |

Not a defect: CLS (0–0.03), self-hosted fonts with `font-display: swap` and a preloaded display
font, `preload="none"` hero video with a 30–50 KB WebP poster, AVIF/WebP product images with
`srcset`, alt text on all 26 home images, single `<h1>` per page, real 404s for unknown URLs.

---

## 3. Implemented

All changes are small, covered by tests and independent of the catalog.

| File                               | Change                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/seo.ts` (new)              | Pure rules: canonical origin, private-path test, `X-Robots-Tag` decision, trailing-slash redirect target, head tags (title, description, canonical, Open Graph, Twitter, JSON-LD with safe escaping), `robots.txt`, `sitemap.xml`. No brand or catalog imports.                                                                                                                                           |
| `src/seo/pages.ts` (new)           | The list of indexable pages and their metadata; `Bakery`, `WebSite` and `BreadcrumbList` JSON-LD built from `src/brand/business.ts` and `content.ts`. Missing facts are omitted.                                                                                                                                                                                                                          |
| `src/seo/MenuShell.tsx` (new)      | What `/menu` serves before JavaScript: the existing header, the existing "Menu" heading and watermark, the existing footer. **No product, price or availability.**                                                                                                                                                                                                                                        |
| `scripts/prerender-brand.mjs`      | Writes a complete head for all 8 public pages, prerenders `/menu` (shell) and `/how-to-order` (its approved steps), writes `dist/client/robots.txt` and `sitemap.xml`. Fixes the description bug (F7).                                                                                                                                                                                                    |
| `server/http.ts`                   | `X-Robots-Tag: noindex, nofollow` on `/operations*`, `/cart`, `/checkout*`; `noindex` on every JSON answer; whole deployment `noindex` when the validated runtime environment is `test`, `development` or `staging`. 301 from trailing-slash page URLs. `/menu` and `/how-to-order` serve their own file. `.txt`/`.xml` content types. `Cache-Control: immutable` for content-hashed `/assets/*-<hash>.js | css` only. |
| `tests/commerce/seo.test.ts` (new) | 10 tests: indexing rules, redirect safety (no open redirect), unique title/description/canonical per page, escaping, structured data contains only verified facts and none of `openingHours`/`aggregateRating`/`review`/`priceRange`/`geo`/`Product`/`Offer`/`FAQPage`, robots and sitemap content, immutable-asset rule, built files, and a real server (status codes, headers, redirects).              |

Not touched: Product Hub, `server/catalog/**`, `docs/product-hub/**`, checkout/cart/payment
code, any CSS, any customer copy, the Sites worker, dependencies.

### 3.1 Decisions worth knowing

- **Canonical origin is a constant** (`SITE_ORIGIN = https://www.3ldubai.ae`) baked into static
  HTML at build time, so every other host that serves the build points to the real site. If the
  production domain ever changes, change that one constant. Canonical is a strong hint, not a command.
- **`robots.txt` allows everything, including `/api/`.** The menu is rendered in the browser from
  `/api/checkout/config`; disallowing `/api/` would hide the menu from crawlers that execute
  JavaScript. Private pages are excluded with `X-Robots-Tag` instead; a crawler can only obey that
  header if it is allowed to fetch the page, which is why Operations is not also disallowed.
  Operations pages contain no data without a session (`/api/workspace` → 401).
- **`?lang=`, `?category=`, `?product=` canonicalise to the clean URL**, because the server sends
  the same English document for all of them.
- **`og:image` is the official square mark** (`/brand/icon.png`, 410×410, `twitter:card: summary`).
  No landscape social image exists in the repository; none was created.
- **JSON-LD includes**: trading name, legal name, the confirmed address (only split into street /
  city / country), Dubai as area served, AED, Visa/Mastercard, the three published support
  contacts, Instagram. **It omits** opening hours, coordinates, price range, founding date of the
  Dubai business, email, a primary `telephone`, ratings and reviews — none is confirmed in the repo.
- **No `FAQPage`**: the footer "FAQ" is a button opening a dialog; there is no approved Q&A content.
  **No `HowTo`**: Google retired that rich result; the ordered list on `/how-to-order` is already clean HTML.
- **`/how-to-order` prerender** shows the address step in the "manual review" wording, which is
  what Production (legacy address mode) shows. If Production moves to verified addresses the
  browser already switches the sentence; the static text would then differ for no-JS readers only.
- **Visible effect**: before JavaScript loads, `/menu` now shows header + "Menu" + footer instead
  of a flash of the home page; `/how-to-order` shows its steps. After load both are unchanged.

### 3.2 After this branch (local production build, test fixture server)

| Request                                       | Status    | Notes                                                                |
| --------------------------------------------- | --------- | -------------------------------------------------------------------- |
| `/`, `/menu`, `/how-to-order`, 5 policy pages | 200       | own title, description, canonical, OG/Twitter, JSON-LD               |
| `/menu?category=jars&lang=es`                 | 200       | canonical `https://www.3ldubai.ae/menu`                              |
| `/menu/`, `/contact/`                         | 301       | → `/menu`, `/contact` (query kept)                                   |
| `/robots.txt`                                 | 200       | `text/plain`                                                         |
| `/sitemap.xml`                                | 200       | `application/xml`, 8 URLs, `lastmod` 2026-09-22 on policy pages only |
| `/operations/inbox`, `/cart`, `/checkout`     | 200       | `X-Robots-Tag: noindex, nofollow`; body and behaviour unchanged      |
| `/api/health`, `/no-such`                     | 200 / 404 | `X-Robots-Tag: noindex`                                              |
| `/assets/index-<hash>.js`                     | 200       | `Cache-Control: public, max-age=31536000, immutable`                 |

The fixture runs as environment `test`, so it also answers `noindex` on public pages; the
production rule (public pages carry no `X-Robots-Tag`) is asserted on the pure function.

---

## 4. Core Web Vitals — lab measurements

**Method.** Production build of this branch served by the repository's test fixture server on
`127.0.0.1:3410`; Chromium from the existing `@playwright/test`; `PerformanceObserver` for LCP,
layout shift and long tasks; one cold load per page. Mobile profile: 390×844, DPR 3, CPU ×4,
1.6 Mbit/s down, 150 ms latency. Desktop: 1440×900, no throttling. Lighthouse is not installed
and was not added.

**Caveats.** These are single lab runs, not field data (no CrUX/Search Console access). The
local server does **not compress**, while Production's edge does (JS 389 KB instead of 1,399 KB):
throttled mobile timings below overstate transfer time by several seconds. INP cannot be measured
without real interaction. Treat the numbers as relative, and the causes as the finding.

| Profile | Page            | FCP (ms) | LCP (ms) | LCP element                         | CLS   | Long-task time >50 ms | Transfer |
| ------- | --------------- | -------- | -------- | ----------------------------------- | ----- | --------------------- | -------- |
| Mobile  | `/`             | 4300     | 4300     | hero video poster (WebP, 49 KB)     | 0     | 192 ms                | 2.6 MB   |
| Mobile  | `/menu`         | 2452     | 9628     | first product image (AVIF)          | 0     | 278 ms                | 1.8 MB   |
| Mobile  | `/how-to-order` | 2472     | 8732     | list text, re-rendered after script | 0.028 | 180 ms                | 1.7 MB   |
| Mobile  | `/contact`      | 2368     | 8716     | intro paragraph, re-rendered        | 0.014 | 129 ms                | 1.7 MB   |
| Desktop | `/`             | 228      | 264      | hero video poster                   | 0.001 | 62 ms                 | 2.6 MB   |
| Desktop | `/menu`         | 36       | 112      | menu watermark                      | 0.001 | 0                     | 2.0 MB   |
| Desktop | `/how-to-order` | 40       | 104      | `<h1>`                              | 0.010 | 0                     | 1.7 MB   |
| Desktop | `/contact`      | 36       | 100      | `<h1>`                              | 0.010 | 0                     | 1.7 MB   |

Weights (uncompressed / gzip): JS 1,432 KB / 387 KB in one chunk; CSS 179 KB / 31 KB
(render-blocking); fonts 16 KB + 36 KB WOFF2, self-hosted, `swap`; home images ≈ 0.9 MB on first
view, of which `editorial-mexico-dubai.webp` 327 KB and `editorial-journey.svg` 196 KB; hero
video `preload="none"` (0 bytes until played). No console or CSP errors on any page; JSON-LD is
parsed (2 blocks on home, 1 elsewhere).

**Reading.** CLS is good everywhere. On desktop everything is fast. On a slow phone the first
paint of text pages comes from the prerendered HTML (~2.4 s here, dominated by the uncompressed
CSS), but the _largest_ paint is recorded only after the whole bundle has downloaded and React has
replaced the prerendered DOM. The bundle is the LCP bottleneck on text pages and on the menu.

---

## 5. Proposed, not implemented

### 5.1 JavaScript weight and hydration (highest performance value)

- Load Operations with a dynamic `import()` in `src/brand/Root.tsx`, so customers do not download
  the workspace. Split the checkout pages the same way.
- Use `hydrateRoot` on prerendered routes instead of `createRoot`, so the prerendered paint is the
  final paint.

Not implemented: both change how Operations and checkout boot and need the Operations, checkout
and brand Playwright suites, which belong to other teams and were out of bounds here. Hydration
additionally requires the server HTML and the first client render to match exactly (language from
`localStorage`, checkout config, dynamic-catalog mark).

### 5.2 Languages and hreflang

Today ES/AR have no fetchable URL. Declaring `hreflang` for `?lang=es` would point crawlers at an
English document, so none was added. Proposal: language as a path prefix (`/es/…`, `/ar/…`, English
unprefixed), prerendered per language from the existing locale resources (the i18n audit already
guarantees coverage), each with `lang`/`dir`, self canonical, reciprocal `hreflang` plus
`x-default`. Needs routing changes in `Root.tsx`, the language switcher and every internal link,
and Lisa's approval of indexable Spanish/Arabic copy. Catalog strings must come from the published
revision's translations only (§7).

### 5.3 Caching and compression

`/brand/*` media is unversioned, so a long cache would delay photo replacements; give those files
`ETag`/`Last-Modified` with revalidation (or version their names) and HTML `Cache-Control: no-cache`.
Compression currently depends on the Railway edge; keep it there or pre-compress at build.

### 5.4 Small page-weight items (storefront team)

`loading="lazy"` on the below-the-fold `editorial-journey.svg` (React preloads it today), a lighter
`editorial-mexico-dubai.webp` (327 KB) with `srcset`, explicit `width`/`height` on the 14 editorial
images, optimised 196 KB SVG. All touch approved artwork in `Experience.tsx`.

### 5.5 Answer-style content (AEO)

Assistants and search snippets favour short factual statements in plain HTML. The verified facts
already in the repo could be presented as an approved FAQ page (then, and only then, `FAQPage`
markup): delivery areas and minimum orders per band (`deliveryBands`), free delivery for JLT
clusters A–D, ordering cut-off (21:00 Dubai for next day), time windows (8 AM–1 PM, 1–4 PM,
4–9 PM), 12 h / 24 h notice rules, cancellation up to 12 h before with a 90 % refund, pickup at
3L Pastelerías, payment by Visa/Mastercard through Paymennt. This is new customer copy in three
languages and needs owner approval; it was not written here.

### 5.6 `llms.txt` (optional)

A short `/llms.txt` listing the public pages and the same verified facts is cheap to generate from
`src/seo/pages.ts`. It is an informal proposal, not a standard; there is no evidence that major
assistants read it. Low cost, uncertain benefit; do it only if the owner wants it.

### 5.7 Other

- Friendly HTML 404 page for page URLs (keep the 404 status).
- A 48 px-multiple favicon (e.g. 96×96 or 192×192) and `/favicon.ico`.
- Per-language `document.title` on `/menu`, `/how-to-order` and home.
- Decide whether the Railway hostname should redirect to the canonical host. Not done in code:
  a wrong host comparison behind a proxy could take the site down or break health checks.
- After deployment: register `https://www.3ldubai.ae` in Google Search Console and Bing Webmaster
  Tools, submit `/sitemap.xml`, validate the home page in the Rich Results Test, and create/claim
  the Google Business Profile with exactly the same name, address and phone as the site.

---

## 6. Owner inputs needed

| Input                                                                                                                                                 | Unlocks                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **DNS for bare `3ldubai.ae`** → the Railway service (plus certificate), replacing the AEserver parking page                                           | The tested apex→www 301 starts working (F1)    |
| Opening / support hours (`business.supportHours`), delivery hours                                                                                     | `openingHoursSpecification`; currently omitted |
| Which phone is the public business number                                                                                                             | top-level `telephone` in JSON-LD               |
| Customer-service email (`business.email`)                                                                                                             | `email` in JSON-LD and contact page            |
| Map location (coordinates or Google Maps place URL)                                                                                                   | `geo` / `hasMap`                               |
| Approved 1200×630 social sharing image                                                                                                                | large link previews (`summary_large_image`)    |
| Google Business Profile ownership and URL; any other official profiles                                                                                | `sameAs`, local results                        |
| Whether the Dubai business has its own founding date ("1982" is the Mexico City heritage)                                                             | `foundingDate`                                 |
| Policy on AI crawlers (allow all — current default — or block training bots such as GPTBot, Google-Extended, CCBot while allowing search/answer bots) | `robots.txt` rules                             |
| Approval of an FAQ page and of indexable Spanish/Arabic pages                                                                                         | §5.2, §5.5                                     |
| Remaining pending facts already listed by the build: `issueReportWindow`, `orderLeadTime`, `deliveryHours`, `failedDeliveryOutcome`                   | complete policy answers                        |
| Reviews: only real, attributable ones, displayed on the page                                                                                          | `Review`/`AggregateRating` — never fabricated  |

---

## 7. Future product pages — bound to the published catalog revision

Not implemented. Design only.

**Rule.** A product URL, its visible name, description, price, availability, image, translations
and its `Product`/`Offer` JSON-LD are all produced **per request from the same published
revision** that `GET /api/storefront/catalog` projects (`State.catalog` +
`State.catalogFoundation`). Never from `src/brand/menu-data.json`, `content.ts`, a build-time
snapshot, or a Product Hub draft. No second catalog.

1. **Gate.** Product pages exist only where dynamic adoption is on
   (`STOREFRONT_DYNAMIC_CATALOG_ENABLED`, plus `…_PRODUCTION=founder-approved` in Production).
   With adoption off the routes answer 404 and the sitemap lists no product.
2. **URL.** `/menu/<slug>` using the permanent published slug (Product Hub guarantees slugs never
   change). `/menu?product=<slug>` redirects (301) to it; `?category=` stays a filter canonicalised
   to `/menu` unless category pages are later approved.
3. **Rendering.** Server-side at request time from one exported, pure projection (the same one the
   API uses), inside the existing HTML shell. `ETag` = the API's revision+digest; `Cache-Control:
no-cache`, so a publication or a seasonal availability flip is visible on the next request with
   no rebuild — the same guarantee the menu has today.
4. **Status codes.** Published product with an active, non-removed variant → 200. Unknown slug → 404. Product deactivated or in `RETIRED_SKUS` → 404 (or 410) and dropped from the sitemap.
   Adoption on but no valid revision → 503 with `Retry-After` and no price in the body (mirrors
   "nothing is sold on information that cannot be verified").
5. **Structured data.** `Product` with one `Offer` per orderable variant: `price` from `priceFils`,
   `priceCurrency: AED`, `availability` from the projection's `available`/`orderable`
   (`InStock`/`OutOfStock`), `sku`, image from the published asset, `url`. Generated by the same
   function that renders the visible price, so they cannot disagree. No `AggregateRating` without
   real reviews. Pack prices are the stored pack prices, never computed.
6. **Sitemap.** `/sitemap.xml` becomes a server route: the static pages from `src/seo/pages.ts`
   plus one entry per published product, `lastmod` = the revision's `publishedAt`.
7. **Languages.** `hreflang` alternates are emitted only for languages whose name and description
   exist in the published revision; a "translation pending" product gets no alternate in that
   language. Nothing is machine-translated.
8. **Checkout stays the authority.** The page displays; the server still prices every quote and
   rejects a stale one. Structured data never feeds checkout.
9. **Tests to add then.** Publication changes price → HTML and JSON-LD change on next GET with the
   new `ETag`; unpublish → 404 and sitemap entry gone; no revision → 503 without price; draft
   content never appears; retired SKUs never appear.

### Product Hub dependencies (Codex team)

- Dynamic adoption active in Production (steps 1–6 of `storefront-dynamic-catalog.md`); until then
  no product page or Product/Offer markup may be published.
- An exported pure projection (revision → public catalog) in `server/catalog/` that a page route
  can call without HTTP; the route itself can live outside `server/catalog/**`.
- `publishedAt` and per-product change information for `lastmod`.
- Stable public image URLs and alt text for published assets (already `/brand/hub/<sha>.<ext>`).
- Client routing for product detail by path in `MenuCatalog.tsx` / `Shop.tsx` (not edited here).
- The homepage menu preview is authored and has no prices; it stays outside product markup.
- `/menu` prerender remains product-free by test (`tests/commerce/seo.test.ts`).

---

## 8. What cannot be guaranteed or was not verified

- That Google, Bing or any AI assistant will index, rank, quote or display these pages or the
  structured data, or how quickly. Canonical tags are hints; `noindex` is obeyed by major engines
  but not by every crawler.
- Current index status (which URLs are indexed today, whether Operations or staging URLs already
  appear). Requires Search Console; if they do, they drop out only after recrawl.
- Field Core Web Vitals and INP. Only lab runs were possible.
- Rich-result eligibility: the JSON-LD is syntactically valid and parsed by Chromium, but it was
  not run through Google's Rich Results Test (the pages are not deployed).
- How third-party previews (WhatsApp, iMessage, Instagram) render a 410×410 PNG.
- Behaviour on the static Sites worker: it serves the same files, but the header rules live in the
  Node server only (the worker is static-only and is not the production runtime).
- Playwright end-to-end suites were not run (fixed ports shared with other agents; none of the
  changed code is in the storefront hero). A Chromium load of `/`, `/menu`, `/how-to-order` and
  `/contact` on the built server showed correct rendering and no console errors.

## 9. Validation

Run in this worktree on the final tree (13 October 2026):

| Gate                     | Result                                                                    |
| ------------------------ | ------------------------------------------------------------------------- |
| `npm run typecheck`      | pass                                                                      |
| `npm run lint`           | pass                                                                      |
| `npm run build`          | pass (includes `audit:i18n` and `audit:customer-copy`)                    |
| `npm test`               | 582 tests, 582 pass, 0 fail, 0 skipped (10 new in `seo.test.ts`)          |
| `npm run test:sites`     | 4 tests, 4 pass                                                           |
| `npm run scan:secrets`   | 1330 files scanned, 0 findings                                            |
| `npm run test:e2e:build` | not run (known pre-existing failure on `main`; storefront hero untouched) |
