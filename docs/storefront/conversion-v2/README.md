# Storefront Conversion UX V2 — founder review

Baseline: GitHub `main` at `703c14dc3615d4aca1a7eb222f5dd4afdc297e5c`, including PRs #62–#64. The independent branch contains no catalog publication, Production configuration change, payment change, merge or deployment.

## What changed

1. Personalized boxes explain the full 6/12-piece requirement, show selected and remaining pieces, permit an explicit fill-remaining action, and label box quantity separately. The existing published eligibility and premium calculations still decide whether the cart action is valid.
2. Search appears above categories. It reads the live published catalog, intersects each option with current checkout price and availability, and sends shoppers directly to a valid product detail option. EN/ES/AR synonyms, accent folding, safe one-character tolerance, keyboard controls, URL query, loading, offline, no-results and retry states are included. Search is local to the current catalog; no new service or dependency was added.
3. After a successful cart addition, an optional area proposes up to three complementary families from `src/brand/recommendation-rules.json`. Product, option, image and price resolve from the current published catalog. The customer chooses a size before a direct quick add; complex packs link to their existing builder. Cart and Continue shopping remain immediately accessible. Nothing is added without a click.

The `recommendation-rules.json` file is a curation policy for families and priority, not a second SKU, stock or price source. Cart checkout and payment contracts are unchanged. A cart-embedded suggestion block was omitted to keep the 390px checkout path short.

## Visual evidence

All screenshots use the same disposable local catalog and fake provider. The before state is the exact baseline commit above. The after state is this branch.

| View | Before 390px | After 390px | After 1440px |
| --- | --- | --- | --- |
| One piece in a 12-piece box | [Before](screenshots/before-pack-one-390.png) | [After](screenshots/after-pack-one-390.png) | [Desktop](screenshots/after-pack-one-1440.png) |
| Menu entry and category navigation | [Before](screenshots/before-menu-discovery-390.png) | [After](screenshots/after-menu-discovery-390.png) | [Desktop](screenshots/after-menu-discovery-1440.png) |
| Successful cart addition | [Before](screenshots/before-after-add-390.png) | [After](screenshots/after-after-add-390.png) | [Desktop](screenshots/after-after-add-1440.png) |

The new [mobile search results](screenshots/search-results-390.png) and [mobile complementary size selector](screenshots/recommendations-390.png) are additional journey captures. The 390px cart is checked for horizontal overflow in the browser suite.

## Acceptance and regression

- `npm run typecheck`, `npm run lint`, `npm run build` (includes i18n and customer-copy audit), `npm run scan:secrets`, `npm run audit`.
- Full commerce unit suite: 767 passed. Sites: 4 passed.
- Conversion journeys and adverse states: 18 passed across Chromium/WebKit, EN/ES/AR and 390/1440px. Axe: zero violations in the new pack, search and recommendation sections. Three journeys assert no browser console/page errors and no provider POSTs.
- Existing personalized-pack browser suite: 24 passed, including cart mixture identity and server checkout pricing.
- Existing premium-pricing browser suite: 24 passed, including all eight fixed-price formats, per-piece premiums and frozen preparation snapshots.
- Existing checkout browser suite: 33 Chromium + 33 WebKit passed.
- Dynamic Product Hub browser suite: 25 Chromium + 25 WebKit passed when each browser receives a fresh local fixture. Running both browser projects against one 60-second fixture exceeds the server's existing 300-request local rate limit; CI now starts a fresh fixture per browser. The rate limit itself remains unchanged.
- Secret scan: zero findings. Dependency audit: zero vulnerabilities.

## Deployment and rollback

Review the screenshots and Draft PR, then merge only with founder approval. The release uses the normal storefront build and requires no new environment variables or database migration. Rollback is a revert of this frontend/rule/UI test commit or a redeploy of the preceding commit; accepted orders and payment records are unchanged because this branch does not change their storage or provider paths.

## Review considerations

- Search matches descriptive cake content for broad terms such as “milk”; exact product-name hits rank first. This is intentional discovery rather than a one-product-only filter.
- Suggestions disappear if the current published catalog withdraws an option. A stale quick-add click rechecks the current catalog and checkout config before changing the cart.
- Existing temporary Conchas Tricolor pack and Special Flavours Cake Jar media exceptions remain exactly as approved for the earlier media release.
