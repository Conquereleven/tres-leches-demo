# Security, release and rollback

## Privacy and security review

- Existing session authentication; every analytics endpoint (including export/session) checks admin/manager. Operator/agent receive 403; unauthenticated receives 401. No API permission changes elsewhere.
- GET only; no commands, Store.write, notification dispatcher, payment provider, mutation or schema change. One read of serialized SQLite state is consistent. Full-state byte equality is asserted around HTTP reporting requests in a disposable fixture database.
- No customer names, email, phone, address, notes, order IDs, provider references, transaction IDs or checkout URLs in responses. Only merchant-authored historical product text/SKU and aggregate counts/amounts. Current staff identity is returned solely for shell/language preferences.
- React escapes report text. CSV quotes every field, doubles embedded quotes, uses CRLF/UTF-8 BOM and prefixes formula-leading cells including whitespace/control-prefixed `=`, `+`, `-`, `@`. Filenames consist only of validated dates and fixed report names. No arbitrary links/HTML from records.
- Protected routes remain noindex; unknown routes remain 404. API responses and exports no-store. Dates must be real ISO calendar days and ranges 1–366 days. Integer overflow fails closed with 503, not rounded financial amounts.
- No cookies, tokens or Production data in screenshots. Synthetic fixtures use example.invalid contacts and mock providers only. No real email/payment/Production connection.

## Limitations and instrumentation needed

Refund/dispute counts are current statuses within the original paid-date cohort, not adjustment-period activity. Amounts/net sales unavailable until an authoritative immutable refund ledger exists. Add explicit payment environment/source provenance, capture event timestamps and branch/tenant dimension before making stronger historic attribution claims. Capture timestamp is local authoritative reconciliation receipt time. Missing proof/date and ambiguous settled attempts are quarantined with source-wide counts; totals may understate all business activity. Add approved cost/settlement ledger for margin/profit, consented session instrumentation for conversion, and reviewed identity rules for repeat customers in separately authorized work. No inferred classifications from mutable catalog. Tagalog additions require native operational review.

## Controlled release (not executed)

1. Founder reviews PR, dictionary, screenshots, tests and limitations. Confirm managerial access to commercial aggregates is desired.
2. After separate merge/deploy authorization, release the reviewed code using established verified-backup gates. No migration, flags, catalog publication or provider configuration needed.
3. Smoke authenticated `/operations/analytics`, all endpoint role boundaries, Dubai date filters, CSV, empty/partial states and unchanged Orders/Products/checkout. Compare aggregates to a separately authorized read-only accepted ledger sample before using financially.
4. Rollback code to previous healthy commit; no DB restore and no data rewrite. Reports are computed on demand, so rollback loses no orders or financial facts. Never undo commercial publications or restore SQLite to reverse an analytics UI release.

No merge, deployment or Production operation is authorized in this sprint.
