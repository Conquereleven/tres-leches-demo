# Production release gate — 3 October 2026

Canonical repository: `/Users/rodrigom./code/tres-leches-demo`.
Branch: `feature/3l-master-delivery-storefront`.

## Amendment: delivery works now

`DELIVERY_ADDRESS_MODE=legacy` is the server startup default and explicit
Production setting. Manual address/building + active customer-selected community
are accepted. Server minimum/pricing, tomorrow/12h/24h and configured windows
remain authoritative; fee is zero and total equals subtotal. Server stores
`delivery.addressVerification=UNVERIFIED`; operations shows ADDRESS NOT VERIFIED
and manual review. This is not a payment/checkout blocker.

`google` keeps the prepared registry/provider boundary, trusted selected address,
coordinates, approved coverage GeoJSON (client KML-derived source) and canonical
community. Trusted community overrides a manipulated client area and recalculates
its minimum. Missing configuration/unknown/outside address fails closed, with no
legacy fallback. Google Places SDK/key activation remains on hold. Both modes
share checkout/order architecture and preserve paid order immutability.

## Verified infrastructure and baseline

Railway project `1f9a94c1-0574-49a9-b579-bf6af3aad601`.
Single frontend + Node backend service `fe8c1417-39ca-4038-b94e-68659ab1c659`.
Production environment `142de30a-4879-4d04-85b9-12e79aa51bda` (not paymennt-test).
URL https://www.3ldubai.ae; `/api/health`.
Baseline deployment `d8e0042d-5c08-4d88-8613-ea67360b7381` (SUCCESS).
Health reports `62f5adfdcda06d9cda9eb0c241ec946414ce0cda`, but this build label
is stale: deployed Shop/web-checkout fingerprints match the stale-checkout fix
`78baadf4c30969a81ae83967fbff8e20fcf48ccc`. Rollback uses the exact deployment ID,
not the stale label. Pipeline is existing CLI artifact upload + npm build/start;
no additional hosting service or Git remote is introduced.

SQLite `/data/3l-production.sqlite`, private persistent volume `/data`.
Schema versions 1/2 unchanged; no SQL schema migration. Baseline: 6 orders,
6 payments, 6 conversations, 218 catalog SKUs, 95 stored zones. Private hashes and
migration markers are recorded in `/data/backups/3l-release-baseline.json`.
Pre-release backup: `/data/backups/pre-release-1791039982546.sqlite` (0600).

## Safe data changes

- Approved minimum-only zone migration: backup first; changes zones and migration
  event only; retained inactive legacy zones, no order/payment/customer rewrite.
  Backward-compatible and reversible by restoring only zone configuration.
- Catalog: 218 → 234 approved options, 16 Pan de Muerto additions, zero deletions
  and zero price changes. Existing administrator importer backs up before changing
  only catalog + audit. Existing frozen orders retain their catalog snapshot.
- New verification flag is additive on newly created website delivery orders;
  historical orders are not retroactively changed.

Deploy only after all checks pass, from a clean committed archive. Set only the
nonsecret release SHA and legacy mode with skip-deploys; preserve payment/Meta
credentials and outbound=false. Do not make a payment/provider charge.

## Meta

Read-only Graph results: access token valid; whatsapp_business_management and
whatsapp_business_messaging scopes; one WABA subscribed app; one configured wa1
number NOT_VERIFIED / DISCONNECTED. **BLOCKED EXTERNAL**: finish phone connection
and verification; WA2/WA3 identifiers absent. No outbound activation/messages.

## Rollback — record before deploying

Restore Railway baseline deployment `d8e0042d-5c08-4d88-8613-ea67360b7381` using
existing deployment rollback/redeploy. Frontend/backend are one artifact. Preserve
volume `/data`; NEVER restore a full database over new paid transactions. Added
catalog SKUs are compatible with the old client. If zone rollback is required,
restore ONLY zones from the backup with a fresh backup/audit, preserving orders,
payments, conversations and post-release history. Restore the baseline release
label as appropriate; keep Meta outbound disabled. Recheck health/static/API and
read-only historical counts/hashes. Roll back immediately for a critical regression.

## Preflight evidence

361 unit/domain/HTTP tests + 52 browser tests (12 original, 19 hosted checkout,
8 menu, 13 coverage/closure) + 4 packaging tests = 417 passing. Typecheck, lint,
build passed; dependency audit zero vulnerabilities; heuristic secret scan zero
findings. Legacy manual-delivery browser path and Google coverage suites both run
against disposable SQLite and mock payment providers. Unit render verifies the
manual-review operations badge. No real card submission.

Meta endpoint verification: challenge 200 with exact challenge; invalid raw-body
signature rejected 401; controlled signed empty event 200, no customer message.
Responsive media reviewed at 390/768/1440; full vertical caption retained, exact
flavour photo changes and SKU thumbnails propagate. Screenshots under
`work/qa/release` and the existing checkout/menu/closure QA directories.

App publication mode could not be read through the current Graph app-fields query (HTTP400/code100); it is not asserted ready. Phone verification/connection remains the concrete activation blocker.
