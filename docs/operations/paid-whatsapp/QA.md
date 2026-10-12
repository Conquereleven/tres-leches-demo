# QA evidence — paid-order manager WhatsApp alerts

Date: 2026-10-12. Isolated branch: `feature/3l-paid-whatsapp-alerts`.

Initial baseline: `04526fe69a5ec61134622ac5bca5c6b1f03d2357`.
Final integrated baseline: `5aaa33dba3483061d9688fabdf0fee9203d3c833` (PR #19 merged separately during this task).
Reviewed #19 head: `0f31eb77c48197b962949fe77e47796ff45597b2`.
No original branch/worktree changed. Rebase conflicts: `.env.example` (keep both email and WhatsApp variables), `server/domain/service.ts` (keep email recorder and WhatsApp receipt imports). HTTP worker, domain model and existing tests auto-merged and were regression-tested. Payment-confirmation block preserves #19's internal email and the existing order transition.

| Check                                                                          | Final result                                                                             |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                            | PASS                                                                                     |
| `npm run lint`                                                                 | PASS                                                                                     |
| `npm run build`                                                                | PASS                                                                                     |
| `npm test`                                                                     | 546/546 PASS on integrated source                                                        |
| Focused `node --import tsx --test tests/commerce/paid-whatsapp-alerts.test.ts` | 10/10 PASS; subsequent strengthening uses two independent SQLite connections and restart |
| Checkout Chromium, `playwright.checkout.config.ts`                             | 19/19 PASS on integrated source                                                          |
| Checkout WebKit, same config                                                   | 19/19 PASS on integrated source                                                          |
| Operations Chromium/WebKit, `playwright.operations.config.ts`                  | 54/54 PASS; includes #19 address display and EN/TL RBAC/tickets at 390/768/1440          |
| `npm run test:sites`                                                           | 4/4 PASS                                                                                 |
| `npm audit --audit-level=moderate`                                             | 0 vulnerabilities                                                                        |
| `npm run scan:secrets`                                                         | 1289 files scanned, 0 findings (heuristic source/client bundle scan before this QA note) |
| `git diff --check`                                                             | PASS                                                                                     |

All orders/databases/providers were synthetic/disposable; Graph activation checks used injected fake fetchers. No live WhatsApp message, payment/provider transaction, production DB access, deployment or environment change occurred. GitHub and npm registry access were used only for PR coordination/publication and dependency audit.

Focused coverage: duplicate-recipient normalization; invalid/missing/disabled cutoff; historical suppression; confirmed/reconciled identity guard; same-source prevention; legacy rows; expired backlog; concurrent claims; ambiguous failure without retry; read-only sender/template gates (including disconnected sender); all four frozen parameters; idempotent canonical status receipt with unchanged orders; delivered not regressed by failure; persistent accepted ID/timestamps and restart without resend. Existing payment suites cover authoritative reconciliation, duplicate callbacks and frozen historical amounts.

Fresh worktree initially had no compiled frontend, so the first canonical-host test returned 404. It passed after the required local build; no routing change was made. The initial existing WhatsApp fixture lacked a secure origin; it now explicitly uses `https://3l.example` as the new production-safe template-link contract requires. Early sandbox IPC/Vite-cache restrictions were resolved with authorized local-test execution. No failed test is hidden or waived.

Browser tests regenerate their existing tracked screenshot evidence. Those generated baseline screenshots were restored in this isolated worktree to keep the PR focused; unrelated approved media are unchanged.

**Verdict: code ready for review; actual Meta activation remains blocked.** Exact remaining requirements and template draft are in [README](./README.md). `META_OUTBOUND_ENABLED` stays false. No claim of Meta approval or real delivery is made.
