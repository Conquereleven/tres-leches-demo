# Tres Leches — Integration Gate 2

**Verdict: READY FOR FOUNDER RELEASE APPROVAL**

Verified 11 October 2026. No known code integration blocker was found for the
exact commits below. This verdict requests review/approval; it does not authorize
merge, deployment, catalog activation, or a Production data migration. The
pre-release controls below must be completed before the connected main branch
is changed.

## Exact tested sources and isolated branches

| Source | SHA | Observed state |
| --- | --- | --- |
| main / currently deployed source | `e2a82387549d5861e110178d6b9c8b8ae7f84f10` | unchanged |
| PR #9, frozen checkout | `ff1b9565c1d03f51191cb3bfa4200186cbe3aa06` | OPEN |
| PR #7, Catalog Foundation | `b65be4915327f74ef54325bf7793bc15f54596da` | OPEN |
| PR #10, Operations V2 | `dcf4c9c23827721e79981ec491040aa55597d936` | OPEN |

Canonical Git repository: `/Users/rodrigom./code/tres-leches-demo`.
Its existing checkout remains on `fix/3l-paymennt-new-only-gated` at
`4bd4cbe7422a8666ae225aa15db128d886109afe`, clean and unchanged.

Primary test branch: `integration/3l-gate-2` in
`/Users/rodrigom./Documents/Codex/2026-09-07/referenced-chatgpt-conversation-this-is-an/worktrees/3l-integration-gate-2`.

| Stage | Exact QA SHA |
| --- | --- |
| main + PR #9 | `5a73028e760cad147293eb0597f750ba863218b4` |
| add PR #7 | `6858a2641de0b80777b717cb1b3b0c6c555a1bf3` |
| add three interaction regressions (primary QA subject) | `d359b7250364ca54e1411f6ce2fb699871924a3b` |

Separate smoke branch: `integration/3l-gate-2-dashboard-smoke` in
`/Users/rodrigom./Documents/Codex/2026-09-07/referenced-chatgpt-conversation-this-is-an/worktrees/3l-gate-2-dashboard-smoke`.
It adds unchanged PR #10 to the primary QA subject at
`b478d78c62a27f331034af2d688b675c342983bb`.

Local integration merges were made only in these new branches. No existing PR,
feature branch, stash or unrelated worktree was modified. In particular the
uncommitted Conchas work was preserved. Neither integration branch was pushed,
and no additional PR was opened. Any subsequent report-only commit has the same
application source as the primary QA subject.

## Integration, conflicts and fixes

PR #9 integrated cleanly, followed by PR #7. Git auto-merged `server/http.ts`
without conflict. Source review confirms both changes survived:

- Catalog read handler, imports and `catalogReadEnabled` gate from PR #7.
- Hosted checkout quote-revision header parsing/forwarding from PR #9.

Production still refuses the shadow catalog API even if its flag is set. No
write API or runtime bootstrap was introduced. The foundation remains optional;
`State.catalog` remains the sole commercial authority.

PR #10 also merged cleanly into the separate smoke branch. Its delta against the
primary QA subject contains no server/shared/public-storefront/dependency-lock
changes. No application conflict repair or production-source fix was necessary.
The only new test source is `tests/commerce/integration-gate2.test.ts`, committed
locally, with three interaction regressions:

1. Bootstrap and repeated shadow reads preserve orders, payments, conversations,
   zones, jobs, capability receipts and the checkout quote revision.
2. Stale foundation revision fails closed. Rehashing fixture metadata after a
   catalog name/price change does not change an accepted hosted payload; stale
   preaccept quote returns 409, while a fresh checkout uses current prices.
3. Foundation bootstrap cannot reconstruct incomplete paid history from current
   catalog data; stored payment/order records remain identical, summary is absent,
   and resume/replay fail closed without a provider call.

Only disposable fixtures were changed for these tests. This is not a publication
endpoint or permission to edit commercial data.

## Complete QA evidence

Logs and read-only infrastructure observations are stored in `evidence/` beside
this report. Test providers are injected in-process; the browser servers use
private disposable SQLite paths. No card input or real Paymennt API call occurred.

