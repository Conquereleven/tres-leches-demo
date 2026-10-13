# QA evidence — paid-order manager WhatsApp alerts

Updated 13 October 2026. Existing branch/PR: `feature/3l-paid-whatsapp-alerts` / #20. Continue original work; no new sprint/PR, no force-push.

Initial baseline: `04526fe69a5ec61134622ac5bca5c6b1f03d2357`. Prior #19 baseline: `5aaa33dba3483061d9688fabdf0fee9203d3c833`. Current final baseline: `cd3c6d9238e90d62d24dc9705c2c64b165d313a6` (main including OMS PR #21). Integrated current main into the already published branch by normal merge. Locale conflicts resolved by combining every new OMS translation with the alert labels, preserving main values for shared keys. HTTP routing/worker and Workspace changes auto-merged; no original feature branch/worktree modified.

| Final check                                                             | Result                                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Typecheck / lint / build                                                | PASS                                                                                           |
| Complete commercial/unit/integration suite                              | **568/568 PASS**                                                                               |
| Focused outbox + configuration + HTTP worker scenarios (included above) | **16/16 PASS**                                                                                 |
| Checkout Chromium / WebKit                                              | **19 + 19 PASS**                                                                               |
| Current OMS + address Chromium / WebKit                                 | **34/34 PASS** (390/768/1440, EN/TL, keyboard, accessibility, historical facts, commands/RBAC) |
| Sites packaging compatibility                                           | **4/4 PASS**                                                                                   |
| npm audit                                                               | **0 vulnerabilities**                                                                          |
| Source/client bundle secret scan                                        | **0 findings**, 1323 files in pre-documentation run; final publication scan recorded by CLI    |
| Git diff/format check                                                   | PASS                                                                                           |

The original 12 October baseline had 546 commercial tests, 38 checkout and 54 legacy Operations browser tests passing, with CI success on `129d51598a44b366f8b31f3b103dd386ed70fa6e`. The totals above are newly executed against the current OMS integration; they do not claim the earlier complete legacy Operations suite was rerun.

## Evidence and safety

- Customer gate independent: local HTTP server constructs DisabledWhatsAppProvider for customer conversations with `META_OUTBOUND_ENABLED=false`, while independent internal flag sends exactly one synthetic alert via intercepted Graph transport.
- No implicit recipient: missing/malformed manager yields none. Only configured synthetic recipient; collision and invalid explicit phone ID fail closed.
- Approved cutoff remains an external human decision; no activation timestamp supplied to Production. Historical, evidence-less, future and expired backlog guards covered, along with per-order event deduplication and claim-before-send.
- Two SQLite connections and restart preserve accepted message IDs and prevent resend; interrupted and ambiguous sends never automatically retry.
- Actual acceptance differs from delivery: HTTP fixture initially asserts `accepted`, `acceptedAt`, no `sentAt`; canonical signed delivery then becomes `delivered` without another send.
- HTTP fixture verifies challenge, altered raw bytes rejected 401, correct signature 200, duplicate signed callback and byte-identical order/payment records before/after receipts.
- Remote template name/body/language/category must match actual APPROVED metadata. Category is explicit, not defaulted; policy sign-off independent. Invalid internal JSON/cutoff disables only this channel and cannot crash checkout.
- Existing Resend/email, Paymennt reconciliation and operating-state regressions pass. Current OMS shows acceptance/delivery/read/suppressed/review states without modifying operational transitions.

All orders, databases, recipients and Graph responses in tests were synthetic/disposable. No real paid order used. No live Graph send/registration, Paymennt transaction, Resend send, Production SQLite access, Railway variable change or deployment. Production external check was only the expressly requested HTTPS webhook GET without verify token (403); dashboards and Railway name metadata were read-only.

An initial HTTP fixture check used the wrong service property (`whatsapp` instead of `wa`); corrected fixture now asserts the actual disabled customer provider. Typecheck caught the missing new accepted union member; fixed and all final checks pass. No failure waived. Browser tests regenerate tracked baseline screenshots; those generated files are restored from the integrated main snapshot to keep the PR focused.

**CODE READY FOR REVIEW / LIVE ACTIVATION BLOCKED.** Current account/permission/subscription evidence and exact missing Railway names: [Production readiness](./PRODUCTION_READINESS.md). Policy/category decision and template: [Activation notes](./README.md). No claim of Meta template approval or real delivery.
