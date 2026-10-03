# 3L post-implementation audit and safe delivery coverage foundation

Date: 2026-10-03 (Asia/Dubai). Canonical repository: `/Users/rodrigom./code/tres-leches-demo`. Branch: `feature/3l-master-delivery-storefront`. Phase A baseline: `f471a0802d85a39cf105c6e8cbb75499147d5e7f`.

**Audit complete; sprint is not fully complete.** Original requirements: **20 COMPLETE, 16 PARTIAL, 2 BLOCKED EXTERNAL, 1 NEEDS BUSINESS INPUT** (39 rows, numbered 0–38). Homepage high-fidelity acceptance is blocked by the documented visual discrepancies. Code foundation is tested; real geographic activation remains **NEEDS BUSINESS INPUT**. No deploy, merge, production database/configuration change, real payment, Paymennt request or Meta request occurred in this pass. Reference website reads and dependency audit are not provider calls.

Phases were ordered: inspect/run current HEAD and capture baseline → inspect available geography → implement only reusable coverage foundation. No visual corrections or unrelated features were implemented. The complete Phase A matrix, 93-area inventory, baseline test breakdown and measured visual findings follow the implementation/report sections below; the separate `post-implementation-audit.md` retains their baseline scope.

## Local Git delivery

Safe foundation commit: `e44180d` (`feat(delivery): validate private primary and exclusion coverage`). Documentation is committed separately after this code commit. Baseline implementation/security/docs commits remain in history; no merge, push or deployment. No remote is configured. Screenshot artifacts remain local and ignored; all 44 indexed paths were checked to exist.

## Delivery architecture — actual implementation

Address + building → private verified coordinates → PRIMARY coverage → EXCLUSION rejection → exactly one active pricing-zone polygon → authoritative zone/minimum → cart validation → future Dubai date → minimum notice at window start → configured time window → hosted checkout.

| Stage | Frontend | Backend/source of truth | Failure behavior | Evidence/tests |
|---|---|---|---|---|
| Address | Customer enters address/building; selected area is provisional | `POST /api/checkout/address`, `website-address.ts`: exact normalized private registry lookup | 422 unverified message; no payment created | master-sprint registry tests; coverage tests |
| Location | No customer coordinates accepted as authority | `DELIVERY_VERIFIED_ADDRESSES_FILE` stores verified lat/lng; no automatic forward geocoding | Missing registry entry fails closed | unknown-address unit; no real geocoder UAT |
| Main/excluded coverage | Customer sees a delivery error, not polygon terminology | New `delivery-coverage.ts` reads reviewed private GeoJSON before pricing zones | Outside/excluded: “This address is outside our current delivery coverage area.”; missing map: unverified | coverage cases 1–3, 6–10 |
| Area | Address endpoint can correct displayed area and request review | Exactly one active `state.zones` polygon must contain verified point | Zero/overlapping zones rejected; create/resume reject forged claimed area | coverage forged create/resume + existing registry tests |
| Minimum/cart | Zone minimum, shortfall and fee displayed/recalculated | Stored catalog/prices + actual zone via existing quote; server rejects insufficient amount | No provider request or order/payment mutation on rejection | domain/delivery-pickup + far-zone minimum test |
| Date | Tomorrow minimum and shared availability checks | Server current time, valid date and existing maximum 60-day horizon | Same-day/invalid/out-of-range rejected | master-sprint, delivery-pickup |
| Notice | Shared `validWindow` based on config `serverNow` | Fresh server time; at least 12h; Mango cakes/gelatinas/Rosca at least 24h | Invalid window rejected even if stale browser shows it | shared-policy boundary tests |
| Window | Three configured labels displayed | Exact allowlist from `shared/commerce-policy.ts`; obsolete values rejected | 422 before hosted checkout | obsolete Afternoon test; checkout browser |
| Checkout | Existing hosted Paymennt redirect/reconciliation | Existing create/resume, fingerprint, frozen-order and payment authority code | Recoverable existing errors; query string never marks Paid | 19 checkout browser; payment/stale-checkout suites |

