# SEO & AEO Sprint 03 — founder review

Evidence date: 28 October 2026 (Asia/Dubai). No merge, deployment, production write, catalog publication, DNS change or crawler-policy change.

## Integration and scope

Existing Draft PR: https://github.com/Conquereleven/tres-leches-demo/pull/34

Original PR head: `6b1d1aebb31665faacbaf657e5906d368e04f8d2`.
Main integrated: `10a2176583da52890758dad57b9262a8af0e44f2`.
One textual conflict in `ProductOptions` was resolved by preserving main's SKU selection for search/recommendation links as well as SEO offers. No checkout/domain/payment changes were made. PR #67 (Checkout Recovery V2) remains separate; repeat relevant regression gates after its eventual integration. No force push is needed: the intended update retains both histories.

Reuses PR #34's server-rendered product architecture, published-catalog projection, titles, descriptions, canonical and Open Graph tags, Product/ProductGroup/Offer and breadcrumbs, live sitemap, legacy redirects, product H1 and SKU offer links. This is not a replacement implementation.

Sprint corrections:
- Product-path identity wins over an unrelated legacy `?product=` query, keeping hydrated content consistent with the server and canonical URL.
- Product images follow published product assignments; removing a product photo cannot resurrect variant or bundled images. Deterministic primary ordering matches the storefront.
- An unavailable published catalog returns a retryable, noncacheable 503 sitemap, instead of a misleading successful sitemap with all products omitted.
- Bundled-mode product links retain their working legacy URL when dynamic product routes are disabled.

## Fresh production observations

See `public-audit.json`. These are public HTTP observations, not Search Console evidence.
- www HTTPS responds 200; canonical host is https://www.3ldubai.ae.
- Apex HTTPS connection refused from this machine. Historical DNS targets are not re-authorized by this observation. Registrar/Railway ownership, target and TLS configuration must be checked by the owner before any separately approved correction.
- Live sitemap contains eight static URLs; the sampled product URL returns 404. Local candidate behavior is not deployed behavior.
- Public catalog contains 76 product families and zero published English descriptions. Older reports mentioning 74 products are historical.
- Cart, checkout, Operations and the public catalog API carry noindex headers. No private response data was retrieved.
- robots.txt allows all crawlers. Training permissions remain unchanged.

## Search intent and editorial priorities — proposals only

No keyword-volume or ranking claims. Search results are a small observed sample, not a comprehensive UAE-localized SERP study.

| Priority / intent | Existing destination | Approval-ready editorial brief |
| --- | --- | --- |
| P1 tres leches cake Dubai / delivery | `/menu` cake category and published tres-leches product URLs; `/delivery-policy` for fulfillment | Describe each real flavor and size using Product Hub-approved facts. Link sizes, ordering guide and current delivery policy. Never promise same-day delivery. |
| P1 Mexican bakery / Mexican desserts / Mexican pastries Dubai | `/` and `/menu` | One concise identity paragraph, approved heritage and actual catalog categories. Avoid three near-duplicate keyword pages. |
| P1 conchas Dubai | Existing menu Conchas filter and published Conchas products | Approved flavor, filling, size and pack differences. Preserve temporary-image exceptions and published media. |
| P2 cake jars Dubai | Existing jar filter and published jar products | Explain actual formats and approved flavor distinctions; link to fixed-price pack products where published. |
| P2 Pan de Muerto Dubai | Existing Pan filter and published product pages | Seasonal educational copy, reviewed availability window, traditional versus filled options; keep off-season availability truthful. No fabricated annual dates or stock. |
| P3 birthday cakes Dubai | Existing eligible cake products only | Proceed only after Lisa confirms supported occasion options, lead times and customization limits. No generic birthday landing page yet. |

