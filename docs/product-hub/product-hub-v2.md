# Product Hub V2 — administrative product editor

Status: **ready for review; publication to customers is BLOCKED** (see "Storefront integration").
Baseline: `main` at `5d47c9d`. Branch: `feature/3l-product-hub-v2-admin`.
Nothing here was run against Production, a live database or a payment provider.

## What it does

Inside Operations → Products an administrator can:

- browse and filter the whole catalog (category, publication status, availability, draft changes, free search);
- create products and edit existing ones: name, category, family, description, publication status;
- manage variants: SKU, catalog name, flavour, size, pack quantity, price in AED, active, availability;
- edit customer content in English, Spanish and Arabic (Arabic is edited right-to-left);
- give each variant its Spanish and Arabic flavour, size and cart name (never filled in
  automatically; new wording without one is flagged before publishing);
- choose images from the library or upload new ones, set the primary image, and see a customer-style preview;
- review every pending change as a before/after comparison with validation results, then publish or discard.

All edits go to a **private draft**. Customers, checkout and the public catalog API keep reading the
published catalog until an administrator publishes.

## Authority and data model

`State.catalog` is still the **only** price and availability authority and `State.catalogFoundation`
its relational description (PR #7). V2 adds one optional field and one table:

- `State.productHub` (`server/catalog/product-hub.ts`):
  - `version` — optimistic revision of the editing session; every accepted write adds one;
  - `draft` — `{ baseRevisionId, updatedAt, updatedBy, catalog, foundation }`: a candidate copy of the
    published pair. Absent when there are no pending changes;
  - `history` — last 200 entries (editor, action, summary, from/to revision for publications);
  - `commands` — last 200 idempotency receipts.
- SQLite table `product_hub_media` (`server/db/schema.sql`): uploaded image bytes keyed by SHA-256.
  It lives in the same database file, so the existing transaction and backup cover it.

There is no second price list: the draft is a copy awaiting publication, never read by checkout.

## Publication

`publish` runs inside one `Store.write` (one SQLite transaction):

1. refuse unless the feature flags allow it and the caller is an administrator;
2. refuse if the caller's `expectedVersion` is stale, or the draft's base revision or the reviewed
   revision is no longer the published one;
3. run every check; any error blocks;
4. compute the new revision fingerprint and validate the pair with the V1 contract;
5. replace `State.catalog` and `State.catalogFoundation` together, clear the draft, write the audit
   entry (`State.audit`) and the hub history entry with the editor's identity.

Any failure rolls the transaction back: the published catalog and the draft are exactly as before.
Orders and payments are never read for writing; accepted orders keep their frozen checkout snapshot.

### Checks

Errors (block): deleting an existing SKU, moving a SKU to another product, activating or publishing a
removed combination (`RETIRED_SKUS`), a published product without a published variant, any violation of
the V1 structural contract. Warnings (reviewed, not blocking, shown for what the draft touches): price
change above 50%, missing ES/AR name, no primary image, published product with no active variant.

### Stable identity

Existing SKU ids, a published product's id and slug, and a published family's category and pack flag
cannot change. SKUs are deactivated, never deleted. New SKUs and products may be removed while they are
still draft-only. Seasonal rules (`availableSku`) are untouched and still apply at read time.

Three different states, never conflated: **unpublished** (product/variant `commercialState`), **inactive**
(`catalog.active = false`, cannot be sold), **unavailable** (`catalog.availability`, temporarily out).

## API

All routes need a signed-in session. Writes also need the same-origin `Origin` header (existing rule) and an
`Idempotency-Key` header of 8–128 characters.

| Route                            | Roles                                            | Purpose                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/product-hub`           | admin, manager                                   | Flags, permissions, version, published revision, draft status, categories, families, products with variants and commercial fields, assets, checks, changes, history |
| `POST /api/product-hub/commands` | admin                                            | JSON body ≤ 512 KB: `saveProduct`, `saveFamily`, `saveAsset`, `discardDraft`, `publish`, each with `expectedVersion`                                                |
| `POST /api/product-hub/media`    | admin                                            | Raw image body ≤ 3 MB; `Content-Type` must match the bytes; `X-Hub-Meta` is base64url JSON `{ expectedVersion, alt }`                                               |
| `GET /brand/hub/<sha256>.<ext>`  | public once published; admin/manager while draft | Uploaded image. Published: `immutable`, one year. Draft: `private, no-store`                                                                                        |

Operators and agents receive 403 on every route. Errors: 400 invalid input or missing key, 403 role or
flag, 404 feature disabled or unknown route, 409 stale version / key reuse / stale base, 413 too large,
415 not an accepted image, 422 rule violation, 503 foundation missing or inconsistent.

Strict schemas reject unknown fields. Prices are positive integer fils, at most AED 100,000. Text is
trimmed and bounded. Uploads are identified from their own bytes: PNG, JPEG, WebP or AVIF, 200–6000 px
per side; SVG and everything else is refused. Images are served with `nosniff` and a sandboxing CSP.

## Feature flags

| Variable                      | Default     | Effect                                                                   |
| ----------------------------- | ----------- | ------------------------------------------------------------------------ |
| `PRODUCT_HUB_ENABLED`         | unset (off) | Editor and its API. Off: the page says the hub is disabled               |
| `PRODUCT_HUB_PUBLISH_ENABLED` | unset (off) | Allows `publish` — **except in Production**, where it is refused in code |

Production is any environment whose `APP_ENV` is not `test`, `development` or `staging`.
Since the dynamic storefront (`storefront-dynamic-catalog.md`), publication in Production
is allowed only while dynamic adoption is active there.

## Storefront integration — the blocker

The public storefront does **not** read the published catalog at runtime. It ships three build-time
sources: `src/brand/menu-data.json` (families, options, prices), `shared/storefront-products.json`
(products, slugs, SKU lists) and the media manifests. It also refuses to sell an option whose bundled
price differs from the server's.

Consequences today:

- a published **price** change reaches checkout immediately, but the storefront would show the old
  price and block that option as "unavailable" until the site is rebuilt;
- a published **new product, name, translation or image** does not appear to customers at all.

That is why publication is refused in Production in this phase and the interface says so. Do not describe
Product Hub as publishing to customers yet.

Required integration (shared storefront files, owned with Agent B; apply after their work lands):

1. `src/brand/MenuCatalog.tsx` / `src/brand/Shop.tsx`: show the server's price from
   `/api/checkout/config` instead of the bundled one, and stop treating a difference as an error.
2. Build the storefront product list, variants, localized names and images from the published
   catalog (`publicCatalog` / `GET /api/catalog`) instead of the three bundled files, keeping the
   bundled data as the fallback when the foundation is missing.
3. Allow `/brand/hub/` images in the storefront image pipeline and CSP (`img-src 'self'` already covers it).
4. Then lift the Production block behind an explicit founder approval.

No shared storefront file is changed in this branch.

## Steps before Production activation

1. Review and merge this PR (no deployment).
2. Initialize `catalogFoundation` in the target database (it is absent wherever `catalog:foundation`
   was never applied; the hub reports "not initialized" and stays read-only until then).
3. Deploy with both flags unset: nothing changes for anyone.
4. Set `PRODUCT_HUB_ENABLED=true`: Lisa can prepare drafts; nothing is published.
5. Complete the storefront integration above and validate it on TEST.
6. With founder approval, remove the Production block and set `PRODUCT_HUB_PUBLISH_ENABLED=true`.

## Compatibility with other agents

- `src/commerce/Workspace.tsx`: three lines changed (import `ProductHub`, render it for the Products
  view). `OrdersBoard.tsx`, `PrintCenter.tsx`, ticket snapshot logic and storefront CSS are untouched.
  `ProductsAvailability` is still exported from `OperationsOverview.tsx` for anyone who uses it.
- `server/http.ts`: one import and two small hooks (authenticated routes; uploaded-image route).
- New operations strings are added to `src/commerce/locales/en.json` and `tl.json` (append-only).

## Tests

`tests/commerce/product-hub.test.ts` (domain), `tests/commerce/product-hub-http.test.ts` (real server,
real sessions and roles), `tests/product-hub-e2e/product-hub.spec.ts` (Chromium and WebKit; 390, 768 and
1440 px; axe). Run the browser suite with `npm run build && npx playwright test -c playwright.product-hub.config.ts`.
