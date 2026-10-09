# TL-18 validation — 2026-09-08 Dubai

Baseline b9b0675 revalidated before code: clean Git, 52/52 tests, 3/3 E2E, lint/typecheck/build/hosting PASS, audit 0. Initial sandbox restrictions on test sockets/npm access were resolved by approved reruns; no functional baseline discrepancy.

| Final check | Result |
|---|---|
| Lint | PASS |
| TypeScript strict | PASS |
| Domain/adapters/database/HTTP/integration | 76/76 PASS (52 preserved + 24 TL-18) |
| Build | PASS, compiled Node + preserved static Worker packaging |
| Hosting regressions | 4/4 PASS |
| Browser E2E | 4/4 PASS (3 preserved + HTTPS staging rehearsal) |
| Dependency audit | 0 vulnerabilities |
| Responsive | 390/768/1024/1440, no overflow in prior views and new readiness view |
| Browser console | Golden flow and authenticated staging interaction: no errors/warnings; unauthenticated 401 denial explicitly expected/tested |
| Backup | Online WAL-aware backup, integrity check, staging restore, retention and failure reporting PASS |
| Client bundle scan | No backend credential variable names or test-password fixture values found |
| Git diff whitespace | PASS |

## No-go regression evidence

- WA2 source cannot select WA1/WA3: Meta origin validation and three-number routing fixtures; runtime external sender disabled.
- Unknown zone, unknown fee, below minimum: explicit TL-18 server request tests create zero payment/job records.
- Paymennt amount/currency/reference mismatch: authoritative reconciliation tests reject without confirming.
- Duplicate reconciliation: a single Paid/Confirmed transition.
- Lost POST response: requestId recovery; one POST and one link, no blind duplicate checkout.
- Unknown Meta result: non-idempotent send tests stop uncertain work; no automatic resend.
- Unauthenticated operational request: 401 in staging over local HTTPS and existing HTTP tests.
- Operator/Manager admin access: server returns 403 for diagnostics and zone edits in HTTPS staging test.
- Missing staging config: fifteen required setting omission cases fail; unsafe origin/session/user-role/production/live flags fail.
- TEST seed: three non-deliverable fixture conversations and empty orders, ten blocked UAT cases; no payments/jobs; restart does not reseed.
- Environment identity: development/test/staging/legacy demo/integration DB promotion refused.

The new browser test creates an ephemeral localhost TLS certificate and proxy, starts a fresh compiled staging server with offline providers and test-only hashed accounts, exercises real Secure session cookies and RBAC, and removes its temporary infrastructure. It is not a staging deployment and does not prove public DNS/certificate validity or hosting volume durability. Test credentials are not operator onboarding credentials.

No real Meta sends, Paymennt creation/probes or Mapbox probes occurred. Provider adapter diagnostic tests inject HTTP fixtures. External provider connectivity, real accounts, off-volume backup recovery and client UAT remain BLOCKED — EXTERNAL CREDENTIALS / hosting acceptance.

Decision: NOT READY for release. TL-18 preparation work is implemented; existing Paymennt notification-contract and external-onboarding blockers remain. No new P0 issue identified in covered tests. No production activation, push or merge.
