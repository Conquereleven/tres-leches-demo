# 3L / CornerTech Analytics v1

Baseline: main `464cad9b0d1f4461961034b11497c9f356d3348d` (PR #44). Issue #45 is authoritative. Development uses only isolated synthetic SQLite fixtures; no Production audit, business-data export or provider request is needed or performed.

## Audit

SQLite stores a serialized `State` in `commerce_state`. Orders have immutable SKU, quantity, quote, catalog and optional preparation/price snapshots. There is no independent creation field: the first audit event is the best creation evidence. Payments have attempt IDs, provider references, statuses, amount/currency, `lastReconciledAt` and first confirmation `paidAt`. Reconciliation verifies provider identity, order, request, currency and amount before accepting a state. Reporting must not initiate reconciliation. First paid receipt time is not provider settlement time. Later refunded/disputed statuses preserve original accepted financial facts.

There are no authoritative refund amounts, chargeback amounts, COGS, fees charged by the provider, settled bank amounts, visitor sessions or reliable cross-channel customer identities. Do not derive profit, net sales, conversion or repeat-customer metrics. Current state counts are not historical as-of-state counts or fulfillment durations.

## Boundaries

- `server/analytics/three-l-source.ts`: only module seeing 3L State. Injected read callback; one consistent Store.read per report. It emits no order/customer/provider identifiers. Immutable snapshots are validated using the existing frozen checkout validator and `acceptedLinePrice`, including accepted premium packs. Current catalog and Product Hub are never consulted. Unsafe records become quality counts.
- `contract.ts`: canonical tenant/source/currency/timezone context, capture and attempt facts, accepted product allocations, aggregate response types. Future adapters can implement ReportingSource without 3L models. Current deployment is single-tenant, no database migration or arbitrary tenant query.
- `engine.ts`: pure calendar validation, aggregation, comparisons and CSV. No DB/provider/UI dependencies. Money and sums use safe integer fils; unsafe totals fail closed.
- `api.ts`: authenticated read-only aggregate endpoints, range validation, role checks, no-store, noindex and downloadable CSV. GET summary returns current/previous daily/product/operational aggregates from one snapshot. Companion sales/products/operations endpoints return narrower projections. Export parity uses exactly the same engine. Staff-only session endpoint contains current actor and environment only.
- `src/commerce/Analytics.tsx`: dedicated route outside the full Workspace loader/polling. No `/api/workspace` is requested on Analytics. Uses existing shell, login and EN/TL resources; requests abort on unmount/new query and stale request IDs cannot replace newer results. Date filters persist in deep-link query; only submitted filters control exports. Accessible tables provide exact values behind the visual trend.

Product grouping uses SKU plus exact stored name/category to preserve historical definitions. Optional historical category remains Unclassified when absent. Variants and premium compositions are allocated at their accepted line price; nested preparation contents are not sales rows. Distinct compositions of the same SKU are summed into that SKU/definition's purchased boxes. Historical translation uses existing exact-definition English resolver for display only, never to price or classify; original text and warning remain if unrecognized.

## Scaling / unit economics

No new dependency, tracking bill, external analytics service, background worker or cache. Each request parses existing SQLite state once and scans orders/payments linearly, with maps for identity checks, grouping and day lookup. Date range capped at 366 days; the current embedded JSON storage requires a full snapshot scan independent of range. Existing DB and reports remain single-tenant. Large synthetic test: 12,000 independent orders/payments with deterministic totals and a 5-second ceiling. Future scale should add normalized read models, bounded retention, pagination and tenant-scoped storage before increasing workload. Never cache financial results across tenant/auth boundaries.
