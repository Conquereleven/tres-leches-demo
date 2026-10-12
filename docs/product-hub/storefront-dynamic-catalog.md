# Public storefront — dynamic catalog

Status: **implemented and tested in isolation; off by default; not active anywhere.**
Stacked on Product Hub V2 (PR #13). Activation in Production also needs the catalog
foundation initialized (PR C3, `foundation-bootstrap.md`) and founder approval.

## What changes when it is on

The menu page stops using the catalog shipped with the build and shows the **published
revision** from SQLite: categories, families, products, variants, prices, availability,
photographs and EN/ES/AR names. A publication in Product Hub reaches customers without a
rebuild or a deployment.

When it is off (the default, and today's Production) nothing changes: no new request is
made and the storefront behaves exactly as before.

## Authority

- `State.catalog` is still the only price and availability authority. The endpoint reads
  it together with `State.catalogFoundation`; it never reads a Product Hub draft.
- Prices in the browser are for display. The cart holds SKU ids and quantities only; the
  server prices every quote and checkout, rejects a checkout whose displayed quote is
  stale, and accepted orders keep their frozen amounts. None of that code changed.
- Seasonal rules (`availableSku`) and removed combinations (`RETIRED_SKUS`) are applied
  by the endpoint and again by checkout.

## Contract

`GET /api/storefront/catalog` — public, read-only, no session.

| Situation                             | Answer                                                     |
| ------------------------------------- | ---------------------------------------------------------- |
| Adoption off                          | `404` (the site ships its catalog with the build)          |
| Adoption on, valid published revision | `200`, whole catalog, three languages, `ETag`, `no-cache`  |
| Same revision and availability        | `304` to `If-None-Match`                                   |
| Adoption on, no valid revision        | `503` with `Retry-After`; never a fallback to bundled data |
| Any other method or sub-path          | `404`                                                      |

Body: `revision`, `publishedAt`, `categories`, `families`, `products` (id, slug, family,
category, `content` per language, `media`, `options` with SKU id, flavour, size, pack
quantity, `priceFils`, `available`, `orderable`), `assets` (versioned derivatives and alt
text). Only published products with at least one active, non-removed variant appear. No
draft, history, editor identity, publication state or internal fingerprint is exposed.

The `ETag` combines the revision id with a digest of the answer, so it also changes when
seasonal availability flips without a publication.

`GET /api/checkout/config` gains `catalog: { dynamic, revision }`. With adoption on and
no valid revision it returns `enabled: false` and no products, and every checkout route
answers `503`: nothing is sold on information that cannot be verified.

## Feature flag and activation contract

| Variable                                | Default | Effect                                                                 |
| --------------------------------------- | ------- | ---------------------------------------------------------------------- |
| `STOREFRONT_DYNAMIC_CATALOG_ENABLED`    | unset   | Turns adoption on in test, development and staging                     |
| `STOREFRONT_DYNAMIC_CATALOG_PRODUCTION` | unset   | Must be exactly `founder-approved` for the flag to count in Production |

Production is any environment whose `APP_ENV` is not `test`, `development` or `staging`.
Both variables are needed there; either alone leaves adoption off.

`CATALOG_READ_API_ENABLED` (the paginated read API from Sprint 1A) is unchanged and still
refused in Production. The storefront uses its own endpoint.

Product Hub publication in Production is now tied to this contract: it stays refused
until dynamic adoption is active there, because publishing before customers read
published data would show them stale prices.

## How the storefront adopts it

- The server marks every HTML page with `<html data-catalog="dynamic">` when adoption is
  on. The client knows before rendering, so the build's catalog is never flashed.
- `src/brand/live-catalog.ts` fetches the catalog, keeps the `ETag`, and revalidates when
  the tab regains focus or becomes visible and every 60 seconds.
- `src/brand/menu.ts` adapts the published catalog to the shapes the menu already uses
  (`useMenu`). Existing products keep their authored identity, so approved photography,
  crops and rotations render exactly as before.
- A photograph replaced in Product Hub is shown instead of the build's; an unchanged one
  keeps the approved presentation.
- Published translations take precedence for catalog strings; a name with no ES/AR
  translation shows the existing "translation pending" marker (Product Hub warns before
  publishing).
- While the first answer is pending the menu shows the existing loading text; with no
  valid revision it shows the existing "Online ordering is unavailable." and a retry.
  No new customer copy and no CSS was added.
- If the published catalog and the checkout configuration ever disagree about a price or
  about whether a size can be ordered (a publication between two requests), that card
  reloads both, once; the existing rule that blocks an option whose displayed price is
  not the server's stays in force, and a size the published catalog marks unavailable is
  never offered.

Files touched in the customer site: `MenuCatalog.tsx`, `menu.ts`, `localization.tsx`,
new `live-catalog.ts`. This branch is integrated on top of the storefront agent's merged
work (BRAND-02, PR #14): `cart.ts`, `Shop.tsx`, `media.tsx`, menu data, locale files and
all CSS are byte-identical to `main`, and BRAND-02's own guard test passes.

## Known limits (not hidden)

- **Cart thumbnails** (`Shop.tsx`) still use the build's photograph for a product whose
  photograph was replaced; the menu and product page show the new one.
- **Homepage menu preview** is authored editorial content (six fixed tiles, no prices)
  and does not come from the catalog.
- **New size or flavour wording** has no translation field in Product Hub yet; text the
  build does not know shows the "translation pending" marker in ES/AR.
- **Without JavaScript** the prerendered home and policy pages are readable; the menu
  needs JavaScript (as it does today for ordering).
- A category or family created only in Product Hub appears, with the published name;
  category banners remain those authored in the build.

## Tests

- `tests/commerce/storefront-catalog.test.ts` — flag and Production contract; public
  projection; publication reaching the storefront (name, translations, price, image,
  availability, deactivated and new products); concurrent publication; fail closed;
  checkout after publication and immutable accepted orders.
- `tests/commerce/storefront-catalog-http.test.ts` — real server: off, on, `ETag`/`304`,
  page mark, read-only, `503` and checkout refusing to sell.
- `tests/storefront-dynamic-e2e/publish.spec.ts` — Chromium and WebKit: an administrator
  edits name, Spanish name, price, availability and photograph in Product Hub and
  publishes; the already open storefront, a fresh visit in Spanish and Arabic, the cart
  created before the publication and the checkout configuration all show the published
  data, served by one build. Run with
  `npm run build && npx playwright test -c playwright.storefront-dynamic.config.ts`.

## Activation in Production — what is still missing

1. Merge PR #13 (Product Hub V2), PR C3 (foundation bootstrap) and this PR; deploy with
   every flag unset. No behaviour changes.
2. Resolve the 12 stored rows reported by the foundation audit and initialize the
   foundation in Production (`foundation-bootstrap.md`), each write approved.
3. (Done) The storefront agent's PR #14 is merged; this suite passes on the combined build.
4. Validate on staging with `STOREFRONT_DYNAMIC_CATALOG_ENABLED=true` and a real publication
   (Lisa's review of menu, Spanish and Arabic).
5. With founder approval set both storefront variables in Production; confirm
   `/api/checkout/config` reports `catalog.dynamic: true` with a revision.
6. Only then `PRODUCT_HUB_PUBLISH_ENABLED=true` in Production.

## Rollback

Unset `STOREFRONT_DYNAMIC_CATALOG_ENABLED` and restart: the storefront returns to the
catalog shipped with the build and Product Hub publication is refused again. No data
migration is involved. If a publication already changed prices, the build's catalog may
then differ from the server's; the existing rule blocks those options until a build with
matching data is deployed, so nothing is sold at a wrong price.
