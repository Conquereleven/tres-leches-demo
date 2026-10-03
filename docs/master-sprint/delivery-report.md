# 3L master sprint — closure pass and final delivery coverage

Date: 2026-10-03, Asia/Dubai. Canonical repository: `/Users/rodrigom./code/tres-leches-demo`. Branch: `feature/3l-master-delivery-storefront`. Starting HEAD: `8b596f0ca788a30185d84a1b29d00c56492c81f9`.

**Local closure is verified; business/provider activation is not complete.** Updated original0–38 matrix: **31 COMPLETE,1 PARTIAL,3 BLOCKED EXTERNAL,4 NEEDS BUSINESS INPUT,0 NOT IMPLEMENTED**. The only PARTIAL is the aggregate sprint goal, dependent on the external/business inputs below; no locally solvable implementation task remains in that aggregate. COMPLETE means scoped local implementation/tests, never an assertion of production deployment or real provider UAT.

The earlier20/16/2/1 report is preserved in [pre-closure-baseline.md](pre-closure-baseline.md). Its screenshot/red-exclusion/map-missing conclusions are superseded. `post-implementation-audit.md` remains historical. No deploy/merge/push, production change/import, real payment, Paymennt or Meta call occurred. Reference-site reads and dependency audit are not provider activation.

## Geographic result

The supplied **GeoJSON** already contains one Polygon (not a LineString requiring conversion), one closed ring and37 positions. `docs/sources/3L_Dubai_delivery_coverage.geojson` is byte-identical to the attachment, SHA256 `69acabeb0de1b15935cb0ab9e995e30be7152ce3e78b5da0d2ec23b72e7b9e0b`. Normalized metadata is in `server/data/delivery/approved-coverage.json`, provenance adjacent. Coordinate arrays are exactly equal. No simplification, inferred coordinates, holes or invented red exclusion. The final file supersedes the screenshot.

The server bundles this approved boundary by default; optional private `DELIVERY_COVERAGE_FILE` overrides must validate or fail startup. Source files are explicitly tracked despite runtime data ignore rules. This changes the local release candidate, not the deployed server.

Private verified address/building → server-owned coordinates → approved outer coverage → unique verified community/alias (or optional reviewed legacy polygon) → actual area/minimum → authoritative cart → future Dubai date AND lead time → approved window → unchanged hosted Paymennt checkout. Customer coverage flags/coordinates are not accepted as authority. Address correction requires review; create and resume independently reject forged areas before mutations/provider calls. Main exterior edges/vertices are included deterministically; holes/exclusions would be excluded if explicitly provided, but this file contains none.

Fixed tests: inside25.1/55.25, outside25.45/55.4, supplied boundary vertex25.3079577/55.3756762 and just outside; real-map containment, malformed data, forged flags/area create/resume, unchanged state/no fake provider invocation after rejection, insufficient minimum and pickup fallback. Synthetic test tariff rectangles are confined to fixtures, not business seeds. Unicode NFKC exact address lookup now preserves Arabic letters/digits; duplicate keys fail startup.

**Remaining geographic blockers:** (1) no supplied real verified address/building→coordinate+community registry or approved website address-verification provider; (2) sufficient cluster/community granularity and unique approved aliases are needed where provider labels are broad; (3) no approved additional community rates beyond the table. Tariff polygons are optional, not a required blocker when verified community evidence is reliable. The perimeter locates no typed address by itself. Existing operational reverse Mapbox boundary does not provide website free-text verification. Unknown addresses remain blocked; pickup stays available. No paid geocoder was added. Production private inputs were not queried and their contents are not asserted. [Configuration and safe rollback](coverage-configuration.md).

The table preserves every existing minimum and adds explicitly approved JLT Cluster A:94 records, AED30:18,50:18,100:11,150:16,200:9,250:2,300:20. JLT A/B/C/D each require AED30. New quotes always total=subtotal; delivery costs are absorbed by the minimum. Legacy fee fields remain for wire/storage compatibility only, not a configurable pricing system. Broad coverage does not establish an unknown minimum. Historical source inventory remains in the preserved baseline.

## Approved minimum-only business update

Canonical names and aliases are separate configurable data. `server/domain/delivery-areas.ts` matches structured community labels after Unicode/case/punctuation normalization, never fuzzy/full-address matching. Generic JLT normalizes to JLT but needs a reviewed cluster; A–D resolve AED30. JVC variants, Marina, DIP and JVT aliases resolve deterministically. Unknown/inactive/colliding communities fail closed even if priorities or a legacy polygon suggest a cheaper area.

