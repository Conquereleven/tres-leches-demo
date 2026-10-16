# PACK-001 · Personalized Pan de Muerto packs

Implementation based on `a75a0fa1637f4511ed0237e2b4fff621489e619a`. Development/QA only: no merge, deployment, Production write, provider transaction, publication or role changes.

## Commercial contract

The existing eight pack SKUs remain the priced items. Components are preparation requirements, never extra charged lines. No presets, substitutions, minimum per flavor or surcharges. Customers choose nonnegative integer counts totaling exactly 6 or 12 pieces; all one flavor is allowed. Box quantity multiplies the fixed pack amount.

| Format        | Traditional AED | Filled AED |
| ------------- | --------------: | ---------: |
| 6 mini        |              60 |        100 |
| 12 mini       |             115 |        190 |
| 6 individual  |              72 |        120 |
| 12 individual |             140 |        235 |

All eight prices were verified against the public Production checkout configuration read-only on 15 October 2026; published revision `catalog-v1-991ede60949823cc136842ced9f7ce9c28bfc37b61cb48504`. Commercial JSON sources, SKU identities, product availability and media are unchanged. Future activation must recheck current prices, not overwrite a later approved publication.

`shared/pack-composition.ts` maps exact existing component SKUs by family/size. Traditional: Sugar, Sesame, Sugar with chocolate covering. Filled: Diplomat cream (vanilla), Chocolate, Mascarpone and cajeta, Mascarpone and strawberries, Pistachio. Retired combinations are excluded. Pack eligibility is independent of the seasonal/retail availability of singles; packs remain year-round subject to Lisa's explicit production approval.

## Contracts and Product Hub

- Flag: `PERSONALIZED_PACKS_ENABLED=false` by default. Off preserves legacy uncomposed pack purchases; it rejects new composition requests. Valid accepted composed orders continue to reconcile from immutable snapshots even if the flag is subsequently off.
- Optional Foundation `packEligibility`: list of `{packSkuId, componentSkuIds}`. Existing revisions remain compatible; absent or empty rules enable nothing. No initialization/import/migration is needed. No real availability is seeded.
- Operations → Products → **Pack flavor eligibility**: admin/manager prepares and saves a private draft per format. Existing review lists before/after SKU approvals. Only admin can publish. Existing version, stale-draft conflict, command idempotency, history and atomic publication apply.
- Draft eligibility never reaches the public catalog/config. Published rules refresh existing open tabs through the existing dynamic-catalog subscription. A removed flavor remains visible in an existing selection so the customer can remove it; adding it is disabled. Checkout revalidates before any provider action.
- Cart lines now optionally carry `composition: [{componentSkuId, units}]`. Stable identity includes sorted positive composition, excluding box quantity. Equal mixtures combine; different mixtures remain distinct. Editing and refresh preserve choices. The existing maximum of 100 boxes applies across all mixtures of one SKU.
- The server rejects forged prices/snapshots, malformed/duplicate/retired/cross-family/wrong-size components, incomplete counts, unavailable approvals and stale quotes. Composition participates in quote revision, checkout intent/hash, retry/resume and idempotency.
- At payment acceptance, the server freezes version, published revision, capacity, component counts and approved EN/ES/AR names in `packSnapshot`. Financial catalog snapshot remains authoritative. Paymennt receives priced pack items only; its adapter and state machine are unchanged.
- Orders, Inbox, kitchen, detail panels, ticket previews and existing operational notifications show immutable English preparation per box. Customer cart/checkout/return display EN/ES/AR. Historical orders without composition retain existing behavior. Invalid stored composition snapshots show review-required instead of reconstructing from today's catalog. Print remains preview-only; sending remains behind existing provider gates.

## QA evidence