The dropdown cannot retain a cheaper minimum: `/api/checkout/address` derives the actual zone from the server-owned coordinates, returns `{zoneId,name,minOrderAed,corrected}`, and frontend correction requires review. Create **and resume** independently resolve the address again and reject a mismatching claimed zone before financial mutation or provider call. New tests verify unchanged whole state and zero mocked provider calls after forged/excluded/outside requests. A request with the correct farther zone still fails its higher minimum. Early dropdown quotes are only estimates, not address authorization.

“Unverified addresses are blocked” means **not in a trusted exact address/building registry, no approved coverage, outside coverage, inside an exclusion, or no unique pricing polygon**. An area name typed in free text is not proof. Coordinates currently live in the private server registry and memory; this pass does not add an order-level coordinate/provenance snapshot. No real address registry or precise polygons were present in the inspected repository. Production DB and Railway private files were deliberately not queried, so their contents are not asserted.

The existing reverse Mapbox boundary for operational GPS is not a forward geocoder for arbitrary website text. The registry is a limited deployment option, not automatic Dubai address coverage. Pickup bypasses delivery geography/minimum but keeps applicable schedule, customer and billing checks. A test uses an excluded-location billing address with pickup and reaches only a mocked hosted checkout.

Risks requiring follow-up: exact-match spelling/building false negatives; the current shared normalizer strips non-ASCII characters (Arabic addresses can collide/lose meaning); incorrect trusted coordinates could misclassify an address; boundary uncertainty and overlapping price zones need business review; no proof of physical customer location/address ownership. Duplicate normalized registry keys fail startup, but that alone does not eliminate normalization collisions in incoming text. Address API availability is coupled to checkout-enabled configuration. UI `serverNow` is a snapshot and may become stale; the backend still rejects an invalid slot. These are recorded gaps, not silently fixed outside scope.

## Schedule verification

Business timezone is exactly `Asia/Dubai`; date comparisons use `Intl` and window instants use `+04:00`. No browser-local timezone determines eligibility. Current implementation assumes Dubai's fixed UTC+4 offset; there is no seasonal DST adjustment in this policy.

Both conditions are mandatory: selected date is **later than today** AND elapsed time to the **start** of the selected window is >= required hours.

| Dubai order time | Requested window next date unless noted | Elapsed | Actual shared function result |
|---|---|---:|---|
| 23:00 | 08:00–13:00 | 9h | reject |
| 19:00 | 08:00–13:00 | 13h | allow for 12h items |
| 20:00 | 13:00–16:00 | 17h | allow for 12h items |
| 23:59 | 08:00–13:00 | 8h 1m | reject |
| 00:01 | 16:00–21:00 same day | 15h 59m | reject: same day |
| 00:01 | 08:00–13:00 next day | 31h 59m | allow |

These deterministic examples were evaluated locally; not delivery promises or real order submissions. Only `8:00 AM – 1:00 PM`, `1:00 PM – 4:00 PM`, `4:00 PM – 9:00 PM` exist in the normal server configuration. A legacy frontend free-text fallback if config slots are empty remains, but server validation still rejects any other value. Special 24h products do not inherit a global 24h rule for the rest of the menu.

## Map decision and implementation

**B. ARCHITECTURE CAN BE PREPARED BUT EXACT POLYGON NEEDS BUSINESS INPUT.** The attached dotted outline is the intended main coverage; the hand-marked red section is an exclusion. No precise coordinates were inferred from pixels. Repository inspection found zone rates and polygon interfaces/test fixtures, but no approved primary/exclusion geometry or complete price-zone boundaries. Screenshot labels alone do not approve new communities/minimums.

New optional `DELIVERY_COVERAGE_FILE` loads one private GeoJSON FeatureCollection at startup: one primary Polygon/MultiPolygon, zero or more exclusion Polygon/MultiPolygon features. Eligibility is inside primary AND outside every exclusion. Polygon holes and separate islands are supported. Main exterior edge is included; exclusion edges/vertices are rejected. Hole boundaries follow the excluded-hole treatment of the polygon. These deterministic edge semantics need approval against real boundary data.