The private registry now accepts optional reviewed `community` and `cluster`. Outer coverage always runs first. With structured evidence, no tariff polygon is needed; without it, existing reviewed coordinate-only/polygon records remain compatible. Explicit unresolved community never falls back. The customer cannot submit community/coordinates/coverage as authority. Address verification returns the real area/minimum and correction status; create and resume reject a conflicting selected cheaper area before provider/state changes. Preliminary cart area quotes remain estimates until verified address resolution.

New quote delivery charges are always zero and total equals catalog subtotal, including when old zone fee fields are null/nonzero. Admin updates reject nonzero fees and the form removes fee/free-delivery controls. Customer totals remove the separate delivery line. Historical order/payment snapshots are not recalculated. Existing Paymennt adapters/state machines/credentials, Meta and schedule/coverage rules are unchanged.

The versioned rule migration creates a private SQLite backup before updating only zone rules/events, adding Cluster A and aliases. It recognizes previous installations via a new idempotent marker. Unit tests simulate the prior marker and prove catalog/orders/payments/history remain unchanged; no migration was run against Production. Current candidate data needs a separately authorized release, not an account change here.

Address-stack audit: existing operational Mapbox reverse adapter accepts coordinates and returns granular names/IDs; website checkout has no approved forward/Places address verification. The safe available path is a reviewed private registry with coordinates plus canonical community/cluster. Automated free text requires an approved server-side address-verification integration returning WGS84 coordinates and structured community evidence; no paid service was introduced or called. Full table aliases can replace polygons once that evidence exists.

Added17 focused unit/integration tests: canonical aliases, JVC/Marina/JVT/DIP, JLT normalization and A–D, Unicode, duplicate/unknown/inactive resolution, no-charge legacy fields/minimum recalculation, coverage-first/no polygon required, cheaper-area create/resume rejection with unchanged state. Browser fixtures now use trusted communities, validate Downtown correction to AED300 despite Marina selection, reject injected community, and assert no delivery charge line.

## Customer journey and safe corrections

The homepage composition now matches the approved reference hierarchy and imagery: image-first hero, separately cropped cities, source journey asset, three highlights, overlapping slice feature and family collage. Tablet hero522px and slice section456px replace the previous612/890 drift. Header, logo, type scale, CTA placement and spacing were reviewed at390/768/1440. Official Abril/Montserrat take precedence over reference Playfair. Reference autoplay, unfinished placeholder sections and WhatsApp-order CTA are intentionally not copied; explicit play, real menu/cart and legal footer remain. Pink heading background was darkened for contrast and blush CTA uses dark text; axe passes. No generated food photography or CSS illustration replacement.

`/menu` stays the only full catalog. The candidate retains234 options (218 prior plus16 already-approved Pan extensions), permanent packs and Dubai Oct15–Nov15 individual season. No prices, SKU IDs, names or assortment rules changed here. Sixteen copied extension descriptions were corrected to the exact approved product name; the previously displayed Pistachio/Chocolate contradiction is gone. **No catalog import was performed.** Production import/release is separately authorized.

The closure golden path selects Pistachio Individual AED21 and Azúcar/chocolate covering Individual70g AED13, carts AED34, uses a fake trusted address, simulates hosted checkout and authoritative provider GET, verifies actual saved lines/catalog snapshot and opens the same order in the dashboard/customer confirmation. It is a fixture payment, not a charge. Clear/cart quantity/removal, minimum shortfall, outside coverage error→pickup recovery and stale clock windows have actual browser interaction assertions. Schedule remains next day AND >=12h (selective24h items), and only08–13/13–16/16–21. The browser now advances serverNow with elapsed time and refreshes on focus/visibility; the server independently revalidates current time.

WhatsApp support stays left at+971585943319; floating cart is separate and enters web checkout. Internal recipient+971521683319 is unchanged. Dashboard changes are limited to an accessible conversation-text color; auth/payment/operations state machines and Meta adapters/configuration are untouched.

## Language readiness

`localization.tsx` initializes URL `?lang=en|ar` before saved preference, preserves query/path on switching, persists storage and applies public RTL; operations remain LTR/English. `scripts/extract-customer-copy.mjs` maintains a keyed customer English/catalog/template inventory in `src/brand/locales/customer-copy.json`, preserving existing approved translations. `CustomerCopy`/text boundaries apply to public presentation without adding DOM/layout nodes. Bidirectional isolation preserves English names/numerical ranges in RTL; explicit option values keep SKU/window submissions canonical. Approved template interpolation preserves amounts/variables and refuses missing/unknown tokens. The inventory has557 entries with unapproved Arabic null; existing six navigation translations were preserved, no final Arabic copy generated. Content/field/error/legal translations and final Arabic acceptance still require reviewed business copy; this is deliberately **not a fully translated Arabic storefront**. Browser URL/reload/storage, RTL overflow and operations direction tests pass at390/768/1440.