| Gate | main + #9 | #9 + #7 | separate #9 + #7 + #10 smoke |
| --- | --- | --- | --- |
| Typecheck | PASS | PASS | PASS |
| Lint | PASS | PASS | PASS |
| Build + i18n/customer-copy audits | PASS | PASS | PASS |
| Full commerce unit/integration/HTTP | 468 PASS | 480 PASS | 487 PASS |
| Checkout Chromium | 19 PASS | 19 PASS | 19 PASS |
| Checkout WebKit | 19 PASS | 19 PASS | 19 PASS |
| Historical ticket browsers, EN/TL | — | — | 16 PASS (8 Chromium + 8 WebKit) |
| Focused operations/ticket/frozen/foundation units | — | included above | 30 PASS; included in full suite |
| Sites packaging | — | 4 PASS | unchanged packaging contract |
| Secret scan | — | 900 files, 0 findings | 971 files, 0 findings |
| npm security audit | same dependency lock | 0 vulnerabilities, all severities | same dependency lock |
| Whitespace/conflict checks | PASS | PASS | PASS |

Counts are separate runs, not additive unique test coverage. All reported suites
have zero failures/skips. Security audit covers the unchanged lockfile; the
secret scan is heuristic, not a guarantee against every possible disclosure.
A final report/source scan also passed: 904 files, zero findings.
Existing build warnings about chunk size and pending business information remain;
no new build failure or dependency/framework change was introduced. Browser/HTTP
suites were serialized where they share fixture ports.

## Checkout guarantees verified

The freeze point remains the existing SQLite acceptance transaction committing
order lines + catalog snapshot + quote + payment + receipt + outbox. Hosted
creation uses validated snapshot SKU/name/quantity/unit prices and stored fees,
with subtotal + fee equal to committed quote/payment total in AED.

The 21 PR #9 frozen-checkout cases and existing commercial regressions cover:
preaccept price change; postaccept price/name/deactivate/remove; delayed creation;
eight concurrent replays; independent SQLite worker claims; restart pending;
expired processing lease; rejected/uncertain provider results; changed/superseded
carts; missing/partial/duplicate/inconsistent snapshots; multiple SKUs with an
explicit historical fee; expired replacement; paid snapshot and payment
immutability during late completion. Late authoritative reconciliation continues
to affect only its original order. No new pricing source, financial state,
provider endpoint, signature or billing/delivery mapping was added.

Current browser checkout sends `X-Checkout-Quote-Revision`; the E2E asserts the
actual header. Comparison happens at initial acceptance, not on an accepted
idempotent replay. A changed quote creates no reservation or provider request.
The revision remains optional for old clients, which continue to get current
server pricing at initial acceptance. New dynamic clients must forward it.

Unknown Paymennt creation outcomes require reconciliation; no blind duplicate
POST is added. Signed webhooks remain signals, authoritative GET remains payment
truth, and duplicate notifications do not produce duplicate ORDER_PAID events.
Nonzero fee coverage is a historical fixture only; current delivery rules remain
unchanged. The retired token adapter was neither activated nor redesigned and
retains its existing fail-closed guard.

## PR #10 compatibility result

**PASS.** Historical tickets use only `catalogSnapshot`, never live catalog names
or prices. Missing, empty/incomplete or duplicate snapshot rows show the EN/TL
review-required alert and suppress the entire ticket. Changed current catalog
names/prices do not replace accepted names. Sixteen browser cases confirm these
behaviors in both engines. Ticket rendering remains preview-only, with no print
transport or Print/Reprint action and no write API calls.

Ticket validation is presentation validation; it does not claim to validate a
payment total or charge a customer. Frozen financial consistency remains the
server's stricter domain responsibility. Order/payment records and raw state
enums are unchanged by preview or localization. Products still shows the honest
unavailable state; this gate does not connect unfinished Product Hub editing.

## Railway chain, backups, health and rollback

