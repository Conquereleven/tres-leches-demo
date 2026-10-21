# 3L-META-002 — historical QA evidence (15 October)

Baseline: `a75a0fa1637f4511ed0237e2b4fff621489e619a`. Isolated worktree/branch `feature/3l-meta-coexistence-inbound`. Original Pack Builder and SEO branches/worktrees were not edited or integrated.

| Check | Result |
|---|---|
| TypeScript strict (`npm run typecheck`) | PASS |
| ESLint (`npm run lint`) | PASS |
| Build (`npm run build`) | PASS; existing chunk-size/pending-business-information warnings |
| Complete commerce/unit/HTTP suite (`npm test`) | 606 passed, 0 failed |
| New coexistence unit/HTTP scenarios (included in commerce suite; also run separately) | 12 passed, 0 failed |
| Inbox Chromium/WebKit (`npx playwright test --config playwright.meta-inbound.config.ts`) | 8 passed; EN/TL × 390/1440 px × both engines |
| Checkout Chromium (`npx playwright test --config playwright.checkout.config.ts --browser=chromium`) | 21 passed |
| Checkout WebKit (same config, `--browser=webkit`) | 21 passed |
| Existing Sites packaging (`npm run test:sites`) | 4 passed |
| Dependency audit (`npm run audit`) | 0 vulnerabilities |
| Source/client bundle heuristic secret scan (`npm run scan:secrets`) | 0 findings |
| `git diff --check` | PASS |

## What was actually verified

- Good challenge returns exact plaintext; wrong token 403; changed raw bytes with original signature 401; unknown WABA/phone returns safe 400.
- Text and safe image/audio/video/document/sticker metadata normalize, without persisting media URLs. Bad time/echo sender/history thread and undocumented contact action are refused.
- Duplicate webhook deliveries persist once. Live, Business App echo and imported history deduplicate by original provider message ID. History-first live delivery, delayed mobile echo and overlapping history receipt states are covered.
- History is chronological and labeled, never a new live API window or AI candidate. Imported GPS cannot update delivery/order data. Contact sync does not create chats or clear assignment/unread; removal never deletes chats.
- Out-of-order read receipts retry until the observed message exists, preserve read against later sent/failed receipts and cannot match another conversation origin. Queue replay/restart does not duplicate messages.
- A real local HTTP fixture, real raw HMAC boundary and disposable SQLite process the documented envelopes; a >64 KiB synthetic history batch is accepted under the isolated WhatsApp limit. Both flags are false; the fixture blocks all external fetches and asserts **zero provider calls**, zero outgoing jobs, byte-identical historical order/payment snapshots.
- Synthetic AI inference enqueues a reply; a Business App echo changes the epoch/human state and the dispatcher aborts it before transport. This is a fake-model/local test, not live AI or WhatsApp.
- Browser Inbox labels distinguish Business App and imported history; media is honestly shown as metadata. All 8 scenarios have no console/page errors, horizontal overflow or axe violations, and no API writes. The browser layer uses a synthetic workspace snapshot produced through the normalizer/domain helpers; the HTTP fixture separately verifies actual persistence/worker behavior. No live auth/session or actual Meta receipt is claimed by these tests.
- Checkout scenarios preserve hosted payment/authoritative return behavior, stale-cart replacement, paid-state handling and historical Operations previews. All payment transport in that suite is the existing mock fixture.

## Visual evidence

Both images contain synthetic data only; no storefront/OMS redesign.

- [Mobile Inbox, 390 px](evidence/inbox-390.png)
- [Desktop Inbox, 1440 px](evidence/inbox-1440.png)

## Execution notes and limits

The first full run was started before compiling this new worktree; two pre-existing compiled-artifact tests failed for missing build output, and two developing tests used the wrong worker method name. After building/correcting those tests, the full suite passed. No failures were waived. The original Operations browser port was occupied by another task: it was left untouched and this PR adds an independent port/config (3278). No existing server was killed/reused.

The last read-only refresh of the existing Production configuration confirmed both outgoing flags false and Graph v26.0. GET of the existing number again returned ON_PREMISE/DISCONNECTED/NOT_VERIFIED/is_on_biz_app=true. No onboarding/subscription, template, token, account, number, configuration, real message, charge or production-data mutation occurred.

This historical evidence proves local direct-Meta contract handling, not number eligibility, complete history sync, real delivery or Production readiness. The META-003 direct-only decision and [current activation runbook](../direct-cloud-readiness.md) supersede all earlier provider-selection proposals.

## Changed files