## Validation

| Check | Final result |
|---|---|
| TypeScript / ESLint / diff whitespace | PASS |
| Domain/unit/HTTP integration |344 PASS,0 failure/error |
| Original browser suite including no-JS build, staging login/RBAC, AI and WA2 |12 PASS |
| Checkout/payment regression browser |19 PASS |
| Menu browser/category/accessibility |8 PASS |
| New closure browser |8 PASS |
| Preserved Sites packaging |4 PASS |
| Production build / Node bundle / static packaging |PASS |
| Dependency audit |0 vulnerabilities |
| Secret scan |PASS,276 scanned,0 findings; heuristic tracked/unignored source plus built client |

Total395 passing tests (344+47+4),0 skipped in final build-mode browser run. Current business-rule validation logs are in `/tmp/3l-area-update/` (`unit.log`, `base.log`, `checkout.log`, `menu.log`, `closure.log`, `types.log`, `lint.log`, `build.log`, `sites.log`, `audit.log`, `secrets.log`). Prior closure evidence is retained under `/tmp/3l-closure/`. Logs are local artifacts, not committed secrets.

The original browser suite had stale pre-TL24 homepage/WhatsApp-modal expectations and pre-approved-fee expectations. These were updated to current real routes/content, actual free-delivery controls and current operational status labels; no assertion was removed to hide a runtime defect. Full staging RBAC/readiness, original AI/Copilot and WA2 fulfillment still pass. Separate test output directories prevent parallel trace collisions. Contrast failures in public blush headings and selected inbox previews were corrected. Native option.disabled is asserted directly for time-window checks.

Build warns about previously pending business email/support hours/policy fields and Node's experimental localStorage API. Those are existing content decisions; no legal text was invented. Secret scan is heuristic, not a guarantee about history/private deployment storage. Geometric correctness is not physical address ownership or survey accuracy; real address/community UAT requires the missing inputs.

## Original requirement matrix (0–38)