- Typecheck, lint, build, Sites and heuristic secret scan.
- Commerce/HTTP suite: **611/611**, including 17 PACK-001 regressions covering all eight SKUs and all seven authoritative delivery-minimum bands, arbitrary/single/all-flavor mixes, quantities, year-round behavior, stale approval/quotes, same-SKU distinct lines, normalized idempotency, superseded unpaid checkout, frozen payment/order immutability, email deduplication and malformed ticket snapshots.
- Pack Playwright: **24/24**, Chromium/WebKit, 390/768/1440, EN/ES/AR, cart edit/refresh, local fake hosted payment/return, kitchen/tickets, RBAC and published eligibility refresh. Full axe coverage on new builder controls; existing whole-checkout scan retains its pre-existing contrast exclusion.
- Existing checkout: **21 Chromium + 21 WebKit**. Product Hub: **8/8**.
- Operations: 82/84 passed in the initial concurrent run; two Chromium image-load/navigation-timeout failures passed on targeted serial recheck (2/2), preserving all assertions. No product defect demonstrated. CI reruns the full suite serially. No claim of a real LIVE charge or email.
- `npm audit`: **0 vulnerabilities**. No dependency changes. Full screenshot matrix is in local `work/qa/packs`; representative evidence is committed alongside this document.
- Historical BRAND02 visual gate now reads the already released cart/checkout source for its historical byte comparison; current commercial JSON/media/policy assertions remain enforced. PACK-001 behavior is covered by its own regressions.

Known pre-existing build warnings: large client chunk; pending business-content fields. Arabic/Tagalog additions are developer-reviewed, not native linguistic certification. Secret scan is heuristic.

## Lisa UAT (before commercial activation)

1. Confirm production availability separately for each of the eight formats. Approve only the exact candidate flavors that can actually be prepared; no automatic approvals.
2. Save a draft; verify a customer tab sees no change. Review exact approvals; an administrator publishes only the approved availability revision.
3. On isolated preview, select one flavor, a mixed pack, all available flavors; verify exact 6/12 total, fixed AED amount and no surcharges.
4. Add two distinct mixes of the same pack, refresh, edit and combine identical mixes. Verify boxes versus pieces are clear.
5. Verify checkout summary, pickup/delivery zone minimums, then a simulated accepted order's kitchen/ticket. Confirm per-box preparation and English operations labels.
6. Check EN/ES/AR at 390px; approve actual availability and release separately. No LIVE payment is required for this QA.

Proposed copy **not published, awaiting separate wording approval**: “Imagen ilustrativa. Tu pack incluirá las piezas y sabores que selecciones.” Existing images are unchanged.

## Controlled rollout and rollback (future approval required)

1. Review/approve the PR and Lisa's availability matrix. Recheck current published catalog/prices, Foundation integrity and a consistent private SQLite backup with isolated restore verification. Record existing flags and revision. No bulk import or historical rewrite.
2. Separately authorize code deployment with `PERSONALIZED_PACKS_ENABLED=false`; existing pack ordering stays available. Check health/revision, menu/cart/checkout and provider queues. No other flags or credentials change.
3. Lisa/admin saves and publishes only approved pack eligibility through existing Product Hub. Keep feature off until approvals exist for every format intended for release. Inspect publication diff for eligibility-only changes.
4. Separately authorize `PERSONALIZED_PACKS_ENABLED=true` and its required Railway restart. Smoke product/cart/quote/checkout summary against the published revision. No synthetic LIVE charge. Observe natural events only under separate authorization.
5. GO only with exact prices, approved eligibility, healthy quote/ordering, RBAC and intact historical orders. NO-GO for inconsistent Foundation, missing approved availability, stale fingerprints, unavailable ordering or mismatched accepted preparation.
6. For a critical regression, turn the new flag off on this compatible code first: legacy pack purchasing resumes; existing accepted compositions/snapshots remain stored/readable and reconcile. Correct eligibility with a new forward Product Hub publication. Never restore an older SQLite over new transactions, never delete preparation snapshots or alter paid orders.
7. Do not roll code back to a pre-PACK reader after composed orders exist: it cannot render preparation safely. Retain this snapshot-compatible build with the flag off or deploy a reviewed forward fix. Provider/outbox operations and original payment state machine remain intact.

**Code ready for review; Production activation NO-GO until Lisa confirms actual eligibility and the founder separately authorizes merge/deployment/activation.**
