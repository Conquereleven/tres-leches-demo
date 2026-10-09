> Historical baseline audit. Superseded by [delivery-report.md](delivery-report.md) and the final approved GeoJSON closure.

# Phase A — audit of f471a0802d85a39cf105c6e8cbb75499147d5e7f

Performed 2026-10-03, Asia/Dubai. BEFORE map foundation changes. No code or visual fixes during Phase A. Baseline tests freshly rerun. All zone data below are repository seed/local fixture configuration; Production DB was not inspected or modified.

## Every original numbered requirement (0–38)

| No. | Requirement | Status | Evidence / components | Tests | Remaining work |
|---|---|---|---|---|---|
| 0 | Working method | PARTIAL | Current HEAD inspected/run; original identity PDF unavailable; repo/report | repo inspection and baseline suite | See evidence; requires smallest next pass/business review |
| 1 | Sprint goal | PARTIAL | Several business and fidelity gaps remain; repo/report | repo inspection and baseline suite | See evidence; requires smallest next pass/business review |
| 2 | Homepage rebuild | PARTIAL | New comparisons show material drift; no visual fixes applied; Experience.tsx; storefront.css | motion (source assertions only), fresh visual audit | See evidence; requires smallest next pass/business review |
| 3 | Homepage colors | COMPLETE | Cream/beige/gold homepage and lilac interior observed; storefront.css; brand.css | fresh visual audit | No implementation gap found in scoped audit; real provider activation separate |
| 4 | Typography and logos | PARTIAL | Official Abril/Montserrat used; original manual cannot be reinspected; logo oversized at 768; brand.css; primitives.tsx; SiteChrome.tsx | brand + fresh visual audit | See evidence; requires smallest next pass/business review |
| 5 | Menu leaves homepage | COMPLETE | Experience renders five editorial sections; full catalog only MenuCatalog on /menu; Root.tsx; StorePages.tsx; Experience.tsx | menu browser 8 cases + Root source | No implementation gap found in scoped audit; real provider activation separate |
| 6 | Menu page | COMPLETE | Eight categories/selectors/server SKU gating; mobile and desktop browser tests; MenuCatalog.tsx; menu.ts; menu-data.json | full-menu 3, menu browser 8 | No implementation gap found in scoped audit; real provider activation separate |
| 7 | Product photos | PARTIAL | Family/category imagery rather than exact images for every SKU; gallery/product detail absent; MenuCatalog.tsx; content.ts; public/brand | menu browser axe/visual; no per-SKU photo assertion | See evidence; requires smallest next pass/business review |
| 8 | Home video | COMPLETE | Poster, explicit play/pause, offscreen pause; source autoplays (intentional deviation); Experience.tsx | motion 7 (not every case video-specific) | No implementation gap found in scoped audit; real provider activation separate |
| 9 | Favicon | COMPLETE | index.html links approved /brand/icon.png; index.html | brand/source inspection | No implementation gap found in scoped audit; real provider activation separate |
| 10 | How to order | COMPLETE | /how-to-order describes real web checkout and approved schedule; StorePages.tsx | source/manual only; no dedicated route regression | No implementation gap found in scoped audit; real provider activation separate |
| 11 | Product quantity | COMPLETE | Actual cart increase 340→680 verified; bounded integer quantity in cart.ts; cart.ts; Shop.tsx | ecommerce/cart + fresh manual quantity | No implementation gap found in scoped audit; real provider activation separate |
| 12 | Clear cart | PARTIAL | clear() and confirmation handler exist; dedicated clear browser regression absent; IAB dialog click not verified; cart.ts; Shop.tsx | code inspected; no dedicated clear browser test | See evidence; requires smallest next pass/business review |
| 13 | Floating cart | COMPLETE | Header cart and nonempty floating cart observed; mobile checks; CartLink.tsx; FloatingShopping | menu visual 390/768/1440 | No implementation gap found in scoped audit; real provider activation separate |
| 14 | Pan de Muerto season/packs | COMPLETE | Dubai seasonal policy tested at both boundary instants; pack exclusion remains available; shared/commerce-policy.ts; quote/config | master-sprint 4 seasonal instants | No implementation gap found in scoped audit; real provider activation separate |
| 15 | Pan de Muerto options | PARTIAL | Prices approved and 16 new SKUs present; test titled persistence only checks catalog; full end-to-end persistence not tested; menu-data.json; liza-current-menu.json | master-sprint catalog-only; persistence missing | See evidence; requires smallest next pass/business review |
| 16 | Option price ordering | COMPLETE | menu.ts sorts descending price then SKU; test covers every family; menu.ts | master-sprint sorted-family assertion | No implementation gap found in scoped audit; real provider activation separate |
| 17 | Next day / advance notice | COMPLETE | shared validWindow plus normalizeCheckout enforce next-day AND lead time; browser uses serverNow snapshot; commerce-policy.ts; normalizeCheckout; Shop.tsx | master-sprint boundary tests; delivery-pickup 11; browser forms | No implementation gap found in scoped audit; real provider activation separate |
| 18 | Delivery windows | COMPLETE | Three server slots; obsolete Afternoon rejected; UI freeform fallback remains if slots empty (normal config never empty); configuredSlots; Shop.tsx | master-sprint obsolete slot; checkout browser | No implementation gap found in scoped audit; real provider activation separate |
| 19 | Area minimum order | COMPLETE | 93 seeded zones, shortfall and free delivery; quote authoritative pricing; zones.ts; quoteWebCheckout; Shop.tsx | domain; delivery-pickup; checkout browser zone bands | No implementation gap found in scoped audit; real provider activation separate |
| 20 | Address/area validation | PARTIAL | Private exact address/building → verified coordinate → unique active polygon; create/resume reject mismatched area. No production geographic/address data in repo; website-address.ts; /api/checkout/address; create/resume | master-sprint unknown/matching registry; no precise live geo | See evidence; requires smallest next pass/business review |
| 21 | Remaining Dubai areas | NEEDS BUSINESS INPUT | All known rates seeded; remaining map communities have no approved minimum/boundary data; zoneSeed | seed source; no live geo coverage | See evidence; requires smallest next pass/business review |
| 22 | Checkout images | COMPLETE | ProductThumbnail reused in cart/review/confirmation; fallback family image for unassigned SKU; Shop.tsx ProductThumbnail | checkout visual and ux tests | No implementation gap found in scoped audit; real provider activation separate |
| 23 | Customer WhatsApp | COMPLETE | Customer links normalized to +971585943319; content.ts; business.ts | brand/policies + captured DOM | No implementation gap found in scoped audit; real provider activation separate |
| 24 | Floating WhatsApp | COMPLETE | Left-side discreet floating support; thumb/overflow browser QA; SiteChrome.tsx; storefront.css | menu visual/overflow + captured DOM | No implementation gap found in scoped audit; real provider activation separate |
| 25 | WhatsApp order destination | COMPLETE | Explicit later instruction keeps WhatsApp support-only; ecommerce stays web checkout. Internal notifier remains separate; Shop.tsx; server/domain/notifications.ts | paymennt-web 21/checkout browser | No implementation gap found in scoped audit; real provider activation separate |
| 26 | English/Arabic | PARTIAL | 6 general nav resources, switcher and document RTL; majority of catalog/checkout strings untranslated; localization.tsx; Root.tsx | source inspection; no Arabic browser suite | See evidence; requires smallest next pass/business review |
| 27 | Dashboard auth | COMPLETE | scrypt, timing-safe verify, secure HttpOnly Strict session, server actor/RBAC; HTTP tests; http.ts actor/login; config.ts; Workspace.tsx | http/integration-http/production-release | No implementation gap found in scoped audit; real provider activation separate |
| 28 | Order tracking | PARTIAL | Capability-bound checkout status and real fulfillment timeline; no ETA/courier map/push tracking; Shop.tsx CheckoutReturn; webCheckoutPublic | ux-states + checkout authoritative confirmation | See evidence; requires smallest next pass/business review |
| 29 | Apple Pay | BLOCKED EXTERNAL | Hosted Paymennt boundary capable of merchant-enabled methods; Apple Pay availability/domain/merchant enablement unverified; adapters/paymennt.ts; external-readiness.md | no real Apple Pay UAT | See evidence; requires smallest next pass/business review |
| 30 | Meta | BLOCKED EXTERNAL | Signed inbound challenge/status/source guards in existing code; approval/current account secrets not inspected; adapters/meta.ts; config.ts; runbook | integration-adapters/meta/policy + HTTP signatures | See evidence; requires smallest next pass/business review |
| 31 | MCP/ChatGPT | PARTIAL | Readonly 3 tools role protected; audits mutate audit only; remote OAuth/transport/account hookup absent; domain/mcp.ts; /api/mcp | master-sprint role/allowlist/redaction; no MCP HTTP/OAuth E2E | See evidence; requires smallest next pass/business review |
| 32 | Quality/security | PARTIAL | Current checks pass; real address coverage absent; stale UI serverNow may require retry but server rejects invalid schedule; http.ts; domain; secret-scan | type/lint/audit/scan + HTTP security regressions | See evidence; requires smallest next pass/business review |
| 33 | Testing | PARTIAL | 309 inventory broken down; missing new-option persistence, clear and full geographic UAT; tests/commerce; tests/checkout-e2e; tests/menu-e2e | inventory below | See evidence; requires smallest next pass/business review |
| 34 | Full E2E QA | PARTIAL | 19 checkout / 8 menu rerun mock-only; no real merchant payment performed by design; same | checkout 19/menu 8 simulated provider | See evidence; requires smallest next pass/business review |
| 35 | Visual QA | PARTIAL | Fresh side-by-side captures 390/768/1440; material P1/P2 differences remain; work/qa/post-audit | fresh comparative screenshots/metrics | See evidence; requires smallest next pass/business review |
| 36 | Prohibited actions | COMPLETE | No deploy/merge/prod data/provider calls; no customer data or real charges; git diff; isolated fixture runtime | isolated fixtures/logs/git | No implementation gap found in scoped audit; real provider activation separate |
| 37 | Git/review process | PARTIAL | Baseline local commits; no remote/PR; source branch correct; git log/remote | git log/status/remote | See evidence; requires smallest next pass/business review |
| 38 | Final report | COMPLETE | This numbered evidence matrix replaces prior unnumbered summary; docs/master-sprint | report review | No implementation gap found in scoped audit; real provider activation separate |

