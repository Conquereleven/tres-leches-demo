# Delivery area recognition / Bluewaters incident

26 October 2026, Dubai. Baseline main and observed Production health SHA: `703c14dc3615d4aca1a7eb222f5dd4afdc297e5c`.

## Findings and limits

Fresh public `GET /api/checkout/config` returns 94 active minimum-defined zones, `Cache-Control: no-store`, legacy address mode, and no Bluewaters name or alias. An authenticated read of Operations → Delivery areas shows 96 total rules: the same 94 active zones and two inactive historical Palm rules. Searching `Blue` returns no zone. Thus the configuration reported as recently added is not present in this runtime. There is no evidence to attribute that discrepancy to an unsaved form, another environment, or a previous deployment.

The public options are generated directly by `publicDeliveryAreas(state.zones)`. There is no second frontend zone table to synchronize. A new page receives fresh config; neither a cached screenshot nor an old session explains the fresh API result. The in-page config promise remains shared as before. A full reload or existing outage retry fetches again; this fix does not invent a parallel polling/config system.

The founder subsequently authorized creating Bluewaters with **AED 50 minimum and no delivery charge**. However, the deployed UI can only edit existing zones and `updateZone` requires an existing ID (`index >= 0`, otherwise 404). There is no deployed create-zone command or UI. **No Production zone was created, renamed, activated, or modified.** Do not repurpose JBR, Marina, a JLT cluster, or an inactive Palm ID. Do not bypass the API with a direct SQLite edit. This PR adds the sanctioned creation capability described below; review/deployment remains a prerequisite to applying the approved configuration and is not authorized here.

Current Production cannot quote a nonexistent canonical Bluewaters ID. It remains a configuration/administration blocker, not something search aliases can authorize. The code in this PR is ready for review; it does not claim to enable Bluewaters in Production.

## Administrative creation prerequisite (included in this Draft PR)

Operations → Delivery areas gains an admin-only **New delivery area** form, reusing the existing editor and `/api/commands` transport. The new `createZone` command uses the existing strict zone schema, RBAC, durable idempotency receipt and atomic SQLite store transaction. It requires a genuinely new ID, version zero, a defined approved minimum, zero delivery fee/free delivery, valid labels and no ID/name/alias collision with any existing active or inactive record. The saved version becomes one. An audit entry records the creation; no existing zone, catalog item, order, payment or notification is rewritten.

New forms generate a stable opaque UUID, start inactive, and have no default minimum or geography. The administrator must explicitly enter the approved minimum and activate the rule. Saving is guarded against duplicate UI submission; the global command guard and durable receipt remain authoritative. Cancel and missing-minimum submissions do not write. Collision/failure leaves the form recoverable. Existing update-zone optimistic concurrency is unchanged. EN/TL labels/error resources are supplied; new Tagalog wording has not received native review.

## Corrected behavior

- A zero-match query now says “We couldn't find that area. Try another spelling or contact us.” It offers the existing support link and Pickup, without claiming geographic non-coverage or suggesting a false neighboring area.
- Only an actual ineligible server quote displays “Online delivery is not currently available for the selected area.” Minimum-not-met retains the existing precise minimum and shortfall explanation.
- `Bluewaters`, `Bluewaters Island`, `Blue Waters`, and `Blue Waters Island` suggest an existing zone only when its configured name or alias exactly identifies that family. Search hints do not add areas, change eligibility, or count as exact approved aliases. They require explicit suggestion selection. Approved exact names/aliases retain existing automatic resolution, only when unique.
- JBR, Marina and JLT clusters retain their own IDs, prices/minima and aliases. Ambiguity never establishes a selection.
- The combobox keeps a valid active descendant when results change, supports assistive click activation as well as pointer/keyboard selection, and continues to use native validation plus a live status message.
- Manual local review reproduced a separate keyboard hazard: after an exact alias canonicalized and exposed the full list, Enter chose row zero (JLT Cluster O) instead of Bluewaters. The active row now follows the exact selected identity on typing, explicit choice and refocus. A browser regression verifies Enter cannot replace it with another zone.
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

After separately approved integration/deployment: open New delivery area, enter Bluewaters Island, its three aliases, minimum 50, explicitly activate, and create once. Re-read the new rule and public config. The founder's zone-write approval is already recorded; do not request it again unless the requested rule changes. A creation collision must stop for review rather than overwrite anything.

## Authority and invariants

