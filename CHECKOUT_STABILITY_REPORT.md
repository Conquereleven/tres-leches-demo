# Checkout stability — Agent C2

Baseline: `def0c1f8b1a79d97faa9e4b9eddbf0d1b12e23f9`, fetched current `main` on 13 October 2026. Work is isolated on `test/3l-checkout-stability`. This audit performs no Production access or mutation, provider calls, payment creation, flag activation, merge or deployment.

## Decision

**CHECKOUT REGRESSION GO; Production activation requires founder authorization and C1 readiness.** No demonstrated checkout implementation defect was found. Two gaps in regression coverage were filled, without editing application code, catalog sources or prices.

## Added evidence

- Actual Product Hub publication now exercises both a pending accepted checkout and an authoritatively paid checkout. The latter retains its exact stored order and payment across publication, keeps customer/operations notification records unchanged on subsequent reconciliation, rejects a stale pre-publication quote and gives a new checkout the new published amount.
- Browser configuration HTTP 503: checkout fails closed; the existing Retry action recovers; the cart remains intact; no checkout/payment POST occurs.
- Browser authoritative quote HTTP 503: progression is disabled; a fresh area selection obtains an authoritative quote, preserves the zone-specific minimum and recovers safely without a payment POST.

## Coverage inventory

| Concern | Existing regression evidence retained |
| --- | --- |
| Exact ten corrected Pan prices, fixed packs, quantities, pickup/delivery quotes | `pan-oct13-correction.test.ts`, `pan-prices-oct13.spec.ts` |
| Simultaneous create/replay, durable worker leases and restart | `frozen-checkout.test.ts` |
| Cart replacement, paid immutability, late paid callback on superseded original order | `stale-checkout.test.ts` |
| Duplicate/signed callbacks, unknown ownership, external receipts, historical cutoff protection and retry/restart | `external-checkouts.test.ts`, `web-checkout-http.test.ts` |
| Lookup outage, uncertain provider creation, requestId recovery without another POST | `integration-adapters.test.ts`, `paymennt-web.test.ts` |
| Pending/authorized/terminal states, server-only authority, delivery minimum, pickup billing and Google boundaries | `paymennt-web.test.ts`, checkout browser suite |
| Published prices, stale quotes, accepted snapshots, commercial rollback | `storefront-catalog.test.ts`; paid publication added here |
| Frozen missing/inconsistent snapshots, catalog rename/removal/deactivation | `frozen-checkout.test.ts`, existing ticket snapshot regression |

## Executed QA

- Typecheck, lint and isolated build: PASS.
- Focused unit/integration run: **123/123 PASS** across frozen/stale checkout, external receipts, Paymennt web, adapters, checkout HTTP, dynamic storefront and October 13 correction.
- Final affected publication suite after adding reconciliation assertions: **9/9 PASS**.
- New network-recovery browser scenarios: **Chromium 2/2, WebKit 2/2 PASS**. Local disposable SQLite, mocked provider and independent port 3189; no real card/payment/provider traffic.
- Secret scan: **0 findings**, 1,325 source/bundle files scanned.
- Dependency audit: **0 vulnerabilities**.

Current baseline evidence from hotfix #22 remains valid and was deliberately not duplicated: **572/572** complete commerce tests, **19/19 checkout in each Chromium/WebKit**, **10/10 corrected selector/cart/delivery/pickup cases in each browser**, and **40 Production read-only quotes**. This PR adds one publication branch and two browser scenarios to that baseline; it does not claim a fresh full 573-test or 21-test run. CI independently runs the full commercial suite for this PR head.

Initial local browser startup failed because the sandbox denied loopback binding; after using the authorized isolated loopback harness and building this worktree, both browsers passed. The initial npm audit was network-restricted; the read-only authorized registry check passed. Neither was an application defect.

## Boundaries and residual risks

- All provider responses are injected fixtures. Natural LIVE callback/provider availability is not established by these tests; no synthetic LIVE transaction was performed.
- Quote recovery is exercised through existing area re-selection; there is no dedicated same-area quote retry button. A retry UI is a future product decision, not implemented here.
- Production flags, Foundation reconciliation, manager draft permissions and activation are owned by C1. No C2 changes to `server/catalog/*`, Product Hub implementation or commercial data.
- The checkout fixture still has an explicitly retired historical SKU to retain its financial regression. Current ten-SKU storefront evidence comes from the separate real-menu suite; no retired SKU is enabled in Production.
- Existing provider status/cutoff policies, scheduling, delivery minimums and paid snapshots remain unchanged.

Changed files: this report, `tests/commerce/storefront-catalog.test.ts`, `tests/checkout-e2e/network-recovery.spec.ts`.