Read-only Railway metadata: project `1f9a94c1-0574-49a9-b579-bf6af3aad601`,
Production environment `142de30a-4879-4d04-85b9-12e79aa51bda`, service
`fe8c1417-39ca-4038-b94e-68659ab1c659`.
Current deployment `bde0ce90-50d7-4a3b-a10e-2750613a398e` is SUCCESS at the main
SHA above, single replica in sfo, volume `/data` (5000 MB), no staged changes.
The public `/api/health` returned `ok:true`, environment production, mode live,
and the same revision. Source review verified this endpoint does not read SQLite
or call providers; no other Production application/data endpoint was queried.

Effective service reports RAILPACK, `npm run build`, `npm start`, `/api/health`,
120-second timeout. Repository `railway.json` names NIXPACKS with the same build
and health commands. This pre-existing metadata difference is recorded, not
changed; verify the effective builder/runtime on the final approved artifact.
SQLite requires the supported Node runtime and one writer replica. No Railway
configuration/variable values were changed or secret values retrieved.

The service is connected to GitHub main. Treat changing main as a potential
release trigger, not merely a harmless preparatory merge. GitHub main is currently
unprotected with no required status checks. The existing workflow validates code
but contains no Railway deployment commands and does not itself enforce release
approval. Browser gates currently remain local/manual rather than CI jobs.

Before an approved release:

1. Recheck main/PR SHAs and approve the exact release content/order. Run required
   checks on the final main candidate before triggering the connected release.
2. Within a separately authorized release operation, identify the real private
   DB/backup paths, create an online SQLite backup, verify `integrity_check`,
   permissions 0600, private storage, and record a pre-release logical baseline.
   Include any external registered webhook secret file in private recovery custody;
   a SQLite backup does not contain that file. Preserve secrets and provider modes.
3. Record deployment rollback anchor `bde0ce90-50d7-4a3b-a10e-2750613a398e` before
   replacing it. Railway reports it and the previous
   `fb78d470-a648-4fd6-a6f5-3fdc86fdc857` as rollback/redeploy capable.
4. Keep catalog API/editing activation disabled. No Production catalog bootstrap
   or schema/data migration is needed for this code integration. PR #7's CLI
   rejects Production; any future migration needs its own approved plan.
5. After an approved deployment verify exact build SHA, health/static/auth and
   storage readiness with the authorized operator. Health alone is liveness:
   `/api/ready` checks storage; authenticated diagnostics include backup readiness.
   Verify historical financial counts/states under that separate authorization.

Backup code and configuration were reviewed but LIVE backup files, freshness,
path values and recovery contents were not inspected because Production SQLite
access is forbidden here. A disposable foundation-enabled SQLite backup restored
with integrity `ok`, identical state, mode 0600 and all 236 fixture catalog records.
Existing full-suite production-profile tests also validate clean boot, persistent
storage isolation, authentication, port binding and backup readiness, all locally.

Rollback: redeploy the recorded previous application artifact while retaining
`/data`. There is no new SQL migration in these PRs. Never restore a whole old
SQLite database over newer payments/orders. Code rollback to pre-#9 restores the
known live-catalog worker hazard; keep dynamic commercial writes disabled. Any
selective data correction would require a separate backup and audited plan.

## Outstanding risks / release prerequisites

- Founder approval and a fresh private Production backup are still required.
  Neither merge nor deployment has been performed or authorized by this report.
- Connected main + no enforced branch/check gate requires coordinated manual
  release approval. Branch protection/deployment gating is recommended but was
  not altered within this request.
- Effective Railway builder/runtime must be confirmed at the final release; live
  backup freshness and secret-file recovery are unverified, not asserted ready.
- Old clients may omit the preaccept quote revision. Accepted checkout safety
  still holds; future dynamic storefront consumers need explicit revision handling.
- Incomplete historical snapshots require manual review; no backfill is proposed.
- Product Hub publication/RBAC/concurrency/history, uploads, translation workflow
  and dynamic storefront adoption remain Sprint 2 work, not completed by this gate.
- PR #10 printing remains unconfigured preview-only. None of this gate establishes
  printer connectivity, Meta approval, or new provider activation.

Stop point: report and local reproducible test branches only. No main merge,
remote branch push, Railway deployment/configuration change, Production SQLite
access/modification, or real Paymennt transaction occurred.