## Baseline test inventory

309 actual testcase entries from the JUnit reporter. These are regression counts, not 309 new feature proofs.

| File | Actual cases | Sprint mapping |
|---|---:|---|
| tests/commerce/activation-http.test.ts | 1 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/activation.test.ts | 21 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/ai-http.test.ts | 1 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/ai-provider.test.ts | 4 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/ai.test.ts | 30 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/billing-address.test.ts | 9 | 11,17–20,27–28,32–34 — pricing, scheduling, auth, hosted payment/superseding regressions |
| tests/commerce/brand.test.ts | 4 | 3–9,14–16,22–25,32–35 — brand/catalog/source assertions; not visual equivalence |
| tests/commerce/cleanup.test.ts | 6 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/delivery-pickup.test.ts | 11 | 11,17–20,27–28,32–34 — pricing, scheduling, auth, hosted payment/superseding regressions |
| tests/commerce/domain.test.ts | 16 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/ecommerce-checkout.test.ts | 16 | 11,17–20,27–28,32–34 — pricing, scheduling, auth, hosted payment/superseding regressions |
| tests/commerce/embedded-checkout.test.ts | 8 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/full-menu.test.ts | 3 | 3–9,14–16,22–25,32–35 — brand/catalog/source assertions; not visual equivalence |
| tests/commerce/http.test.ts | 2 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/integration-adapters.test.ts | 32 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/integration-http.test.ts | 1 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/live-release.test.ts | 4 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/master-sprint.test.ts | 14 | 14–20,31–33; 14 cases; catalog-only persistence assertion explicitly insufficient |
| tests/commerce/motion.test.ts | 7 | 3–9,14–16,22–25,32–35 — brand/catalog/source assertions; not visual equivalence |
| tests/commerce/paymennt-web.test.ts | 21 | 11,17–20,27–28,32–34 — pricing, scheduling, auth, hosted payment/superseding regressions |
| tests/commerce/persistence.test.ts | 2 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/policies.test.ts | 13 | 3–9,14–16,22–25,32–35 — brand/catalog/source assertions; not visual equivalence |
| tests/commerce/production-release.test.ts | 21 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/staging.test.ts | 24 | 32,33 — existing security/provider regressions; not proof of new UI completeness |
| tests/commerce/stale-checkout.test.ts | 10 | 11,17–20,27–28,32–34 — pricing, scheduling, auth, hosted payment/superseding regressions |
| tests/commerce/ux-states.test.ts | 7 | 27–28,34 — customer-facing states |
| tests/commerce/web-checkout-http.test.ts | 4 | 11,17–20,27–28,32–34 — pricing, scheduling, auth, hosted payment/superseding regressions |
| tests/commerce/web-checkout.test.ts | 17 | 11,17–20,27–28,32–34 — pricing, scheduling, auth, hosted payment/superseding regressions |