The UI submits only a canonical `zoneId`. Existing `quoteWebCheckout`, `quoteOrder`, address verification, coverage geometry, checkout acceptance and immutable order snapshots are unchanged. Server checks still reject arbitrary/inactive IDs, block rules without minima and recalculate from catalog data. Google mode cannot be bypassed by typing a recognized area; verified address correction/review behavior remains authoritative. Legacy order addresses retain their unverified/manual-review policy. Pickup needs no delivery zone.

No Paymennt, Resend, Meta, Product Hub, delivery-policy, catalog, pack/pricing, payment-state, order-history or infrastructure implementation changes. Server changes are confined to the additive create-zone command; existing quoting and order mutation paths are unchanged. No Production writes, orders, provider calls, merge or deployment were performed by this task.

## Validation

| Check | Local result |
|---|---|
| Typecheck / lint / build | PASS |
| Full Commerce suite | 767 PASS (13 new focused recognition/creation tests) |
| Dedicated delivery-area browser suite | 39 PASS: Chromium 390 px, WebKit iPhone 390 px, Chromium 1440 px; EN/ES/AR and RTL |
| Full checkout browser regression | 66 PASS: Chromium + WebKit |
| Sites packaging tests | 4 PASS |
| Secret scan | 0 findings |
| npm audit | 0 vulnerabilities |

Tests use disposable SQLite, fake providers and synthetic addresses only. The dedicated suite confirms exact and fuzzy/ambiguous selection, all four spellings, canonical persistence across reload/review, threshold enforcement, no fee, unsupported/empty text, inactive/pending/stale IDs, frontend/backend mismatch, delayed config, network recovery, keyboard/blur/touch and axe accessibility. Quote-only actions leave orders/payments empty. Administrative creation tests cover approved minimum, cancellation, missing minimum, RBAC, collision rejection, durable replay and preservation of all unrelated state; the browser verifies the new rule propagates to public config. Existing Commerce regressions cover verified-community correction, Google/KML boundaries, paid-order immutability and server acceptance.

The first browser run exposed two mistakes in the new tests: waiting for a new quote while changing only aliases of an unchanged ID, and counting native time-select options as area suggestions. They were corrected to clear before each independent resolution and scope counts to the area listbox. No runtime or commercial assertions were weakened. A temporary full-checkout runner initially used the config directory as server cwd; correcting that local runner produced the complete 66 PASS.

### Screenshots (isolated fixtures)

These screenshots deliberately use **AED 137 as a synthetic area minimum** to prove rules come from configuration, not an inherited JBR tariff. It is **not** the approved Production rate (AED 50). The retired AED 25 item exists only in the established legacy checkout regression fixture; no retail catalog change is proposed.

- [390 px Chromium, no search match](delivery-area-recognition/mobile-no-match.png)
- [390 px WebKit iPhone, canonical selection](delivery-area-recognition/webkit-selected.png)
- [1440 px desktop, Arabic/RTL](delivery-area-recognition/desktop-rtl.png)
- [Desktop review, persisted canonical area](delivery-area-recognition/desktop-review.png)
- [390 px admin creation, synthetic approved rule](delivery-area-recognition/mobile-admin-created.png)

All 24 local screenshots are retained in the task artifact. The focused CI workflow runs the 39 browser tests and uploads synthetic screenshots/traces without provider secrets or deployment permissions. Exact PR HEAD and CI observations are recorded in the PR/task artifact after push.

## Parallel-agent integration

No changes to pack builder, product search or recommendations. `Shop.tsx` has only the delivery callback rename and two area-feedback strings; merge these hunks deliberately if the Storefront Conversion UX V2 branch touches that checkout section. Locale additions are three independent checkout keys in EN/ES/AR plus source index, and independent admin labels/errors in EN/TL. `cart.ts` and `AddressAutocomplete.tsx` are unchanged. `Workspace.tsx` changes only the delivery-area editor; `commands.ts`/`service.ts` add only admin creation. The shared web-checkout fixture adds synthetic zones only under `DELIVERY_AREA_FIXTURE=true`; existing suites retain their 94-zone setup.

## Verdict

**GO WITH CONDITIONS** for founder review of this independent Draft PR. Code and local regressions pass, including the new supported creation path. Bluewaters activation is still blocked by its absence from deployed configuration: this PR must first be reviewed/integrated/deployed under separate approval, then its already authorized AED 50 rule created and verified. Stop before merge/deployment; do not claim ALREADY RESOLVED or active in Production.

If the new zone later needs rollback, deactivate that same ID through its versioned admin rule update; do not delete it or rename another zone. Accepted orders and payment snapshots remain historical. Code rollback alone does not require a SQLite restore.