Observed competition: [Matilda's dedicated tres-leches product page](https://matildacake.com/product/classic-tres-leches/) exposes description and sizes; [Bloomsbury's product page](https://www.bloomsburys.ae/rose-pistachio-tres-leches-milk-cake-) exposes product details and delivery information; [AMORA's pastry menu](https://www.colombiamora.com/pastry-amora) provides descriptive dessert listings. Their commercial claims are not evidence about 3L. A [third-party 3L listing](https://www.mumzworld.com/en/catalog/product/view/id/186249) surfaced with out-of-stock text: this illustrates fragmented discovery, not current 3L stock or an authorized source for site copy.

Editorial sequence: approve descriptions for highest-priority published cake/Conchas/jar families; publish through Product Hub's normal reviewed workflow; approve concise category introductions and useful ordering answers; then seasonal content. EN first, followed by reviewed ES/AR equivalents. Each description should state only verified product characteristics, actual options, and a useful next action. Ingredients, allergens, certifications, shelf life and guarantees need explicit evidence. No proposed copy is published by this sprint.

## Search Console, Bing and Business Profile actions

Account configuration and ownership are **unverified**; no connected account access was available.

1. Lisa identifies the existing GSC property and owner, or creates a URL-prefix property for `https://www.3ldubai.ae/`. Prefer reusing existing verification. Domain verification requiring DNS is a separate owner action; no DNS edits are authorized here.
2. After approved deployment, submit `/sitemap.xml`; inspect home, menu, a cake, a pack, an unavailable product and a missing slug. Check canonical selection, rendered HTML, price/stock correspondence, Product snippets/Merchant listings and Page indexing exclusions.
3. Review Core Web Vitals mobile and desktop and URL Inspection rendering. Use available field data; insufficient data is not a pass. Search Console's old standalone Mobile Usability report is retired: use browser mobile checks and Lighthouse/field diagnostics.
4. Record baseline queries, pages, impressions, clicks and CTR, segmenting brand/nonbrand and device. Compare equivalent 28-day periods after crawl/indexing catches up; account for seasonal demand and deployments.
5. Bing: identify existing Webmaster Tools owner; add/verify the www site or import a verified GSC property with owner consent. Submit sitemap, inspect representative URLs, review crawl/indexing and search reports. IndexNow is optional future work, not enabled here.
6. Google Business Profile: confirm ownership, exact trading identity, legitimate customer-facing pickup/service model, primary phone, hours, categories and authorized delivery coverage before editing. No invented hours or new ownership permissions.
7. Owner diagnoses apex routing and certificate readiness with fresh registrar/Railway evidence. The target state is a working HTTPS redirect to www preserving path/query. This sprint does not change configuration.

## Official search and AI guidance

- [Google product variants](https://developers.google.com/search/docs/appearance/structured-data/product-variants): use stable group/variant identifiers, selectable variant URLs and initial HTML matching visible offers. Validate with Rich Results Test after release; custom tests do not certify Google eligibility.
- [Google AI features](https://developers.google.com/search/docs/appearance/ai-features): ordinary indexing and useful content remain the foundation; there is no special AI schema requirement.
- [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a): clear canonical URLs, truthful structured content and accurate sitemaps support discovery; citations are not guaranteed.
- [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots): search and training crawler controls are independent. OAI-SearchBot remains allowed under the existing policy; GPTBot permissions are untouched.

No FAQPage, fabricated reviews/ratings, invented business attributes, tracking scripts, hreflang for incomplete equivalents or llms.txt were added. SSR remains English; existing ES/AR query behavior is preserved in the interactive storefront.

## Release and rollback

This is a review candidate, never authorization to deploy. Required gates: authenticated GitHub update, CI on the exact candidate SHA, browser regressions, founder review of commercial facts and separate release authorization. Search-account access and the apex incident remain owner tasks.

Rollback after a separately approved release: deploy the previously known-good application revision through the normal approved process, or revert this integration with the correct mainline parent after reviewing the resulting diff. Never restore the production database, alter product prices or switch catalog adoption off to undo a commercial publication. The existing legacy links remain supported. Preserve catalog/accepted order snapshots throughout.

## Validation results and performance

| Gate | Result |
| --- | --- |
| Typecheck / lint / build | Passed locally, Node 24.22.1; CI uses its configured Node 22 |
| Commerce + HTTP + SEO tests | 791 passed, zero skipped (compiled build present) |
| Dynamic storefront, Chromium + WebKit | 56 passed; includes publication, authoritative price/stock/media, cache and private-chunk checks |
| Final product page browser tests | 8 passed; H1, selectable fixed pack offers, canonical/query consistency, no-JS image ratio, EN/ES/AR, RTL, mobile overflow and Add to Cart |
| Checkout regression | 33 passed |
| Conversion / Pack Builder / search / recommendations | 18 passed after updating two old URL assertions to the canonical product path; SKU and language assertions remain |
| Menu regression | 14 passed / 5 failed; the same five fail on clean main 10a2176. Candidate used original 60s timeout; main repeat used 15s after an interrupted original run also reproduced the first four failures. These are not a green menu acceptance gate. |
| Sites packaging | 4 passed |
| Secret scan | 0 findings (heuristic) |
| npm audit | 0 vulnerabilities |
| Remote CI | Not run on this local candidate: authenticated GitHub write access unavailable |

The five existing menu failures are `latest individual sizes, fillings and packs preserve their precise prices`, `multiple menu SKUs go through cart and existing web checkout with authoritative total`, and the visual/accessibility/no-payment journeys at 390/768/1440. Preserve them as a release condition; do not change commercial behavior to satisfy stale fixture expectations during this SEO sprint.

Fresh browser evidence: `chromium-{en,es,ar}-390.png`, `webkit-{en,es,ar}-390.png`, `no-js-390.png`, `no-js-1440.png`. Synthetic catalog only. Visual review found a no-JS photograph aspect-ratio defect; `height:auto` now preserves its intrinsic ratio without changing interactive presentation.

Performance method and full resources: `performance-main.json` and `performance-candidate.json`; reproducible script `scripts/seo-sprint-audit.mjs`. Three cold Chromium contexts at 390×844 on loopback, no CPU/network throttling. This is a small local diagnostic sample; other test work was running during portions of the session, so timing differences do not establish a statistically reliable regression or improvement.

| Diagnostic | main | candidate |
| --- | --- | --- |
| Median observed LCP | 156 ms | 304 ms |
| Observed CLS | 0 | 0.00895 |
| Requested JS, gzip level 9 | 343,475 bytes | 343,587 bytes |
| Requested CSS, gzip level 9 | 21,919 bytes | 21,919 bytes |

The candidate initially paints product HTML and then the existing interactive view; main has no product HTML without JavaScript. JS growth is 112 compressed bytes; CSS is unchanged. Recorded keyboard event durations are diagnostic samples, not field INP. LCP/CLS remain within the usual good thresholds in this local sample, but no production CWV pass is asserted. Images carry dimensions/srcset and fonts were loaded before measurement completion. Verify field LCP/INP/CLS in Search Console/CrUX after approved release; also inspect mobile network/CPU conditions before sign-off.

## Delivery status

**GO WITH CONDITIONS for founder review; not approved for production.** Local implementation is complete. Blocking external step: GitHub connector calls returned unknown-tool errors and the local credential helper had no authenticated credential. The public repository could be cloned, but that does not prove push authorization. No remote branch or PR metadata was modified, no competing PR was created, and no CI result is claimed for the local commit.

Lisa must reconnect GitHub or configure an authenticated local Git client with access to `Conquereleven/tres-leches-demo`. Then verify the remote branch has not advanced, integrate any new work without force-push, push the prepared commits to `feat/3l-seo-product-pages`, and update Draft PR #34 using `PR_BODY.md`. Re-run CI on that exact pushed SHA. Further conditions: existing menu failures, business-copy approval, search-account access and apex routing diagnosis.