Browser 19: checkout.spec.ts 3; delivery-pickup.spec.ts 2; stale-checkout.spec.ts 4; ux-states.spec.ts 10. Menu 8: category purchase, current sizes/fillings, multicart, invalid price gating, three viewport axe/console/no-provider scenarios, offline-payment catalog. Dedicated gaps: clear confirmation, Arabic suite, full new Pan variant persistence through dashboard, address change after verification, real map/merchant UAT.

## Configured areas

All 93 active seed entries currently have freeDelivery=true and fee=0. No zoneSeed polygon or private verified address file is present. Rows do not assert current live database equivalence.

| Area | Minimum AED | Source / configuration | Address validation available? | Boundary available? |
|---|---:|---|---|---|
| JLT Cluster O | 30 | server/domain/zones.ts / jlt-cluster-o | Adapter only; no approved data in repo | No |
| JLT Cluster P | 30 | server/domain/zones.ts / jlt-cluster-p | Adapter only; no approved data in repo | No |
| JLT Cluster Q | 30 | server/domain/zones.ts / jlt-cluster-q | Adapter only; no approved data in repo | No |
| JLT Cluster R | 30 | server/domain/zones.ts / jlt-cluster-r | Adapter only; no approved data in repo | No |
| JLT Cluster S | 30 | server/domain/zones.ts / jlt-cluster-s | Adapter only; no approved data in repo | No |
| JLT Cluster T | 30 | server/domain/zones.ts / jlt-cluster-t | Adapter only; no approved data in repo | No |
| JLT Cluster U | 30 | server/domain/zones.ts / jlt-cluster-u | Adapter only; no approved data in repo | No |
| JLT Cluster V | 30 | server/domain/zones.ts / jlt-cluster-v | Adapter only; no approved data in repo | No |
| JLT Cluster W | 30 | server/domain/zones.ts / jlt-cluster-w | Adapter only; no approved data in repo | No |
| JLT Cluster X | 30 | server/domain/zones.ts / jlt-cluster-x | Adapter only; no approved data in repo | No |
| JLT Cluster Y | 30 | server/domain/zones.ts / jlt-cluster-y | Adapter only; no approved data in repo | No |
| One JLT | 30 | server/domain/zones.ts / one-jlt | Adapter only; no approved data in repo | No |
| Mazaya | 30 | server/domain/zones.ts / mazaya | Adapter only; no approved data in repo | No |
| Taj Residence | 30 | server/domain/zones.ts / taj-residence | Adapter only; no approved data in repo | No |
| Jumeirah Island | 50 | server/domain/zones.ts / jumeirah-island | Adapter only; no approved data in repo | No |
| The Gardens | 50 | server/domain/zones.ts / the-gardens | Adapter only; no approved data in repo | No |
| Discovery Gardens | 50 | server/domain/zones.ts / discovery-gardens | Adapter only; no approved data in repo | No |
| Springs | 50 | server/domain/zones.ts / springs | Adapter only; no approved data in repo | No |
| Meadows | 50 | server/domain/zones.ts / meadows | Adapter only; no approved data in repo | No |
| Emirates Hills | 50 | server/domain/zones.ts / emirates-hills | Adapter only; no approved data in repo | No |
| The Lakes | 50 | server/domain/zones.ts / the-lakes | Adapter only; no approved data in repo | No |
| The Greens | 50 | server/domain/zones.ts / the-greens | Adapter only; no approved data in repo | No |
| Jumeirah Park | 50 | server/domain/zones.ts / jumeirah-park | Adapter only; no approved data in repo | No |
| Jumeirah Heights | 50 | server/domain/zones.ts / jumeirah-heights | Adapter only; no approved data in repo | No |
| JVT | 50 | server/domain/zones.ts / jvt | Adapter only; no approved data in repo | No |
| Al Furjan | 50 | server/domain/zones.ts / al-furjan | Adapter only; no approved data in repo | No |
| Jebel Ali 2 | 50 | server/domain/zones.ts / jebel-ali-2 | Adapter only; no approved data in repo | No |
| Jebel Ali Village | 50 | server/domain/zones.ts / jebel-ali-village | Adapter only; no approved data in repo | No |
| The Hills | 50 | server/domain/zones.ts / the-hills | Adapter only; no approved data in repo | No |
| Vida The Hills | 50 | server/domain/zones.ts / vida-the-hills | Adapter only; no approved data in repo | No |
| JBR | 50 | server/domain/zones.ts / jbr | Adapter only; no approved data in repo | No |
| Marina | 50 | server/domain/zones.ts / marina | Adapter only; no approved data in repo | No |
| JVC | 100 | server/domain/zones.ts / jvc | Adapter only; no approved data in repo | No |
| Internet City | 100 | server/domain/zones.ts / internet-city | Adapter only; no approved data in repo | No |
| Media City | 100 | server/domain/zones.ts / media-city | Adapter only; no approved data in repo | No |
| Barsha Heights | 100 | server/domain/zones.ts / barsha-heights | Adapter only; no approved data in repo | No |
| Palm Jumeirah - Shoreline | 100 | server/domain/zones.ts / palm-jumeirah-shoreline | Adapter only; no approved data in repo | No |
| Palm Jumeirah - Golden Mile | 100 | server/domain/zones.ts / palm-jumeirah-golden-mile | Adapter only; no approved data in repo | No |
| Al Barsha 1 | 100 | server/domain/zones.ts / al-barsha-1 | Adapter only; no approved data in repo | No |
| Knowledge Village | 100 | server/domain/zones.ts / knowledge-village | Adapter only; no approved data in repo | No |
| Knowledge Park | 100 | server/domain/zones.ts / knowledge-park | Adapter only; no approved data in repo | No |
| Al Sufouh 2 | 100 | server/domain/zones.ts / al-sufouh-2 | Adapter only; no approved data in repo | No |
| Secret Beach | 100 | server/domain/zones.ts / secret-beach | Adapter only; no approved data in repo | No |
| Dubai Hills | 150 | server/domain/zones.ts / dubai-hills | Adapter only; no approved data in repo | No |
| Al Quoz | 150 | server/domain/zones.ts / al-quoz | Adapter only; no approved data in repo | No |
| IMPZ / Dubai Production City | 150 | server/domain/zones.ts / impz-d-production-city | Adapter only; no approved data in repo | No |
| Al Barsha South | 150 | server/domain/zones.ts / al-barsha-south | Adapter only; no approved data in repo | No |
| Jumeirah Golf Estate | 150 | server/domain/zones.ts / jumeirah-golf-estate | Adapter only; no approved data in repo | No |
| Motorcity | 150 | server/domain/zones.ts / motorcity | Adapter only; no approved data in repo | No |
| Sports City | 150 | server/domain/zones.ts / sports-city | Adapter only; no approved data in repo | No |
| Jebel Ali | 150 | server/domain/zones.ts / jebel-ali | Adapter only; no approved data in repo | No |
| Al Barsha 2 | 150 | server/domain/zones.ts / al-barsha-2 | Adapter only; no approved data in repo | No |
| Al Barsha 3 | 150 | server/domain/zones.ts / al-barsha-3 | Adapter only; no approved data in repo | No |
| Al Sufouh 1 | 150 | server/domain/zones.ts / al-sufouh-1 | Adapter only; no approved data in repo | No |
| Umm Suqeim 3 | 150 | server/domain/zones.ts / umm-suqeim-3 | Adapter only; no approved data in repo | No |
| Victory Heights | 150 | server/domain/zones.ts / victory-heights | Adapter only; no approved data in repo | No |
| Palm Jumeirah - West Crescent | 150 | server/domain/zones.ts / palm-jumeirah-west-crescent | Adapter only; no approved data in repo | No |
| Palm Jumeirah - East Crescent | 150 | server/domain/zones.ts / palm-jumeirah-east-crescent | Adapter only; no approved data in repo | No |
| Studio City | 150 | server/domain/zones.ts / studio-city | Adapter only; no approved data in repo | No |
| Al Wasl Road | 200 | server/domain/zones.ts / al-wasl-road | Adapter only; no approved data in repo | No |
| Al Safa | 200 | server/domain/zones.ts / al-safa | Adapter only; no approved data in repo | No |
| Arabian Ranches | 200 | server/domain/zones.ts / arabian-ranches | Adapter only; no approved data in repo | No |
| Umm Suqeim 2 | 200 | server/domain/zones.ts / umm-suqeim-2 | Adapter only; no approved data in repo | No |
| Umm Suqeim 1 | 200 | server/domain/zones.ts / umm-suqeim-1 | Adapter only; no approved data in repo | No |
| Al Manara | 200 | server/domain/zones.ts / al-manara | Adapter only; no approved data in repo | No |
| JAFZA | 200 | server/domain/zones.ts / jafza | Adapter only; no approved data in repo | No |
| DIP | 200 | server/domain/zones.ts / dip | Adapter only; no approved data in repo | No |
| Green Community DIP | 200 | server/domain/zones.ts / green-community-dip | Adapter only; no approved data in repo | No |
| Damac Hills | 250 | server/domain/zones.ts / damac-hills | Adapter only; no approved data in repo | No |
| Sustainable City | 250 | server/domain/zones.ts / sustainable-city | Adapter only; no approved data in repo | No |
| Jumeirah 3 | 300 | server/domain/zones.ts / jumeirah-3 | Adapter only; no approved data in repo | No |
| Jumeirah 2 | 300 | server/domain/zones.ts / jumeirah-2 | Adapter only; no approved data in repo | No |
| Jumeirah 1 | 300 | server/domain/zones.ts / jumeirah-1 | Adapter only; no approved data in repo | No |
| Satwa | 300 | server/domain/zones.ts / satwa | Adapter only; no approved data in repo | No |
| Deira | 300 | server/domain/zones.ts / deira | Adapter only; no approved data in repo | No |
| Downtown | 300 | server/domain/zones.ts / downtown | Adapter only; no approved data in repo | No |
| Jebel Ali Downtown | 300 | server/domain/zones.ts / jebel-ali-downtown | Adapter only; no approved data in repo | No |
| Kitebeach | 300 | server/domain/zones.ts / kitebeach | Adapter only; no approved data in repo | No |
| Festival City | 300 | server/domain/zones.ts / festival-city | Adapter only; no approved data in repo | No |
| Dubai South | 300 | server/domain/zones.ts / dubai-south | Adapter only; no approved data in repo | No |
| Remraam | 300 | server/domain/zones.ts / remran | Adapter only; no approved data in repo | No |
| Expo Site | 300 | server/domain/zones.ts / expo-site | Adapter only; no approved data in repo | No |
| D3 District | 300 | server/domain/zones.ts / d3-district | Adapter only; no approved data in repo | No |
| DIFC | 300 | server/domain/zones.ts / difc | Adapter only; no approved data in repo | No |
| Nad Al Sheeba | 300 | server/domain/zones.ts / nad-al-sheeba | Adapter only; no approved data in repo | No |
| Mudon | 300 | server/domain/zones.ts / mudon | Adapter only; no approved data in repo | No |
| Port Rashid | 300 | server/domain/zones.ts / port-rashid | Adapter only; no approved data in repo | No |
| Al Badda | 300 | server/domain/zones.ts / al-badda | Adapter only; no approved data in repo | No |
| Villa Nova | 300 | server/domain/zones.ts / villa-nova | Adapter only; no approved data in repo | No |
| Burj Al Arab | 300 | server/domain/zones.ts / burj-al-arab | Adapter only; no approved data in repo | No |
| JLT Cluster B | 30 | server/domain/zones.ts / jlt-cluster-b | Adapter only; no approved data in repo | No |
| JLT Cluster C | 30 | server/domain/zones.ts / jlt-cluster-c | Adapter only; no approved data in repo | No |
| JLT Cluster D | 30 | server/domain/zones.ts / jlt-cluster-d | Adapter only; no approved data in repo | No |

