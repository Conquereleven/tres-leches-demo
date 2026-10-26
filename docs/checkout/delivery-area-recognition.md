# Delivery area recognition / Bluewaters incident

26 October 2026, Dubai. Baseline main and observed Production health SHA: `703c14dc3615d4aca1a7eb222f5dd4afdc297e5c`.

## Findings and limits

Fresh public `GET /api/checkout/config` returns 94 active minimum-defined zones, `Cache-Control: no-store`, legacy address mode, and no Bluewaters name or alias. An authenticated read of Operations → Delivery areas shows 96 total rules: the same 94 active zones and two inactive historical Palm rules. Searching `Blue` returns no zone. Thus the configuration reported as recently added is not present in this runtime. There is no evidence to attribute that discrepancy to an unsaved form, another environment, or a previous deployment.

The public options are generated directly by `publicDeliveryAreas(state.zones)`. There is no second frontend zone table to synchronize. A new page receives fresh config; neither a cached screenshot nor an old session explains the fresh API result. The in-page config promise remains shared as before. A full reload or existing outage retry fetches again; this fix does not invent a parallel polling/config system.

The founder subsequently authorized creating Bluewaters with **AED 50 minimum and no delivery charge**. However, the deployed UI can only edit existing zones and `updateZone` requires an existing ID (`index >= 0`, otherwise 404). There is no supported create-zone command or UI. **No zone was created, renamed, activated, or modified.** Do not repurpose JBR, Marina, a JLT cluster, or an inactive Palm ID. Do not bypass the API with a direct SQLite edit. The sanctioned creation capability is a separate prerequisite to applying the approved configuration; no deployment is authorized here.

Current Production cannot quote a nonexistent canonical Bluewaters ID. It remains a configuration/administration blocker, not something search aliases can authorize. The code in this PR is ready for review; it does not claim to enable Bluewaters in Production.

## Corrected behavior

- A zero-match query now says “We couldn't find that area. Try another spelling or contact us.” It offers the existing support link and Pickup, without claiming geographic non-coverage or suggesting a false neighboring area.
- Only an actual ineligible server quote displays “Online delivery is not currently available for the selected area.” Minimum-not-met retains the existing precise minimum and shortfall explanation.
- `Bluewaters`, `Bluewaters Island`, `Blue Waters`, and `Blue Waters Island` suggest an existing zone only when its configured name or alias exactly identifies that family. Search hints do not add areas, change eligibility, or count as exact approved aliases. They require explicit suggestion selection. Approved exact names/aliases retain existing automatic resolution, only when unique.
- JBR, Marina and JLT clusters retain their own IDs, prices/minima and aliases. Ambiguity never establishes a selection.
- The combobox keeps a valid active descendant when results change, supports assistive click activation as well as pointer/keyboard selection, and continues to use native validation plus a live status message.
- EN/ES/AR and RTL are preserved. No modal, additional checkout step, layout or styling changes.

## Configuration to apply through an authorized supported administration path

| Field | Approved value |
|---|---|
| Canonical name | Bluewaters Island |
| ID | New permanent unique ID; do not reuse another zone's ID |
| Aliases | Bluewaters; Blue Waters; Blue Waters Island |
| Minimum | AED 50 |
| Active | true |
| Delivery fee | AED 0 |
| Free delivery | true |
| Geography | None invented; retain legacy mode. Future Google mode still requires trusted community/coverage evidence. |

Re-read all zones before applying, check ID/name/alias collisions and concurrent changes, and use ordinary admin authorization, idempotency and audit controls. After applying, verify public config exposes the same canonical ID, all four spellings select it, an authoritative quote enforces AED 50 without a fee, and all other rules remain unchanged. Do not treat this document as authorization to merge or deploy.

## Authority and invariants

The UI submits only a canonical `zoneId`. Existing `quoteWebCheckout`, `quoteOrder`, address verification, coverage geometry, checkout acceptance and immutable order snapshots are unchanged. Server checks still reject arbitrary/inactive IDs, block rules without minima and recalculate from catalog data. Google mode cannot be bypassed by typing a recognized area; verified address correction/review behavior remains authoritative. Legacy order addresses retain their unverified/manual-review policy. Pickup needs no delivery zone.

No Paymennt, Resend, Meta, Product Hub, delivery-policy, catalog, pack/pricing, payment-state, order-history or infrastructure implementation changes. No Production writes, orders, provider calls, merge or deployment were performed by this task.

## Validation

| Check | Local result |
|---|---|
| Typecheck / lint / build | PASS |
| Full Commerce suite | 764 PASS (10 new focused recognition tests) |
| Dedicated delivery-area browser suite | 33 PASS: Chromium 390 px, WebKit iPhone 390 px, Chromium 1440 px; EN/ES/AR and RTL |
| Full checkout browser regression | 66 PASS: Chromium + WebKit |
| Sites packaging tests | 4 PASS |
| Secret scan | 0 findings |
| npm audit | 0 vulnerabilities |

Tests use disposable SQLite, fake providers and synthetic addresses only. The dedicated suite confirms exact and fuzzy/ambiguous selection, all four spellings, canonical persistence across reload/review, threshold enforcement, no fee, unsupported/empty text, inactive/pending/stale IDs, frontend/backend mismatch, delayed config, network recovery, keyboard/blur/touch and axe accessibility. Quote-only actions leave orders/payments empty. Existing Commerce regressions cover verified-community correction, Google/KML boundaries, paid-order immutability and server acceptance.

The first browser run exposed two mistakes in the new tests: waiting for a new quote while changing only aliases of an unchanged ID, and counting native time-select options as area suggestions. They were corrected to clear before each independent resolution and scope counts to the area listbox. No runtime or commercial assertions were weakened. A temporary full-checkout runner initially used the config directory as server cwd; correcting that local runner produced the complete 66 PASS.

### Screenshots (isolated fixtures)

These screenshots deliberately use **AED 137 as a synthetic area minimum** to prove rules come from configuration, not an inherited JBR tariff. It is **not** the approved Production rate (AED 50). The retired AED 25 item exists only in the established legacy checkout regression fixture; no retail catalog change is proposed.

- [390 px Chromium, no search match](delivery-area-recognition/mobile-no-match.png)
- [390 px WebKit iPhone, canonical selection](delivery-area-recognition/webkit-selected.png)
- [1440 px desktop, Arabic/RTL](delivery-area-recognition/desktop-rtl.png)
- [Desktop review, persisted canonical area](delivery-area-recognition/desktop-review.png)

All 21 local screenshots are retained in the task artifact. The focused CI workflow runs the 33 browser tests and uploads synthetic screenshots/traces without provider secrets or deployment permissions. Exact PR HEAD and CI observations are recorded in the PR/task artifact after push.

## Parallel-agent integration

No changes to pack builder, product search or recommendations. `Shop.tsx` has only the delivery callback rename and two area-feedback strings; merge these hunks deliberately if the Storefront Conversion UX V2 branch touches that checkout section. Locale additions are three independent checkout keys in EN/ES/AR plus source index. `cart.ts`, `AddressAutocomplete.tsx` and all runtime `server/` files are unchanged. The shared web-checkout fixture adds synthetic zones only under `DELIVERY_AREA_FIXTURE=true`; existing suites retain their 94-zone setup.

## Verdict

**GO WITH CONDITIONS** for founder review of this independent Draft PR. Code and local regressions pass. Bluewaters activation is still blocked by its absence from deployed configuration and the lack of a supported creation operation. The approved AED 50 rule must be applied through a sanctioned administrative path and verified before claiming the incident resolved in Production. Stop before merge/deployment; do not claim ALREADY RESOLVED.
