# Operations Experience V2 — design and metric contract

Audit baseline: main d0a9466. Current-run before screenshots at `artifacts/3l-consolidated-release-20261025/screenshots/before/`, synthetic authenticated fixture, EN/tl, 390/1440. Existing Operations shell and palette remain the visual target; no shell/theme replacement.

## Evidence-based audit

1. Overview: five operational cards, six-row activity table and global warning totals. Card destinations mostly open unfiltered Orders, so they do not reliably describe the destination. No today agenda or confirmation-email review queue. Trusted current-state counts exist, but absence of dates in fixture/source is honestly shown.
2. Analytics: trustworthy server aggregate API, explicit financial/provenance disclaimers, date filter and CSV already work. The long stack gives equal weight to summary, daily rows and small operational distributions. No weekly/monthly reading or category ranking; previous-period information is only a captured-volume percentage.
3. Responsive/accessibility: preserve existing keyboard shell, EN/tl preference and underlying tables. Extend existing 44px controls and no-overflow layout; verify with axe and Chromium/WebKit, not screenshots alone.

No native-device, present-day LIVE certification or Production data access is claimed. Issue #47 is still open; PR #46 reports 98/98 and AED1164 against the Oct19 snapshot. Those results are historical evidence only. Preserve unverified LIVE/TEST and captured-not-net warnings.

## Small implementation specification

Shared vocabulary: restrained white surfaces, graphite text, blush grouping, muted gold markers; no purple or new library. A compact editorial header, readable numeric cards, section navigation, measured bars backed by tables, and consistent spacing unify both views. New styles live in a scoped V2 stylesheet; keep shell/navigation/OMS geometry intact.

Overview wireframe: intro + snapshot date → operational cards with exact supported filters → admin/manager-only today financial summary from the existing Analytics API → current-state pipeline → today's priorities and exception review → recent orders with method, date/time and order links. No destructive controls.

Analytics wireframe: existing warnings + date controls → Sales / Products / Operations anchors → existing authoritative KPIs + period comparisons → trend granularity (day/week/month) with exact aggregate table → product ranking + historical-category allocation → current paid-cohort distributions + quality/provenance details and existing CSV exports.

## Source contracts

| Information | Authority / limitation |
|---|---|
| Today paid count, captured AED and mean | Existing read-only Analytics summary endpoint, admin/manager only; never sum current catalog or unpaid workspace quotes |
| Operational stage/agenda | Current workspace Order.state and stored fulfillment schedule; not historical throughput |
| Address review | Open delivery order lacking VERIFIED evidence; missing data remains reviewable, not assumed verified |
| Email issues | Stored failed customer outbox outcomes (including unknown outcomes in PR #63); active sends are not treated as failures; no automatic resend or delivered claim |
| Payment/job attention | Stored uncertainty/failure flags; no new reconciliation or provider call |
| Weekly/monthly trend | Sum server-owned daily buckets in integer fils; retain partial first/last periods, same date range and daily CSV authority |
| Category rankings | Aggregate historical categories already in report.products; null stays Unclassified; no current Product Hub lookup |
| Previous period | Existing server-owned previousRange/current/previous; zero baseline gives no percentage, not fabricated growth |

Product-by-day trends, validated family taxonomy, profit, refund amounts/net revenue, conversion, repeat rate, CLV, SLA breaches and preparation durations are unavailable from this contract and deferred. No migration, tracking, API writes or ledger replacement.

Shared components are presentational and accept generic titles/rows/counts rather than importing customer data. Failures, empty data and restricted roles show explicit states. Filter changes do not leave stale exports or charts labeled with new unsaved dates.