Strict schema rejects unknown fields, duplicate IDs, multiple/no primary feature, nonfinite/out-of-range points, unclosed/degenerate/self-intersecting rings, invalid/touching/overlapping holes and antimeridian-spanning rings. File limit 1MiB. Missing configuration fails closed; malformed configured file fails startup instead of silently removing an exclusion. This is a local planar containment implementation for reviewed Dubai geometry, not a replacement for GIS validation/survey precision. MultiPolygon components use union semantics; authoritative GIS topology must be checked before activation.

Configuration changes require a server restart, but no checkout-code rewrite. No production GeoJSON file, environment value, admin map editor or paid geocoding service was added. Price-zone data remain separate from broad coverage: being inside the large outline does not authorize an unknown minimum. Contract and activation prerequisites: [coverage-configuration.md](coverage-configuration.md).

Exact geographic inputs needed:

1. Approved main boundary in WGS84 GeoJSON Polygon/MultiPolygon with closed `[longitude, latitude]` rings, including island/coast treatment.
2. Exact closed red-exclusion polygon(s), owner-approved boundary semantics; a scribble/screenshot is insufficient.
3. Approved pricing-zone polygons tied to the existing zone IDs; resolve overlaps/gaps before activation.
4. Verified full address + building + coordinates with data provenance, or approval for a specific forward-geocoder integration. A map alone cannot locate typed addresses.
5. Minimums/coverage decisions for any additional communities to include; no values invented.

## Menu, Pan de Muerto and customer journey

Homepage renders editorial highlights, not the complete catalog. `/menu` owns eight categories and imports the shared normalized menu; availability and price agreement are gated by server config. Product selection is inline family/variant selection rather than a separate product-detail route. Browsing, selectors and multivariant cart behavior pass browser tests at mobile/desktop sizes. Exact photography for every flavour is not available; family crops are not represented as guaranteed variant-specific photography.

Pan single SKUs are available October 15–November 15 inclusive by Dubai **ordering date**; packs remain available year-round. Half Dozen/Dozen labels and descending price ordering are implemented. Owner-confirmed same-size pricing supports 16 new pistachio/chocolate single variants; candidate catalog has 234 options, preserving prior 218 prices. No catalog import occurred. Existing catalog assertion checks SKU/value/order only: despite its title, it does not prove each new selection survives through persisted order and dashboard. That requirement stays PARTIAL. No invented pack assortment selectors.

Quantity change was manually observed (AED340→680) and existing integer bounds are tested. Clear Cart implementation/confirmation is present, but this audit did not complete a reliable browser confirmation assertion; not marked verified. Thumbnails, minimums, schedule and existing hosted card flow remain covered by regression tests; no real cards/charges used.

Customer support uses international `+971585943319`, discreet fixed **left** WhatsApp placement. Ordering remains Product → Cart → Web Checkout → hosted Paymennt. Paid-order internal alerts in `server/domain/notifications.ts` target the separate Liza operations recipient `+971521683319`; source/template/outbound gates remain intact. No global number replacement or notification activation was performed.

## Dashboard, tracking, languages and integrations

Production/staging/integration HTTP paths enforce existing actor/session/RBAC checks. Passwords use the existing scrypt verification; session cookies are HttpOnly/Secure/SameSite Strict in protected deployments. Static operations shell availability is not authorization to read orders. Local development has an intentional actor shortcut outside protected modes; do not expose that mode as production. No new credentials or secret-bearing UI were created.

“Shopify-style tracking” currently means capability-protected status/confirmation with the actual stored order/payment and fulfillment timeline, not a new customer account portal. Pickup timeline is Confirmed → Preparing → Ready for pickup → Collected; delivery follows its existing operational states. Provider query-string outcomes are not payment authority. Existing reconciliation/paid immutability tests and simulated confirmation views pass. Courier GPS, ETA and push tracking are NOT IMPLEMENTED.

