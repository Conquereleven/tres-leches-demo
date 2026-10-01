# 3L Full Menu — validation and screenshot review

Canonical repository: `/Users/rodrigom./code/tres-leches-demo`  
Branch: `feature/ecommerce-ux-polish`  
Catalog: 8 categories, 29 families, 218 unique purchasable SKUs.

## Validation

- TypeScript strict: PASS.
- ESLint: PASS.
- Full unit/integration suite: 248/248 PASS.
- Existing checkout/browser regression suite: 15/15 PASS (historical local fixtures).
- Expanded menu/browser suite: 6/6 PASS (current approved catalog).
- Sites tests: 4/4 PASS.
- Total automated tests: 273/273 PASS.
- Build: PASS, 4597 modules; storefront/customer-page prerender and server build complete.
- Catalog dry run: valid, 218 items. No hosted catalog import was performed.
- Axe accessibility: no violations in the full-menu section for every category at 390 and 1440px (WCAG 2 A/AA + 2.1 AA).
- Screenshot/browser QA: 24 images; no horizontal overflow, application exceptions or console errors. The fixture server's favicon.ico 404 is excluded from the console check.
- Payment network operations during current-menu screenshot flows: zero. Existing payment regressions use local fixture responses only.
- Secret scan: zero findings (heuristic source/client-bundle scan).
- Production dependency audit: zero vulnerabilities.
- Full dependency audit: one pre-existing high vulnerability in brace-expansion 5.0.9 through minimatch → ESLint (development-only). Dependency/lock files were not changed.
- Existing pending business-information warnings remain unchanged.

## Safety and activation

The storefront retains product → cart → web checkout → Paymennt. WhatsApp is support-only. The old AED25 Pan de Muerto SKU is retired from the approved catalog and exists only in historical test fixtures. No changes to server/, PaymentFrame, payment adapters, checkout requests, billing mapping, delivery rules, Meta, operational transitions, credentials or Railway variables.

The TEST startup script changed only its approved catalog selection/import verification, so a future approved release cannot restore the retired SKU. The validated catalog import still creates a backup. Existing provider/environment gates are intact. Source PDFs/JPEGs were read-only; extracted photos are separate assets. No deployment, push, real payment or hosted database mutation was performed.

Before a release, review screenshots and apply/activate the approved catalog using the existing importer and backup workflow described in current-menu.md. Until the matching server catalog exists, new menu options are displayed but Add to Cart fails closed.

## Screenshots

All views use local fixtures. Product screenshots crop the card from the stated viewport; remaining screenshots capture the viewport. QA artifacts are local, not shipped or committed.

| View | 390px viewport | 1440px viewport |
|---|---|---|
| Homepage | [Mobile](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/homepage-390.png) | [Desktop](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/homepage-1440.png) |
| Tres Leches Cakes | [Mobile](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/cakes-390.png) | [Desktop](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/cakes-1440.png) |
| Cake Jars | [Mobile](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/jars-390.png) | [Desktop](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/jars-1440.png) |
| Panadería Mexicana | [Mobile](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/bakery-390.png) | [Desktop](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/bakery-1440.png) |
| Pan de Muerto | [Mobile](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/pan-390.png) | [Desktop](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/pan-1440.png) |
| Conchas | [Mobile](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/conchas-390.png) | [Desktop](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/conchas-1440.png) |
| Other Specialities | [Mobile](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/specialities-390.png) | [Desktop](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/specialities-1440.png) |
| Seasonal | [Mobile](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/seasonal-390.png) | [Desktop](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/seasonal-1440.png) |
| Extras | [Mobile](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/extras-390.png) | [Desktop](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/extras-1440.png) |
| Product options | [Mobile](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/product-390.png) | [Desktop](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/product-1440.png) |
| Cart | [Mobile](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/cart-390.png) | [Desktop](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/cart-1440.png) |
| Checkout | [Mobile](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/checkout-390.png) | [Desktop](/Users/rodrigom./code/tres-leches-demo/work/qa/full-menu/checkout-1440.png) |

## Exact changed files

- `AGENTS.md`
- `data-imports/liza-current-menu.json`
- `data-imports/pan-de-muerto.json`
- `docs/catalog/current-menu.md`
- `docs/catalog/validation.md`
- `playwright.checkout.config.ts`
- `playwright.menu.config.ts`
- `public/brand/menu/bakery.webp`
- `public/brand/menu/cakes.webp`
- `public/brand/menu/conchas-filled.webp`
- `public/brand/menu/conchas-pack.webp`
- `public/brand/menu/conchas-traditional.webp`
- `public/brand/menu/jars.webp`
- `public/brand/menu/pan-filled.webp`
- `public/brand/menu/pan-pack.webp`
- `public/brand/menu/pan-traditional.webp`
- `public/brand/menu/special-cakes.webp`
- `public/brand/menu/special-jars.webp`
- `public/brand/menu/specialities.webp`
- `scripts/start-paymennt-test.mjs`
- `src/brand/Experience.tsx`
- `src/brand/MenuCatalog.tsx`
- `src/brand/Shop.tsx`
- `src/brand/brand.css`
- `src/brand/content.ts`
- `src/brand/menu-data.json`
- `src/brand/menu.ts`
- `tests/checkout-e2e/checkout.spec.ts`
- `tests/commerce/billing-address.test.ts`
- `tests/commerce/brand.test.ts`
- `tests/commerce/ecommerce-checkout.test.ts`
- `tests/commerce/embedded-checkout.test.ts`
- `tests/commerce/full-menu.test.ts`
- `tests/commerce/web-checkout-http.test.ts`
- `tests/commerce/web-checkout.test.ts`
- `tests/fixtures/retired-pan-de-muerto.json`
- `tests/fixtures/web-checkout-server.ts`
- `tests/menu-e2e/menu.spec.ts`