| ID | Requirement | Current status | Actual evidence / remaining dependency |
|---|---|---|---|
| 0 | Working method | COMPLETE | Canonical branch, instructions, actual source and baseline inspected; historical report preserved. |
| 1 | Sprint goal | PARTIAL | Local closure complete; full business launch still depends on the geographic/Arabic/provider inputs below. This is an aggregate dependency, not an outstanding local patch. |
| 2 | Homepage rebuild | COMPLETE | Hero, separated cities, journey, featured cakes, pink panel and family collage corrected against reference at 390/768/1440; reviewed comparisons and responsive tests. |
| 3 | Homepage colors | COMPLETE | Cream/beige/gold remains dominant; blush feature retained; no dominant lilac homepage. |
| 4 | Typography and logos | COMPLETE | Approved Abril/Montserrat and supplied marks retained; tablet header and logo sizing corrected; local fonts/CLS/axe pass. Font direction comes from existing approved brand instructions. |
| 5 | Menu leaves homepage | COMPLETE | Full catalog only on /menu; homepage has three editorial highlights; browser section/route assertions. |
| 6 | Menu page | COMPLETE | Eight categories, server SKU/price gating, selectors, descending prices and responsive browsing; eight menu browser tests. |
| 7 | Product photos | NEEDS BUSINESS INPUT | Only approved family/category photographs available. No invented flavour-specific image claims or generated food. Supply licensed exact product/flavour photography if required. |
| 8 | Home video | COMPLETE | Source video/poster, explicit accessible play/pause, offscreen pause and recoverable video failure; browser checks. Intentional autoplay/reduced-motion distinction. |
| 9 | Favicon | COMPLETE | Existing approved local icon link remains; brand source/unit verification. |
| 10 | How to order | COMPLETE | Actual menu/options/cart/verified address/area/minimum/date/window/web payment/reconciled confirmation described; route screenshots at three widths. |
| 11 | Product quantity | COMPLETE | Actual +/− interaction: AED34→55→34, integer safeguards preserved; browser/domain tests. |
| 12 | Clear cart | COMPLETE | Browser dismiss retains AED13; accept empties UI and persistent cart; no injected cart state. |
| 13 | Floating cart | COMPLETE | Visible ecommerce cart→web checkout; left WhatsApp/right cart non-overlap assertion and mobile captures. |
| 14 | Pan de Muerto season/packs | COMPLETE | Dubai ordering date Oct15–Nov15 inclusive; before/after instants tested; packs permanent. Saved seasonal single variants exercised in dated fixture. |
| 15 | Pan de Muerto options | COMPLETE | Pistachio and chocolate covering selected→cart→checkout→actual saved lines/catalog snapshot→dashboard→customer tracking. Corrected 16 copied descriptions only; prices/IDs unchanged. |
| 16 | Option price ordering | COMPLETE | All family options descending by price then stable SKU; existing master-sprint assertion. |
| 17 | Next day / advance notice | COMPLETE | Next-day AND >=12h window start, selective24h products; server tests plus browser time advance and same-day disabled options. UI clock now advances instead of freezing config timestamp. |
| 18 | Delivery windows | COMPLETE | Only 08–13,13–16,16–21 configured; server rejects obsolete/fabricated labels; all three browser options checked. |
| 19 | Area minimum order | COMPLETE | 94 approved area records (Cluster A added); no separate delivery charge; server quote authoritative; browser area switch recalculates AED66 shortfall and continuation state; inside-map insufficient-minimum test. |
| 20 | Address/area validation | NEEDS BUSINESS INPUT | Exact outer boundary is COMPLETE. Real verified-address coordinates plus trustworthy community/cluster evidence are missing; tariff polygons are optional; arbitrary free-text delivery remains blocked. Forged inputs rejected server-side. |
| 21 | Remaining Dubai areas | NEEDS BUSINESS INPUT | No new community rate/boundary invented. Supply approved rates/aliases for any unlisted or unresolved communities; no mandatory hand-drawn tariff subdivision. |
| 22 | Checkout images | COMPLETE | Family thumbnails and selected SKU data retained in cart/review/confirmation; current screenshots reviewed. Photos remain explicitly family-level. |
| 23 | Customer WhatsApp | COMPLETE | +971585943319 support target validated; separate internal Liza +971521683319 preserved. |
| 24 | Floating WhatsApp | COMPLETE | Discreet left support; mobile behavior and cart separation verified, actual target asserted. |
| 25 | WhatsApp order destination | COMPLETE | Later approved commerce correction governs: web checkout is ordering destination, WhatsApp support-only; no backend/provider changes. |
| 26 | English/Arabic | NEEDS BUSINESS INPUT | Technical infrastructure, extracted inventory, text boundary, template interpolation, URL/storage priority and RTL verified. Approved full Arabic copy and translation acceptance remain missing; English fallback retained. |
| 27 | Dashboard auth | COMPLETE | Production/staging session/RBAC regressions and HTTPS staging browser roles pass; no privileged route/data exposed by public shell. |
| 28 | Order tracking | COMPLETE | Capability-bound stored order, selected variants, delivery data and existing fulfillment timeline verified against dashboard/database. Scope is status tracking, not courier GPS/ETA/push. |
| 29 | Apple Pay | BLOCKED EXTERNAL | Hosted checkout preserved. Merchant entitlement/method availability and controlled UAT require Paymennt/owner; no fake button or activation. |
| 30 | Meta | BLOCKED EXTERNAL | Existing signature/challenge/idempotency/source/window policy tests pass; approval/secrets/number activation not inspected or changed. Outbound stays disabled in local test fixtures. |
| 31 | MCP/ChatGPT | BLOCKED EXTERNAL | Existing disabled read-only facade preserved; remote OAuth/transport conformance/client/account setup not implemented or activated. This is not a production-ready remote MCP endpoint. |
| 32 | Quality/security | COMPLETE | Unicode-safe exact address keys, duplicates fail startup, forged geography rejection, elapsed UI clock, contrast fixes; type/lint/auth/signature/audit/scan checks. |
| 33 | Testing | COMPLETE | 344 unit/integration,12 original browser,19 checkout,8 menu,8 closure,4 packaging pass. Focused geography, clear, persistence and i18n tests added. |
| 34 | Full E2E QA | COMPLETE | 47 isolated browser scenarios pass; signed/provider/domain security remain tested. Mock authoritative GET only; no real merchant UAT claimed. |
| 35 | Visual QA | COMPLETE | Fresh requested widths/routes, loaded-image screenshots and side-by-side five-section comparisons manually reviewed; axe and overflow pass. Customer design acceptance is still a review step. |
| 36 | Prohibited actions | COMPLETE | No deploy, merge, push, production DB/config/credentials/provider call or real payment. Separate local databases and injected providers. |
| 37 | Git/review process | COMPLETE | Requested branch retained and logical local commits created, approved map dedicated. No remote exists; publication/PR is outside this local closure. |
| 38 | Final report | COMPLETE | This current39-row matrix, exact blockers, historical baseline, screenshot index and validation evidence replace stale activation conclusions. |

