# Synthetic acceptance evidence

Baseline: `10a2176583da52890758dad57b9262a8af0e44f2`.

| Check | Local final result |
|---|---|
| TypeScript / lint | PASS |
| Build and locale/copy gates | PASS |
| Commerce | 799 passed, 0 failed |
| Chromium / WebKit checkout | 92 passed, 0 failed, 0 skipped |
| Recovery domain/storage | 17 passed (included in Commerce total) |
| Pack builder | 17 passed (included in Commerce total) |
| Sites | 4 passed |
| Dependency audit | 0 vulnerabilities |
| Secret scan | 0 findings; heuristic source/client scan |
| Accessibility | axe reports no violations on recovered pending/retry screens in both engines |

Screenshots are synthetic, with no actual customer or payment data:

- [Expired attempt → retained review at 390px](expired-ready-390.png).
- [Expired attempt → retained review at 1440px](expired-ready-1440.png).
- [Checked pending attempt → same hosted continuation](pending-review-390.png).
- [Uncertain provider → Arabic review hold](hold-ar-390.png).

New tests cover fresh provider verification, terminal-only replacement, independent SQLite workers sharing one successor, timeout/mismatched provider data, changed quote versus frozen amount, expired date/coverage/minimum, composition persistence, closed tabs and denied storage. Existing paid/frozen/idempotency/webhook suites remain in the complete run. All transport is fake, all databases disposable, all navigation to provider/bank pages intercepted.

Earlier test failures were addressed rather than hidden: build-dependent tests must run after build; the fake provider control file must be shared by the Playwright parent and workers; older stale-cart tests must confirm provider expiration before replacement and expect direct review navigation. The localization assertion targets recovery UI because the synthetic fixture SKU intentionally has no commercial translations. No runtime assertions, commercial data or financial safeguards were disabled.

This proves local behavior, not the final provider state or root cause of the Production customer reports. Production was not mutated or reconciled. The real reference requires a renewed read-only admin session; provider-attempt diagnostics remain an external incident evidence gap. Review the exact GitHub PR head and CI results before any separately approved release.
