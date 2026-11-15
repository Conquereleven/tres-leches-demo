## SEO product pages integrated with deployed main

Tracking #32. Continues PR #34. Base integrated: `2fbebd2d91cf85e58722d3e48360ee33ba1fea0a`, including merged/deployed Checkout Recovery V2 #67, Vite 6.4.5 security patch and owner Google verification #68. Clean local merge, no force push. Checkout/payment behavior remains exactly main's implementation.

Published catalog product pages `/menu/<slug>` provide useful server HTML, canonical/H1/Open Graph, prices/availability, Product/ProductGroup/Offer and breadcrumbs, published-media authority, live sitemap and legacy redirects retaining SKU/language. New integration assertion verifies the owner-approved Google tag survives the product-page head rewrite.

Local validation in an isolated worktree: typecheck/lint/build; 810 commerce/HTTP/SEO/recovery tests; 58 dynamic storefront tests (Chromium/WebKit, EN/ES/AR/mobile); Sites 4/4; secret scan zero findings. Full checkout suite: 91 passed / 1 WebKit checkbox interaction failure; three isolated repetitions of the unmodified failing scenario passed 3/3. Preserve that flake in review. Five old menu failures remain documented baseline price-selector debt; current full menu suite was not rerun (its tests, fixture price data and MenuCatalog are unchanged from the compared baseline).

**Current release blocker:** full npm audit fails on minimatch 10.2.6 through dev tooling (GHSA-g3hv-75wg-m249; 10 affected dependency entries). Candidate dependency files equal main. Production-only audit is clean. No breaking auto-fix or relaxed audit threshold was applied. This requires a narrowly scoped tooling security fix before release sign-off.

**Merchant gates:** fresh public observations still show 8 sitemap URLs, sample product 404, and 76 published products with 0 English descriptions. Google's homepage verification tag is present. After a separately approved release, validate URLs/canonicals/prices/schema/sitemap before any product submission or crawl activation; Lisa must approve factual English descriptions and accurate delivery representation. Account verification reported by the Google coordination chat is not independent console validation here.

Evidence: `docs/seo/sprint03/release-20261031/README.md`, public readiness JSON, audit output; prior screenshots and menu failure classification remain under `docs/seo/sprint03/`.

**NO-GO for release until audit and current CI conditions close; candidate available for founder inspection.** No merge/deploy, Production DB/catalog publication, commercial copy, DNS/Railway or search-console mutation.
