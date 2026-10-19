# 3L-ANALYTICS-001 — implementation and review evidence

Issue: [#45](https://github.com/Conquereleven/tres-leches-demo/issues/45). Baseline main: `464cad9b0d1f4461961034b11497c9f356d3348d`. Development branch: `feature/3l-analytics-reports`.

## Delivered

Authenticated `/operations/analytics`, sidebar entry and direct route; Dubai date presets/custom filters and equal-length period comparison; verified captured payment volume, paid orders, average and accepted units/boxes; daily chart plus exact accessible table; historical SKU/definition/category allocations; delivery fee separation, current fulfillment stages, unpaid attempts and refund/dispute counts; safe daily/product CSV with quality/scope columns. No raw workspace request in Analytics. EN/TL labels retain per-user preferences; merchant-authored historical names use the existing exact-definition English resolver with review warnings.

- [Financial audit and metric dictionary](metrics-dictionary.md) — fixed before UI implementation.
- [Architecture and CornerTech boundaries](architecture.md).
- [Security, limitations, instrumentation, release and rollback](security-and-release.md).

## Synthetic visual evidence

These are entirely fictional fixtures on a local TEST server. They do not represent live sales or customers. No real data was accessed for this sprint.

| English | Tagalog |
|---|---|
| [Desktop 1440px](screenshots/analytics-en-1440.png) | [Desktop 1440px](screenshots/analytics-tl-1440.png) |
| [Mobile 390px](screenshots/analytics-en-390.png) | [Mobile 390px](screenshots/analytics-tl-390.png) |

## Local QA

- `npm run typecheck`, `npm run lint`, `npm run build`: pass. Existing Vite bundle-size and pending business-information notices remain; no new dependencies.
- `npm test`: **681/681** commerce/domain/HTTP/integration tests pass, including 14 new analytics tests. Existing catalog, premium-pack, Tricolor, immutable order and notification regressions remain in the suite.
- Analytics unit/HTTP tests: accepted historical prices, fees, multiple lines, boxes vs components, premium/Tricolor preparation, missing/inconsistent snapshots, refunds/partial refunds/chargebacks with unavailable amounts, pending/authorized/failed/cancelled, duplicates and ambiguous captures, Dubai midnight, malformed dates, period comparison/zero baseline, safe integer overflow, formula-safe CSV, privacy, real cookie RBAC and SQLite byte equality.
- Large synthetic ledger: **12,000** orders/payments with deterministic totals, tested against a 5-second ceiling (local execution around 0.1 seconds). No Production performance claim.
- `npx playwright test --config=playwright.analytics.config.ts`: **36/36**, Chromium/WebKit; EN/TL at **320, 375, 390, 430, 768, 1440px**, axe scan with zero violations, overflow assertions, real aggregate API, authentication/roles, refresh/deep links, CSV download, empty/custom ranges, session expiration, recovery and partial-data warnings. No `/api/workspace` calls or non-login mutations on the Analytics screen.
- Existing checkout: **21/21 Chromium + 21/21 WebKit**.
- Existing Operations: **91/92 initial pass**; one WebKit dashboard test encountered Vite hot-reload import errors while files were being edited. Exact test repeated after edits: **1/1 pass**. No skipped or weakened assertions. CI repeats the complete suite on an unchanged checkout.
- `npm run test:sites`: **4/4**.
- `npm run scan:secrets`: zero findings (heuristic source + built-client scan).
- `npm run audit`: zero vulnerabilities.
- Real-device validation is not claimed; responsive browser automation is Chromium/WebKit, not physical iPhone/Samsung certification.

## Founder review recommendation

GO for code review, conditional on final CI checks. No Production merge/deploy is included. Review the dictionary and unavailable financial metrics before operational adoption. A separately authorized live reconciliation sample should precede financial reliance. Native review of new Tagalog labels remains advisable.

No commercial catalog, price, payment flow, provider configuration, customer/order/history, Production SQLite, Railway, email or WhatsApp change. No schema migration, tracking, event instrumentation, AI conclusions or dependency added. Rollback is code-only, never restoring the business database.
