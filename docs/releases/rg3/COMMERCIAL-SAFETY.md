# Commercial authority and historical consistency

Fresh combined 487 tests cover all approved components and three Gate 2 interaction regressions. Relevant sources: `tests/commerce/frozen-checkout.test.ts`, `integration-gate2.test.ts`, `web-checkout.test.ts`, `ticket-snapshot.test.ts`, `operations-v2.test.ts` and existing Paymennt/webhook/security suites. Test names/transcripts and current-head check logs provide exact coverage; none is a LIVE provider validation.

| Scenario | Evidence / authority |
|---|---|
| Accepted totals/names/prices survive edits, deletion/deactivation | Frozen checkout snapshot + stored quote/payment, including delayed worker and accepted replay tests |
| Stale preaccept quote fails | X-Checkout-Quote-Revision and HTTP 409 regression; old clients may omit the header |
| Duplicate notification / retries / worker restart | Durable claim, idempotency and reconciliation tests; uncertain creation is not blindly retried |
| Paid order immutable / late original reconciliation | Original order only; no duplicate ORDER_PAID |
| Shadow catalog reads/bootstrap | Preserve orders, payments, zones, jobs, fingerprints and revisions; no runtime bootstrap |
| Missing/partial/inconsistent paid snapshot | Financial path fails closed; no current-catalog reconstruction |
| Historical ticket | 16 EN/TL browser regressions, snapshot-only; review-required for unsupported records |
| Roles / identity | Existing server auth/RBAC + local HTTPS admin/agent/anonymous checks |
| Printing | Preview-only, no transport/send/write/job API; explicit unavailable connection |

`data-imports/liza-current-menu.json`, menu-data.json, commerce price policy and SQL schema are byte-identical to main. Authoritative catalog source remains state.catalog; no unapproved SKU activation, repricing, production bootstrap or general import is part of release. Approved code catalog remains 236 / 216 active / 20 inactive per existing invariant tests; this does not claim an inspected Production catalog count.

Foundation read API is prohibited in Production by code even if its flag is set. Products UI remains an honest unavailable state. Do not enable foundation editing/publication during this release. No Resend/Meta/Google/Paymennt setting changes. Paymennt calls in tests are injected mocks; compiled Production-profile rehearsal uses offline mode and no merchant credentials. Real provider receipt counts/financial state are not inspected here.

Existing startup delivery normalization predates these components; no new commercial migration is introduced. A future release must compare private baseline/backup to live records under explicit authorization instead of assuming byte-identical source proves data never changed.