## Final gap list

### A. COMPLETE AND VERIFIED

31 scoped requirements listed above; exact approved outer map, forged-input security, original business schedule/minimums, variant persistence through stored/dashboard/customer records, cart interactions, dedicated menu, responsive homepage, auth/tracking and local validation.

### B. IMPLEMENTED BUT NEEDS REVIEW

Requirement1 aggregate sprint goal remains PARTIAL solely because business/provider activation is incomplete. Fresh visual screenshots are ready for customer acceptance; local visual/accessibility QA passed. No deployment is implied by review. Prior identity manual's unavailable original upload can be resupplied for additional brand review; existing approved directives/assets were retained.

### C. BLOCKED EXTERNAL

Requirements29 Apple Pay merchant/provider eligibility+controlled UAT;30 Meta approval/configuration/three-number onboarding;31 remote MCP OAuth/transport/client/account onboarding. Existing MCP is a disabled internal facade, not completed remote connectivity. Publication would additionally need a Git remote/base branch; not required for this local commit deliverable.

### D. NEEDS BUSINESS INPUT

Requirements7 licensed exact variant photography;20 trusted address coordinates plus structured community/cluster or approved address-verification provider (tariff polygons optional);21 any additional area/rate/boundary decisions;26 approved complete Arabic copy, including sensitive/legal text and final RTL translation acceptance. Coverage perimeter itself is closed and verified. Existing pending contact/policy business fields remain documented, not guessed.

### E. NOT IMPLEMENTED

No original requirement is assigned this status. Automatic free-text geocoding, final Arabic translations, merchant Apple Pay activation and remote MCP OAuth/transport are not implemented/activated; their prerequisite/scope blockers are explicitly in C/D. Courier live GPS/ETA/push was not requested in this closure and is not added or claimed.

## Git delivery and artifacts

Previous closure map commit: `b8ecc02`; storefront/variant/i18n/fixture regression closure: `c382987`. Documentation closure and final HEAD are recorded by `git log` and in the final delivery message; no merge/push/deploy. Payment adapters/server financial logic, frozen orders and production data are unchanged.

Fresh screenshot index: [closure-screenshots.md](closure-screenshots.md). Local images are under `work/qa/closure/`, intentionally ignored in Git; preserve/export them when moving machines. Current screenshot widths are checked against requested CSS viewport. Reference contains autoplay/reveal movement; fixed source headers sometimes appear mid-full-page due capture scroll position, explicitly excluded from fidelity defect judgments. Accepted current captures load all images and start at the top. Full reference images and five-section comparison pairs are retained. Screenshots depict fictitious fixture orders only.

## Business-update changed files

This pass does not change provider adapters, payment states, Meta or Production. Exact local files:

- `.env.example`
- `docs/master-sprint/coverage-configuration.md`
- `docs/master-sprint/delivery-report.md`
- `docs/master-sprint/external-readiness.md`
- `server/domain/delivery-areas.ts`
- `server/domain/delivery-rules.ts`
- `server/domain/service.ts`
- `server/domain/website-address.ts`
- `server/domain/zones.ts`
- `server/http.ts`
- `src/brand/Shop.tsx`
- `src/brand/business.ts`
- `src/brand/locales/customer-copy.json`
- `src/commerce/Workspace.tsx`
- `tests/checkout-e2e/checkout.spec.ts`
- `tests/checkout-e2e/delivery-pickup.spec.ts`
- `tests/checkout-e2e/ux-states.spec.ts`
- `tests/closure-e2e/closure.spec.ts`
- `tests/commerce/delivery-areas.test.ts`
- `tests/commerce/delivery-pickup.test.ts`
- `tests/commerce/domain.test.ts`
- `tests/commerce/ecommerce-checkout.test.ts`
- `tests/commerce/integration-adapters.test.ts`
- `tests/commerce/policies.test.ts`
- `tests/commerce/staging.test.ts`
- `tests/commerce/web-checkout.test.ts`
- `tests/e2e/commerce.spec.ts`
- `tests/fixtures/web-checkout-server.ts`

Business-update implementation commit: `2962d5b`. Documentation commit and final HEAD are recorded in the final response. No merge/deployment/provider/account changes.
