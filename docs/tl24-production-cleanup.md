# TL-24 — Runtime cleanup and canonical operations

## Scope and baseline

Work starts at `feature/3l-brand-experience`, exact commit `0340690ed84f57d1b97862fb2348f9362c9bb244`, with a clean checkout. Release branch: `release/3l-production-cleanup`. No Lovable, push, merge, deployment or production activation.

The old `src/App.jsx` wrapped the real CommerceWorkspace with a second admin header. It exposed a legacy inbox, fictitious orders, metrics and the original storefront/checkout. Brand footer linked this wrapper through both Gestión and MVP demo. These were state-based surfaces, not independent server routes.

## Removed from runtime

- Entire legacy App, its secondary header, checkout, order drawer, metrics, conversations and saved sample replies.
- MVP demo CTA, mock payment/GPS UI, simulated pickup text and hardcoded diagnostic GPS point.
- Synthetic catalog, customer seed, WhatsApp numbers, mock providers and default mock geo resolution. All reusable fixtures now live under `tests/fixtures/`.
- Staging UAT seed and scenario records. `STAGING_SEED=empty` is the only accepted value.
- Public `qa-comparison.html` and old visual prototype assets. They remain test reference files, outside public/build assets.
- Unused legacy styles and external Google font import. Operations use local 3L fonts. Empty mobile lists no longer clip their explanatory text.

## Canonical navigation and routes

- Brand site: `/`.
- Unified WA1/WA2/WA3 inbox: `/operations/inbox`.
- Orders: `/operations/orders`.
- Production: `/operations/production`.
- Deliveries: `/operations/delivery`.
- Delivery zones: `/operations/zones`.
- Staging diagnostics only: `/operations/readiness`.
- `/operations`, `/inbox`, `/admin`, `/legacy-inbox`, `/demo`, `/mvp` redirect to the canonical inbox.
- Unknown paths return 404 in the Node runtime; demo APIs return 404. Removed public QA page returns 404.
- Customer and payment records remain within their existing conversation/order context; no unfinished standalone modules were added.

## Environment and database policy

`ALLOW_DEMO_DATA=true`, `DEMO_MODE=true`, or `STAGING_SEED=uat` fails startup. No VITE/client flag is introduced. Production no longer becomes test implicitly through DEMO_MODE. Test dependencies are injected by `tests/fixtures/server.ts`; the release server entry is `server/main.ts` and its bundle does not import test fixtures.

Fresh runtime contains only the 91 existing source zone rules and empty conversations, orders, payments, jobs, catalog and scenarios. Unconfigured source numbers say NOT CONFIGURED. Real users remain externally configured with hashed passwords. Unavailable providers fail closed.

New profiles `release` and `release-staging` refuse every older demo, development, integration, staging, test or unprofiled database. This prevents unknown historical synthetic rates/geography from being promoted even when their rows lack reliable provenance. A second guard rejects known seed/message/payment markers. Never rename a database profile to bypass these safeguards.

Preserve the original bases offline. Initialize a new database on a new explicit absolute path. Any separately approved operational configuration or real records must be reviewed before migration; no automatic promotion is provided.

JLT B/C/D retains confirmed free delivery with minimum null. The requested 30 AED minimum is **not confirmed in this HEAD**. REMRAN remains the source spelling with an unresolved review note, not a fabricated Remraam correction. JVC retains its real source minimum of 100 AED and unknown fee; no synthetic 10 AED fee or geography is loaded. Unknown rules keep payment blocked.

## Existing local databases and cleanup

Read-only inspection found three seeded conversations in each of `data/commerce.sqlite` (unprofiled legacy) and `data/development/commerce.sqlite` (development profile). No orders/payments were identified in either inventory. These databases were not cleaned, migrated or promoted.

Read-only inventory:

```sh
node scripts/review-runtime-db.mjs /absolute/path/database.sqlite
node --import tsx scripts/cleanup-demo-db.ts /absolute/path/database.sqlite
```

The cleanup dry run prints a state SHA-256 and identified IDs, without customer message content. Applying is an explicit offline maintenance operation, requiring the reviewed fingerprint and a new backup path:

```sh
node --import tsx scripts/cleanup-demo-db.ts /absolute/path/database.sqlite --apply --expected-sha REVIEWED_SHA --backup /absolute/path/new-backup.sqlite
```

Stop writers first. The script verifies a SQLite backup, rechecks state under a transaction and removes only proven seed conversations, linked test orders/payments and associated jobs/command results. It refuses mixed external-provider evidence or retained order references. Zone configuration, immutable audit history, event deduplication receipts, profile and unidentified records stay intact. It does not promote the cleaned legacy database into a release profile. Review custom zone pricing/geography separately. No apply was run on existing databases; apply behavior is tested only on disposable fixtures.

## Validation and release limit

Validation includes strict typecheck, lint, unit/domain/adapter/HTTP/persistence/content tests, compiled-client E2E with fixture injection, actual compiled Node staging startup with empty data, responsive 390/768/1024/1440, Axe smoke and browser console checks. Brand tests retain their eight-width matrix and no-JavaScript shell checks. The static Sites worker remains packaging-compatible and is not the operational backend.

This cleanup does not authorize or implement production/provider activation. APP_ENV=production is still blocked; WhatsApp outbound remains disabled, Paymennt remains test-only, the notification contract remains blocked, and the approved catalog is missing. No live end-to-end acceptance was claimed. The final operational release decision remains **NOT READY**, even when the cleanup validation passes.
