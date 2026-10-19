# Closure 01 — PR #51

Baseline main: `589a78387c9efb5f4abd6e495d3746435c00dde5`. Initial PR head: `e3d3310ab1cda3901c79d4e9d78e508ac86d551b`.

Customer email content uses accepted immutable snapshots only, never current catalog prices/names. Customer-facing messages retain quantities, per-box composition, dates and original preparation text while excluding internal contact/address/payment references. Existing event/recipient policy is unchanged. New rows freeze HTML and text; old sent/pending content is not regenerated.

Added tests first reproduced two defects: legacy Conchas boxes without preparation were classified as singles, and malformed historical quantities silently removed product lines. Now missing box preparation and invalid quantities produce explicit unavailable/review warnings, never invented components or counts. Frozen-outbox test changes the current catalog after notification acceptance and confirms identical payload, original order, dates and exactly-once fake delivery. Optional malformed translated labels fall back safely to validated frozen names.

CI run 39329731340 showed WebKit Tricolor color-click completion without persisted third line. Full trace reveals smooth scrolling, unstable button position and fixed-header interception; no application/network error. Storefront/cart source is identical to main. Main standard repeats 40/40 and controlled-scroll diagnostic 6/6 passed; initial candidate 10/10 passed, so original failure is not deterministically reproduced. Test now waits for committed color, stable centered geometry and hit target before one real click, retains exact five-line assertions and adds active-scroll regression. No retries, forced clicks, arbitrary delays or skipped assertions.

Local: typecheck/lint/build; commerce 696/696; email browsers 28/28; Tricolor 28/28; secrets/audit. Chromium and WebKit. Commerce suites use fixed fixture ports, so run worktrees serially; a concurrent local run was interrupted and rerun successfully in isolation. Final GitHub results are recorded on the PR.

Synthetic mobile/desktop screenshots: docs/email/customer-previews. Coverage includes multiple distinct same-SKU boxes, Tricolor single quantities, missing snapshots, long original notes, escaping, privacy and accessibility. Native Gmail/Apple Mail remains manual UAT; browser previews are not native-client certification. No real sends/Production access. Review only; no merge/deploy.
