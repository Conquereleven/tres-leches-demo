# Local QA — 25 October 2026

Baseline `d0a94663404930ad0b90595cecad409256eb3f2c`; independent branch `fix/3l-checkout-customer-recovery`. Exact final Draft PR head is recorded in the delivery report and GitHub PR. No manual remote CI rerun.

| Command | Final result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS; existing bundle-size/Zod annotation/pending business information warnings remain |
| `npm test` | 745 passed, 0 failed/skipped |
| `playwright test -c playwright.checkout-recovery.config.ts` | 99 passed, 0 failed; Chromium 390/1440 and WebKit iPhone 13 emulation |
| `playwright test -c playwright.email.config.ts tests/email-e2e/customer-paid.spec.ts --workers=2` | 8 passed; Chromium/WebKit, pickup/delivery, 390/1440; axe clean |
| `npm run test:sites` | 4 passed |
| `npm run scan:secrets` | 0 findings, heuristic source/client-bundle scan |
| `npm audit --audit-level=moderate --json` | 0 vulnerabilities |
| `git diff --check` | PASS |

22 new Node tests (21 domain/reliability/content/status/capability tests and one background-worker HTTP test). 36 new checkout/Operations browser cases across three projects; 63 current checkout regressions also run. Eight new email browser cases. No test contacted a real payment/email provider; provider URLs were intercepted or backed by fake transports. HTTP servers used loopback and disposable databases.

Coverage includes duplicate notifications/reconciliation, only-first confirmed payment, pending/authorized/failed/cancelled/expired, historical/disabled/missing-recipient exclusion, first-name/public-number/schedule/total, frozen distinct pack compositions, delivery/pickup, concurrent Store handles, restart/unknown outcomes, stale pending activation epochs, Operations attempt/reference visibility and safe missing/invalid/unknown/rejected capabilities. Browser query-string success never grants authority. The existing hosted checkout and stale-cart regressions remain covered.

The recovery feature adds no token endpoint: the 410 expired-capability response is mocked future-compatible handling. Current existing capabilities are not claimed to have a new expiry policy.

## Investigation and corrected test failures

- First paid-confirmation tests exposed a fixture restart changing its activation epoch; restoring the persisted epoch correctly preserved dispatch eligibility. This validates the intended stale-epoch exclusion.
- The existing Resend adapter contract expected a status-only error message. It is preserved while retaining typed certainty for the new event. Internal templates, recipients and send requests are unchanged; existing reliability/Operations tests pass.
- First new paid-return browser case used an incorrect confirmation CSS selector; corrected to the actual existing component.
- The expanded three-project suite shared its disposable server database. The original checkout test hardcoded #001; it now asserts the exact public reference allocated in the authoritative response. It still forbids exposing the internal order ID.
- One Spanish fallback test overlapped an in-progress local rebuild clearing dist; the final browser run started after build completion.
- One 36→108 desktop stale-checkout case timed out in that earlier combined run. An isolated unchanged-code recheck passed, then the final full suite passed 99/99. No payment logic was changed to resolve it. Keep an eye on test timing; no evidence of a reproducible product defect was established.

Initial failures were investigated, not omitted or counted as passed. Logs for the final commands and the earlier combined browser run are retained in the workspace artifact folder `artifacts/3l-checkout-customer-recovery-20261025/` outside the application checkout.

## Remaining acceptance conditions

Native Safari on an actual iPhone and native mail-client rendering have not been exercised; WebKit emulation/browser HTML screenshots do not certify them. Perform the controlled, separately approved UAT in the rollout document. New fallback ES/AR wording and new English-only Tagalog Operations labels need normal language-owner review. Automatic cross-session recovery links and verified delivery receipts remain separate follow-ups.

## Safety

No merge, deployment, Production variables, Production database access, historical #026 reconciliation/resend, real customer email or real payment. Catalog, photos, pricing, pack business rules, DNS, Meta and internal recipient settings untouched. The ongoing media audit is not edited or included in this branch.

Verdict: **GO WITH CONDITIONS for founder review of the Draft PR**, not permission to activate or deploy.
