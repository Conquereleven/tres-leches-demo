# SEO release candidate refresh — 31 October 2026

Continues Draft PR #34; no replacement PR. Main integrated: `2fbebd2d91cf85e58722d3e48360ee33ba1fea0a` (deployed #67 Checkout Recovery V2 plus #68 owner-approved Google verification). Prior SEO head: `5e5933bb705a1a315efe25ed957421383c15cbdb`. Merge was clean. Main's Vite 6.4.5 security patch is retained. No custom checkout/payment change was added by this refresh.

The only new executable addition is a regression assertion that the owner-approved Google verification meta tag from index.html survives product HTML head rewriting. It passed in the compiled server tests. Existing SEO behavior, published prices/availability, product media, fixed pack offers, language parameters and private-route noindex remain the architecture from Sprint 03.

Local validation uses clean detached worktree `/private/tmp/3l-seo-release-20261031`, disposable SQLite and fake providers. Unrelated untracked duplicate files in the original checkout were preserved. Current source gates: typecheck, lint and build passed; commerce/HTTP/SEO/recovery tests 810 passed, zero skipped; Sites 4 passed; secret scan zero findings. Browser suites and dependency audit results are recorded in the final review report/PR after completion. No prior SHA's CI result certifies this refreshed candidate.

## Release and Merchant gates

| Gate | State / required evidence |
| --- | --- |
| Owner Google verification tag | Public homepage observed with tag; candidate product-page assertion passes. This does not prove Merchant/GSC ownership status. |
| Public product pages | Sample `/menu/tres-leches--classic` still returns 404; release of #34 requires separate founder authorization. After release, inspect a cake, a pack, canonical/JSON-LD, absent/withdrawn product and no-JS/mobile rendering. |
| Sitemap | Public production sitemap still lists 8 URLs. After authorized release, confirm canonical published product inclusion and absence of drafts/retired options before Merchant crawling or sitemap submission. |
| English descriptions | Public catalog: 76 product families, 0 English descriptions. Lisa must approve factual descriptions through normal Product Hub publication. No descriptions invented or published here. |
| Delivery representation | Merchant shipping settings and public customer information need approved, consistent coverage, fees/minimums, timing and pickup facts. Repository tests are not commercial approval. Do not invent coverage, fixed delivery charges or promises to satisfy Merchant. |
| Merchant/GSC/Bing accounts | Google coordination chat reports verification completed and Merchant prepared. This refresh performs no account mutation or submission and does not independently certify console state. |
| Apex | Owner's separately authorized domain work remains outside this refresh; no DNS/registrar/Railway change. Prior October 28 connection evidence is historical. |
| Baseline menu tests | Prior exact-main evidence: 14/19, five stale price selectors. This refresh does not change the menu test, fixture price file or MenuCatalog relative to that baseline. Current full menu suite was not rerun. Preserve debt and downstream coverage limitation from `../integration/menu-classification.md`. |

Recommendation: GO WITH CONDITIONS for founder release review only after current candidate CI completes. Merchant product submission remains blocked until the URL, English-description and delivery gates above are satisfied. Do not treat merge readiness as Merchant activation authorization.

No production deployment, PR merge, provider calls, Product Hub publication, commercial edits, DNS change or search-console mutation. After separately approved release, rollback is an approved code revision/revert, never a production database restore or a catalog price rollback through adoption flags.
