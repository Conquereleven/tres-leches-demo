# Product Hub V2 activation readiness — 13 October 2026

**Decision: ACTIVATION BLOCKED / scoped permission patch ready for review.**
No Production write, feature activation, role assignment, backup export, provider call,
merge or deployment was performed by this audit. All mutation rehearsals used disposable
fixture databases with fictitious orders. Existing Product Hub/dynamic storefront was
reused; no replacement architecture or catalog reconstruction was introduced.

## Baseline and live evidence

Both agents start from current `main` at
`def0c1f8b1a79d97faa9e4b9eddbf0d1b12e23f9`; no commits after the supplied baseline.
Production inspected: `ef5341dd-f57e-4ae9-a875-63633a69275b`, same approved source SHA,
SUCCESS. Deployment changed externally since #22's release; this team did not deploy.
SQLite `/data/3l-production.sqlite` was opened with `DatabaseSync({readOnly:true})`.
Compiled existing `catalog-foundation.js audit` returned integrity `ok`, profile
`release-production`, decision `BLOCKED`. No private order/customer records were exported.
Read-only selected flag/price recheck timestamp: **2026-10-13T13:55:02.832Z**.

| Fact                         | Evidence                                                           |
| ---------------------------- | ------------------------------------------------------------------ |
| Reference and stored SKUs    | 236 / 236; no missing, extra or duplicate SKU                      |
| Stored active/inactive       | 228 / 8                                                            |
| Approved active/inactive     | 216 / 20                                                           |
| Foundation / Product Hub     | absent / absent                                                    |
| Product plan                 | 94 total, 74 public, 216 mapped, 20 legacy archival SKUs           |
| Missing planned translations | 0                                                                  |
| Orders/payments              | 8 / 8 (aggregate only)                                             |
| Catalog fingerprint          | `63a5c50d47aac26ec0db4bee681e59f316be00946ed43802976b31fd3a416649` |
| Protected state fingerprint  | `2c772c56ab5f537d98f09da24a265e1f0ad2bbb242269dc0dae398cccd0f1f0f` |
| Sources fingerprint          | `2f0b123a71aee0904a5c60b3c3963355fb8a6483dc6b4a045711db4581b6fbe9` |

All five flags are **absent**, therefore off:
`PRODUCT_HUB_ENABLED`, `PRODUCT_HUB_PUBLISH_ENABLED`,
`STOREFRONT_DYNAMIC_CATALOG_ENABLED`, `STOREFRONT_DYNAMIC_CATALOG_PRODUCTION`,
`CATALOG_READ_API_ENABLED`. No token or provider setting was read into this report.

### Hotfix #22 retained — all ten exact matches, one row each

| SKU                                                                   | Live / approved AED |
| --------------------------------------------------------------------- | ------------------: |
| `pan-de-muerto-traditional-azucar-mini-40-g-chocolate-covering`       |                  18 |
| `pan-de-muerto-traditional-azucar-individual-70-g-chocolate-covering` |                  21 |
| `pan-de-muerto-traditional-pack-6-mini`                               |                  60 |
| `pan-de-muerto-traditional-pack-12-mini`                              |                 115 |
| `pan-de-muerto-traditional-pack-6-individuales`                       |                  72 |
| `pan-de-muerto-traditional-pack-12-individuales`                      |                 140 |
| `pan-de-muerto-filled-pack-6-mini`                                    |                 100 |
| `pan-de-muerto-filled-pack-12-mini`                                   |                 190 |
| `pan-de-muerto-filled-pack-6-individuales`                            |                 120 |
| `pan-de-muerto-filled-pack-12-individuales`                           |                 235 |

### Confirmed discrepancy: twelve retired rows

Exactly 24 field differences: each of the following is stored `active:true` /
`availability:available`, whereas the approved source is `false` / `unavailable`:

- `pan-de-muerto-traditional-ajonjoli-mini-40-g-chocolate-covering`
- `pan-de-muerto-traditional-ajonjoli-individual-70-g-chocolate-covering`
- `pan-de-muerto-filled-crema-diplomatica-vainilla-mini-chocolate-covering`
- `pan-de-muerto-filled-crema-diplomatica-vainilla-individual-chocolate-covering`
- `pan-de-muerto-filled-chocolate-mini-chocolate-covering`
- `pan-de-muerto-filled-chocolate-individual-chocolate-covering`
- `pan-de-muerto-filled-mascarpone-y-cajeta-mini-chocolate-covering`
- `pan-de-muerto-filled-mascarpone-y-cajeta-individual-chocolate-covering`
- `pan-de-muerto-filled-mascarpone-y-fresas-mini-chocolate-covering`
- `pan-de-muerto-filled-mascarpone-y-fresas-individual-chocolate-covering`
- `pan-de-muerto-filled-pistachio-mini-chocolate-covering`
- `pan-de-muerto-filled-pistachio-individual-chocolate-covering`