- `server/adapters/meta.ts`: delegates only inbound normalization; outbound adapter preserved.
- `server/adapters/meta-inbound.ts`: documented envelopes/identity/media validation.
- `server/domain/commands.ts`, `server/domain/model.ts`: additive event/contact/media types.
- `server/domain/whatsapp-inbound.ts`: observation application, matching, deduplication, provenance and mobile takeover.
- `server/domain/service.ts`: reuses existing durable queue/worker and calls those helpers; excludes history from send windows and GPS order effects.
- `server/domain/agent-gateway.ts`, `server/agents/context.ts`: live-only inbound trigger/window.
- `server/readiness.ts`: imported history cannot masquerade as last live inbound.
- `server/http.ts`: WhatsApp-only batch cap and sanitized normalization rejection; financial requests unchanged.
- `src/commerce/Workspace.tsx`, `src/commerce/AgentPanel.tsx`, `src/commerce/locales/{en,tl}.json`: provenance/media/pause labels in existing Inbox.
- `tests/fixtures/{meta-coexistence.ts,meta-inbound-server.ts}` and `tests/commerce/{meta-coexistence.test.ts,meta-coexistence-http.test.ts}`: synthetic contract/security/recovery/race evidence.
- `tests/operations-e2e/meta-coexistence.spec.ts`, `playwright.meta-inbound.config.ts`: isolated browser evidence.
- `docs/meta/coexistence-inbound/{README.md,QA.md,evidence/inbox-390.png,evidence/inbox-1440.png}`: decision, checklist and review evidence.

No edits to Paymennt/Resend adapters, paid-order notification dispatcher, order workflow, catalog/prices, delivery rules, storefront, dependencies, Railway or env files. No SQL migration/backfill. Optional JSON fields are applied only when an authenticated observed event is received.

## 3L-META-003 — current baseline and integration (16 October 2026)

- Original PR #35 head: `36b69a5f993c9262f493c56eaf5b7b6bad58770c`.
- Deployed main integrated: `8f5cc785fe408b0288a3b8403983787cf57721ec`.
- Baseline merge commit: `dd69f2b`. A normal merge preserves the existing PR/review history instead of rewriting its published commits. No main or other feature branch was changed.
- Conflicts resolved: `server/domain/service.ts` imports retain both packs/distinctLines and coexistence helpers; `src/commerce/locales/en.json` and `tl.json` retain pack eligibility and inbound provenance labels. No whole-file side selection.
- Added actual documented `history.value.messages` attachment metadata and `account_update` observations without phone metadata, plus history-consent-denied evidence. The separate attachment cannot invent direction or replace an unrelated text message. Original source/counterparty/wamid must match; early metadata retries durably. Lifecycle observations never control accounts/outbound/order states.
- Complete current commerce/unit/HTTP suite: **627 passed, zero failures/skips**. Includes the four new direct-contract cases and the extended raw-body HTTP fixture (16 focused coexistence cases in total).
- Fresh read-only Meta Graph audit and authenticated official UI/documentation inspection; no mutation or live transport test. All five relevant subscription fields are off. The actual Embedded Signup Manager offers v4/session3 but blocks Production hosting pending App Review/Access Verification; no login configuration exists. See the current runbook for proven blockers versus unknown own-business exception.

| Current check | Result |
|---|---|
| Typecheck / lint / final build | PASS; existing chunk/pending-business-information warnings only |
| Full commerce / unit / HTTP suite after final build | 627 passed, 0 failed, 0 skipped |
| Dedicated Inbox Chromium/WebKit | 8 passed (EN/TL × 390/1440) |
| Personalized packs Chromium/WebKit | 24 passed; fixed prices, mixtures, published eligibility and immutable kitchen/ticket history |
| Hosted checkout Chromium / WebKit | 21 + 21 passed; fake provider/disposable SQLite only |
| Full Operations Chromium/WebKit | 91 passed initially; 1 Chromium390 axe test timed out without a violation assertion. Same test, same 30-second limit, no code changes: isolated rerun passed in10.2s. All 92 scenarios covered; initial failure retained in evidence |
| Sites packaging | 4 passed |
| npm security audit | 0 vulnerabilities |
| Secret scan, final source/client build | 1,408 files scanned, 0 findings (heuristic, not a mathematical proof) |
| Git diff whitespace check | PASS |
| GitHub Commerce validation | SUCCESS on runtime commit7d5a78d4cdfd4242a9205f4dcb4cbd94c56993ba, run38879246080 |
| GitHub Personalized packs regression (packs/checkout/Product Hub/Operations) | SUCCESS on same runtime commit, run38879246145 |
| RG3 jobs | SKIPPED by their existing branch-name guard; not claimed as passed |

No accessibility check was waived, no timeout raised, and no unrelated Operations source was edited. Browser-generated Operations screenshots were restored after review to avoid unrelated PR churn. A subsequent documentation-only commit records these results without changing the tested runtime source. Both applicable GitHub checks were freshly confirmed successful; the CI log-archive download itself encountered a TLS timeout, so detailed CI totals are not invented. Local logs, sanitized Graph observations and read-only UI evidence are retained in the task artifact directory.

No production data/configuration, commercial catalog, Meta subscription/account/number, Paymennt/Resend adapter, payment/order state, real outbound message or charge was changed. The only Production interactions were authorized read-only status/configuration queries.