English is the current complete working UI. Arabic infrastructure comprises a persisted switcher, document RTL and six general navigation resources. Most catalog, checkout, validation, guidance and sensitive copy remains English; RTL layout and customer-facing translations need full review. This is not a completed Arabic storefront.

Apple Pay: no dedicated implementation/button or real merchant UAT was added. Existing hosted Paymennt checkout can present provider-enabled methods without browser card handling changes, but **this merchant's Apple Pay availability is unverified**. Domain verification, provider entitlement and any merchant-side setup have no evidence in this audit; require Paymennt confirmation and controlled UAT. No assumption that embedded-domain requirements apply identically to hosted checkout. Existing external-readiness references are guidance, not proof of current account approval.

Meta: existing challenge/signature/idempotency/source/window gates remain covered by adapter/HTTP/policy regressions. No live approval status or configured secrets were queried. External readiness must be checked separately; this audit cannot say Meta approved/rejected the account. Activation requires verified business/app/WABA/number ownership, access permissions, `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, real mappings in `META_NUMBERS_JSON`, webhook subscription/templates and controlled inbound/outbound UAT. Runtime currently consumes the JSON mappings rather than separate WA1/WA2/WA3 placeholders. Keep outbound disabled until explicitly authorized. No production configuration change.

MCP is implemented as a limited disabled-by-default `/api/mcp` JSON-RPC facade, not merely a design document. Three tools: `catalog_list`, `orders_list`, `order_status`. Admin/manager actor plus existing same-origin/session authorization; allowlisted outputs exclude customer PII, secrets and payment records. Tools do not write commerce data, but append a read audit entry. No order/payment write tools. `MCP_ENABLED=false` remains the example default. Remote OAuth, protocol/notification/header conformance and Lisa/ChatGPT account setup are NOT IMPLEMENTED; no external account connected. Raw catalog availability is not proof of seasonal storefront availability.

## Security and final validation

| Command/check | Baseline Phase A | Final after safe foundation |
|---|---|---|
| `npm run typecheck` | pass | pass |
| `npm run lint` | pass | pass |
| `node --import tsx --test --test-reporter=junit tests/commerce/*.test.ts` | 309 pass | **319 pass, 0 failure/error** |
| `npx playwright test --config playwright.checkout.config.ts` | 19 pass | **19 pass** |
| `npx playwright test --config playwright.menu.config.ts` | **8 pass** | reused same-pass baseline; UI unchanged in Phase C |
| `npm run build` | pass | pass |
| `npm run test:sites` | 4 pass | **4 pass** |
| `npm run audit` | 0 vulnerabilities | **0 vulnerabilities** |
| `npm run scan:secrets` | 256 files, 0 findings | **260 files, 0 findings** including final report additions |

Secret scan is heuristic over tracked/unignored source and built client bundle, not proof about all historical commits or remote private storage. Backend auth/signature/origin/redaction regressions passed. Private registry stays server-only and should never be committed. User PII in ordinary operational storage remains protected by existing authorization; this pass is not a retention-policy audit. Geography rejection tests check no order/payment changes and no mocked provider calls. No production provider calls occurred.

Build reports existing pending business-copy fields (email, support hours, policy issue/lead/delivery/failed-delivery copy) and a Node experimental localStorage warning. They do not fail the build; reconciliation between approved scheduling and unfilled policy copy should be reviewed rather than inventing legal text.

New `delivery-coverage.test.ts` adds **10** deterministic tests: valid delivery; exclusion create/resume; outside create/resume; real farther zone + forged cheaper zone + minimum; pickup despite excluded billing address; missing map; boundary semantics; holes/islands; invalid schema/topology; invalid file startup. Synthetic coordinates live only in tests/temp files. Hosted checkout is an injected fake fetch returning Pending, never an external request. These domain/service integration tests do not prove actual Dubai coordinates or a browser exclusion error end-to-end. Existing 14 master-sprint cases retain one registry test updated to supply explicit test coverage.

Evidence logs are local `/tmp/3l-post-audit/{baseline-tests.xml,final-tests.xml,baseline-checkout.txt,final-checkout.txt,baseline-menu.txt}`; screenshots are local ignored artifacts and are indexed below. Retain/export artifacts if moving the repository to another machine.

## Screenshot index

Fresh isolated local captures; width in CSS pixels, reference comparisons at 1× density. Paths relative to canonical repo. Mock confirmation is not a real paid order.

| Route | Viewport width | Purpose | File path |
|---|---:|---|---|
| reference / | 390 | Homepage home reference | work/qa/post-audit/reference-home-390.png |
| / | 390 | Homepage home current | work/qa/post-audit/current-home-390.png |
| reference / | 390 | Homepage full reference | work/qa/post-audit/reference-full-390.png |
| / | 390 | Homepage full current | work/qa/post-audit/current-full-390.png |
| / vs reference / | 390 | Side-by-side home | work/qa/post-audit/compare-home-390.png |
| / vs reference / | 390 | Side-by-side bridge | work/qa/post-audit/compare-bridge-390.png |
| / vs reference / | 390 | Side-by-side tradition | work/qa/post-audit/compare-tradition-390.png |
| / vs reference / | 390 | Side-by-side family | work/qa/post-audit/compare-family-390.png |
| /menu | 390 | Menu categories | work/qa/post-audit/cakes-390.png |
| /menu | 390 | Inline product selector | work/qa/post-audit/product-390.png |
| /cart | 390 | Cart | work/qa/post-audit/cart-390.png |
| /checkout | 390 | Checkout | work/qa/post-audit/checkout-390.png |
| reference / | 768 | Homepage home reference | work/qa/post-audit/reference-home-768.png |
| / | 768 | Homepage home current | work/qa/post-audit/current-home-768.png |
| reference / | 768 | Homepage full reference | work/qa/post-audit/reference-full-768.png |
| / | 768 | Homepage full current | work/qa/post-audit/current-full-768.png |
| / vs reference / | 768 | Side-by-side home | work/qa/post-audit/compare-home-768.png |
| / vs reference / | 768 | Side-by-side bridge | work/qa/post-audit/compare-bridge-768.png |
| / vs reference / | 768 | Side-by-side tradition | work/qa/post-audit/compare-tradition-768.png |
| / vs reference / | 768 | Side-by-side family | work/qa/post-audit/compare-family-768.png |
| /menu | 768 | Menu categories | work/qa/post-audit/cakes-768.png |
| /menu | 768 | Inline product selector | work/qa/post-audit/product-768.png |
| /cart | 768 | Cart | work/qa/post-audit/cart-768.png |
| /checkout | 768 | Checkout | work/qa/post-audit/checkout-768.png |
| reference / | 1440 | Homepage home reference | work/qa/post-audit/reference-home-1440.png |
| / | 1440 | Homepage home current | work/qa/post-audit/current-home-1440.png |
| reference / | 1440 | Homepage full reference | work/qa/post-audit/reference-full-1440.png |
| / | 1440 | Homepage full current | work/qa/post-audit/current-full-1440.png |
| / vs reference / | 1440 | Side-by-side home | work/qa/post-audit/compare-home-1440.png |
| / vs reference / | 1440 | Side-by-side bridge | work/qa/post-audit/compare-bridge-1440.png |
| / vs reference / | 1440 | Side-by-side tradition | work/qa/post-audit/compare-tradition-1440.png |
| / vs reference / | 1440 | Side-by-side family | work/qa/post-audit/compare-family-1440.png |
| /menu | 1440 | Menu categories | work/qa/post-audit/cakes-1440.png |
| /menu | 1440 | Inline product selector | work/qa/post-audit/product-1440.png |
| /cart | 1440 | Cart | work/qa/post-audit/cart-1440.png |
| /checkout | 1440 | Checkout | work/qa/post-audit/checkout-1440.png |
| /checkout | 390 | Delivery fields/minimum | work/qa/post-audit/delivery-390.png |
| /checkout | 390 | Pickup form | work/qa/post-audit/pickup-390.png |
| /checkout | 390 | Pickup review | work/qa/post-audit/pickup-review-390.png |
| /checkout/return | 390 | Mock paid confirmation/tracking | work/qa/post-audit/paid-confirmation-390.png |
| /checkout | 1440 | Delivery fields/minimum | work/qa/post-audit/delivery-1440.png |
| /checkout | 1440 | Pickup form | work/qa/post-audit/pickup-1440.png |
| /checkout | 1440 | Pickup review | work/qa/post-audit/pickup-review-1440.png |
| /checkout/return | 1440 | Mock paid confirmation/tracking | work/qa/post-audit/paid-confirmation-1440.png |

Missing: browser screenshot of the new actual coverage rejection (domain/service tests only); real Dubai boundary/price-zone UAT; full new Pan-option-to-dashboard sequence; complete Arabic flow; real Apple Pay/Meta UAT. Current delivery captures show fixture forms/minimums, not approved production geographic validation. Other eight category captures remain in `work/qa/master-sprint/` and were refreshed by the menu suite.

## Full baseline audit appendix

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

## Final gap analysis

### A. COMPLETE AND VERIFIED

Menu separation/category browsing; authoritative server catalog/price gating; existing quantity, thumbnails, hosted checkout and frozen-order regressions; Dubai next-day AND notice policy and three windows; season/pack rules and descending prices; support-only left WhatsApp; protected-deployment auth/RBAC. Safe primary/exclusion configuration and domain rejection tests are complete **as a foundation**, with no geographic activation claim. Audit matrix, visual comparison and zone/test inventories completed.

### B. IMPLEMENTED BUT NEEDS REVIEW

Homepage visual fidelity (P1/P2 differences); full new Pan option persistence to dashboard; Clear Cart confirmation regression; stale browser scheduling clock; exact-match address normalization and provenance; limited tracking scope; Arabic/RTL foundation; MCP facade. Passing tests do not close these coverage or product gaps.

### C. BLOCKED / NEEDS BUSINESS INPUT

Precise primary/red-exclusion GeoJSON, 93 price-zone polygons and verified addresses/approved geocoder; additional community rates; original identity manual for reinspection; approved Arabic sensitive copy; Apple Pay merchant/domain readiness; actual Meta approval/values and UAT; Git remote and PR base. No current production geometry/account state was asserted.

### D. NOT IMPLEMENTED

Arbitrary-address forward geocoding; admin coverage-map editing; order coordinate/provenance snapshot; complete Arabic catalog/checkout translations; exact photography for every SKU; courier GPS/ETA/push/account tracking; production remote MCP OAuth/transport/account connection; automated Clear Cart/new Pan end-to-end persistence/Arabic browser scenarios. These are missing implementations or test coverage, not necessarily all mandatory features for the next release.

## Smallest recommended next pass — not executed

1. Delivery/checkout assurance: Unicode-safe address matching, invalid/changed address and forged-area HTTP/browser tests; persist reviewed location provenance as appropriate; refresh stale schedule clock; add Clear Cart and new Pan selection → stored order → dashboard regression. Keep payment adapter/state logic unchanged.
2. Geographic activation only after approved inputs: validate/import exact primary/exclusion and price-zone data, then reviewed inside/outside/border cases. Registry vs forward geocoder is an explicit business/service decision, not a paid service silently added.
3. Homepage fidelity only: fix evidenced mobile bridge, tradition cluster/colors, tablet header/hero and family collage/spacing, preserving ecommerce/support/legal behavior.
4. Customer UX: approved Arabic content/RTL review and available product photography; align verified schedule messaging without inventing policy text.
5. Integrations last: merchant-confirmed Apple Pay, independently approved Meta activation and remote MCP onboarding. Separate authorization/UAT for any real provider action.

Stop point: audit + safe coverage foundation only. No merge/deploy, real-payment test or next-pass implementation.