Missing named communities visible on the business screenshot: Al Aweer, Ud al Bayda, Al Lisaili, Margham, Murquab, Palm Jebel Ali. Their required coverage and minimums are unknown. Sharjah label is not an approval to deliver in Sharjah. This is not an exhaustive census of missing Dubai areas. The red mark cannot safely be assigned a community name.

## Phase A conclusion

The earlier high-fidelity claim was too broad. Current design is a reference-inspired implementation with material discrepancies. The geographic implementation is a fail-closed reviewed-address registry foundation, not arbitrary address geocoding. Exact primary/exclusion data do not exist in this checkout or seed. Classify map decision B: architecture can be prepared but exact polygon needs business input. No coordinates will be extracted from screenshot pixels.

## Visual audit — current-run evidence

Same CSS widths/density (1x): 390×844, 768×900, 1440×900. Source autoplay and current paused poster differ in video frame; that is not a crop defect by itself. Lazy images were deliberately brought into view before accepted full-page captures. Earlier unloaded-image measurements were discarded; loaded photos do appear. Full-page screenshots can contain a sticky header at the current scroll position; do not interpret that capture artifact as a broken section.

| Finding | Severity | Evidence | Smallest fix (not applied in audit) |
|---|---|---|---|
| Mobile bridge repeats the combined Mexico/Dubai illustration twice rather than separate cities; journey/whisk/stars and labels absent | P1 | compare-bridge-390.png | Reuse approved assets with correct crop and reference spacing |
| Tradition text is dark instead of cream, panel uses muted lavender instead of reference blush, arrow/divider treatment absent | P1 | compare-tradition-390/768.png | Correct reference-specific color/typography/CTA tokens |
| Mobile tradition slices stack vertically rather than reference overlapping cluster; tablet region is 890px vs 456px | P1 | compare-tradition-390/768.png | Restore responsive cluster proportions with actual assets |
| Tablet hero 612px vs 522px; navigation collapses to hamburger at 768 though reference shows links; logo materially larger at 390/768 | P2 | compare-home-390/768.png | Align breakpoint, hero height and mobile logo scale |
| Family collage differs: tape/vanilla missing, photo scale/offset changed, CTA brown instead of blush; text paragraphs too compressed | P2 | compare-family-1440.png | Match approved collage placement and text margins |
| Featured and bridge section rhythm differs at all widths | P2 | measured section heights below | Match reference gaps/section min heights after imagery correction |
| Official Abril/Montserrat differs from reference Playfair/smaller nav optical weight | Intentional typography priority + P2 spacing | title metrics / screenshots | Keep identity fonts, adjust line breaks/size/weight/leading to reference |
| Web cart/support replace WhatsApp ordering, legal footer kept, unfinished source placeholders omitted | Intentional | header/footer/Root/Experience | Preserve authorized ecommerce flow and compliance |
| Reference scroll reveal/preloader not duplicated; current video explicit play and offscreen pause | Intentional safety/performance | Experience.tsx | Do not add a blocking preloader; review restrained motion separately |

Five completed source sections remain in the same semantic order. Cream/beige predominates but high visual fidelity has NOT passed. No visual fixes in this pass.

| Width | Section | Reference height | Current loaded height |
|---|---|---:|---:|
| 390 | Hero | 748 | 736 |
| 390 | Bridge | 1638 | 1037 |
| 390 | Featured | 1427 | 1716 |
| 390 | Tradition | 910 | 994 |
| 390 | Family | 1249 | 1156 |
| 768 | Hero | 522 | 612 |
| 768 | Bridge | 866 | 784 |
| 768 | Featured | 726 | 822 |
| 768 | Tradition | 456 | 890 |
| 768 | Family | 1350 | 776 |
| 1440 | Hero | 612 | 612 |
| 1440 | Bridge | 1154 | 1028 |
| 1440 | Featured | 931 | 1007 |
| 1440 | Tradition | 890 | 890 |
| 1440 | Family | 998 | 1055 |