They remain **unorderable** through existing `RETIRED_SKUS` listing/checkout guards;
the discrepancy does not authorize reactivation. Foundation correctly refuses to
bootstrap while they lack active-product mapping. No prices, names or other fields differ.

## Proven permission gap and scoped patch

Before this patch manager was view-only, so Lisa could not draft as a non-publisher.
Managers can now prepare/save/discard the shared private draft, edit family/media metadata,
and upload draft media. Admin alone can publish. API checks the role before looking up
publication idempotency receipts or opening a write transaction. Manager cannot replay
an admin publish key, inject role/permissions, bypass optimistic version/revision checks,
or change published prices via a draft. Operator/agent remain denied. EN/TL controls stay
localized. All managers inherit this capability; approve that role policy and Lisa's
actual identity assignment before activating. No live account was changed.

Draft is shared with optimistic concurrency, not one private workspace per employee.
Administrator must review before/after changes and the exact latest revision before
publication. No role-management or permission-granting command is exposed by Product Hub.

## Isolated rehearsals and QA

- Typecheck, lint, build: PASS.
- Relevant Foundation/bootstrap/Hub/domain/real HTTP/Operations-name tests: **34/34**.
  Includes read-only audit, discrepancies blocking, separate twelve-row retirement,
  verified fixture backup, fingerprint-guarded initialization, idempotence, safe metadata
  revert, catalog updater rebase, publication/revisions, failure rollback and restarts.
- Added domain and HTTP manager regressions: draft/media accepted, published checkout
  prices unchanged until admin publication, duplicate save replay, stale version refusal,
  manager publish refusal, role injection refusal and admin-key replay refusal.
- Product Hub Chromium/WebKit: **8/8**, admin overview/editor at 1440,390,768px and axe.
  Manager-specific permissions are proven by domain and real HTTP tests; browser fixtures use admin.
- Dynamic catalog publication/forward-price-rollback Chromium/WebKit: **4/4 PASS**.
- Secret scan: **0 findings**. Dependency audit: **0 vulnerabilities**.
- C2 owns paid-order-publication protection and checkout stability evidence; no duplicated
  new test or edits in their checkout files.

Local evidence: `work/c1/*.log`, `work/qa/product-hub/`,
`work/qa/storefront-dynamic/` (ignored). No broad checkout/browser repetition required
for this Product Hub-only patch; hotfix evidence remains current and C2 audits gaps.

## Activation plan requiring founder authorization (not executed)

1. Review/merge/deploy this scoped permission PR separately, keeping all flags off.
2. Immediately before authorized database work, repeat live read-only audit and integrity
   check. Obtain a new consistent private backup and verify isolated restoration.
3. Separately authorize `catalog-foundation retire-removed` for these twelve rows only;
   supply the fresh `EXPECT_CATALOG` and the documented Production confirmation. Existing
   tool changes only active/availability plus its audit entry, not prices or historical data.
4. Repeat audit: require 236SKUs,216active/20inactive, zero discrepancies and
   `READY_TO_APPLY`. If any other difference exists, STOP and review commercial evidence.
5. Separately authorize fingerprint-guarded Foundation initialization, with new audited
   `EXPECT_CATALOG` / `EXPECT_REVISION`, Production confirmation and verified backup.
   It adds metadata only; verify catalog/protected fingerprints preserved.
6. Assign Lisa a manager identity privately; enable only `PRODUCT_HUB_ENABLED=true`.
   Lisa UAT: save/reload/discard draft; confirm customer catalog and quotes unchanged.
7. Validate dynamic catalog in TEST with Lisa EN/ES/AR, images, availability and revision
   changes. Obtain explicit Production activation authorization for
   `STOREFRONT_DYNAMIC_CATALOG_ENABLED=true` and
   `STOREFRONT_DYNAMIC_CATALOG_PRODUCTION=founder-approved`.
8. Verify valid public revision and quotes BEFORE separately enabling
   `PRODUCT_HUB_PUBLISH_ENABLED=true`; publish only as administrator after review.

## Rollback and stop conditions

- Before any Hub state exists, Foundation `revert` removes only metadata and retains new
  orders; expected revision and backup required. Once Hub state exists, this removal is
  deliberately refused.
- A commercial rollback is a **new admin publication** restoring reviewed prior values;
  do not restore an old SQLite file over new orders/payments.
- Do not turn dynamic adoption off as a price rollback: bundled and published prices
  may diverge and mismatch safeguards will block affected purchasing. Restore matching
  prices via publication before disabling adoption; keep publication disabled first.
- Stop on integrity/fingerprint mismatch, unexpected SKU/price difference, unverified
  backup, draft/revision conflict, stale visible/authoritative prices, or failed UAT.

**Production activation remains BLOCKED pending explicit approvals and the twelve-row
remediation/Foundation initialization. Current customer ordering remains enabled.**
