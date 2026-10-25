# Operations Experience V2 — acceptance and release boundary

This is a read-only presentation upgrade based on main d0a94663404930ad0b90595cecad409256eb3f2c. Server analytics, pricing, checkout, payment reconciliation, order transitions, customer notifications and provider adapters are unchanged.

## Scope

Six current-state/schedule cards lead to matching supported Orders filters. Pipeline links retain stored state meanings. Priorities show current scheduled work, unverified delivery addresses and recorded failed/uncertain jobs/customer-email rows; active sends are not failures. Recent activity links to authorized order details. There are no destructive actions, invented deadlines or resend buttons.

Admin/manager-only daily figures use the existing authorized Analytics summary API. Operators do not request that API. A missing, malformed or failed summary renders a recoverable unavailable state rather than plausible fallback numbers. The API remains server-authoritative and role-protected.

Analytics preserves exact integer-fils capture totals, accepted immutable product/category snapshots, CSV ranges, quality/provenance warnings and auth. Weekly/monthly views aggregate only selected daily rows; partial boundary buckets do not imply whole-week/month data. CSV remains the exact daily dataset for the applied period. Unsubmitted input changes are visibly distinguished. Category ranking reconciles to product allocations, not gross capture when fees/unallocated amounts exist. Packs remain purchased boxes, not counted again as component SKUs.

## Validation

The consolidated founder evidence folder records final local results, exact PR SHA, remote checks, screenshots and combined-candidate results: `artifacts/3l-consolidated-release-20261025/` in the task workspace, outside the runtime checkout.

Added pure tests cover day/week/month/year boundaries, exact totals, immutable input, historical null categories, unavailable comparisons, server percentage precision, current agenda, failed versus actively sending email and empty data. Browser tests exercise EN/tl at 390/1440, keyboard/axe, no overflow, one-row desktop summary, exact filtered navigation, operator financial isolation, recoverable failure, grouped trends and unchanged export range. Existing Analytics coverage includes 320/375/390/430/768/1440, session expiry, sign-in, retry, partial data and exports. The full existing Operations suite and combined checkout/media/email suites remain release gates.

A comparison assertion in the existing empty-period test was scoped to its original summary because V2 intentionally adds three comparison cards. No behavioral assertion was removed. Initial overlapping local builds and subsequent rate-limited authentication after a failed worker restart were harness failures, not accepted results. Final validation runs use an unchanged built checkout and retain normal server rate limits.

## Limitations and approvals

Issue #47 remains the financial acceptance boundary. PR #46's Oct19 98/98 reconciliation and AED1164 are historical evidence for that snapshot, not present-day LIVE certification. Keep unverified historical LIVE/TEST provenance and captured-not-net warnings. Fresh financial reconciliation requires separate authorized read-only acceptance; this sprint does not access Production customer records.

Native iPhone Safari, native mail clients and Tagalog owner review are not certified by browser automation. Category/product names retain existing recorded-definition/translation review warnings. Product-by-day trends, family taxonomy, preparation duration, true net revenue, profit, conversion, CLV and attribution require further validated instrumentation and are deferred.

No schema migration, API write, tracking, new dependency, commercial publication, feature flag change or deployment. Rollback this frontend PR independently; preserve all database and outbox state. A founder must separately approve merge/deployment. PR #63 customer-email activation and Product Hub media metadata publication are independent approval gates.
