# TL-18 · Staging preparation and activation contract

Baseline verified 2026-09-08 (Dubai): `b9b067596971afdd2bb6d4578c1702a729fa81b1`, clean `feature/tl-production-integration`. Dedicated branch: `feature/tl18-staging-preparation`. Initial lint/typecheck/build/hosting succeeded. Local test socket and npm network access were sandbox-restricted; approved reruns passed 52/52 tests, 3/3 E2E and audit 0. No code baseline discrepancy.

## Environment matrix

| APP_ENV | Runtime/providers | Auth | Database | Activation |
|---|---|---|---|---|
| development | Mock providers by default | Local demo identity, clearly labelled | `data/development/commerce.sqlite`, development profile | Local only |
| test | Mock providers by default; existing isolated HTTP adapter fixtures retained | Fixture sessions when testing auth | Separate `data/test/commerce.sqlite` or disposable absolute test path; test profile | Automated tests |
| staging | `NODE_ENV=production`; explicit PROVIDER_MODE offline/test | Real scrypt users, all 3 roles, Secure sessions | NEW absolute path, staging profile, WAL, startup backup | Prepared locally; no deployment performed |
| production | Startup refuses | No activation path | No promotion from staging | Disabled; no environment flag bypass |

`APP_ENV` describes operational environment. `NODE_ENV=production` only selects framework optimization/security behavior; it is not release authorization. For historical auth regression fixtures only, absent APP_ENV + NODE_ENV=production + DEMO_MODE=true is labelled test. New launch configurations must set APP_ENV explicitly. Legacy INTEGRATION_MODE remains for TL-13–TL-17 isolated tests/development but is rejected in staging, which uses PROVIDER_MODE. All configured external WhatsApp sends are disabled at runtime in TL-18, including legacy integration mode. Direct provider adapter tests inject HTTP fixtures and do not make external sends.

## Staging configuration

Use `.env.example` as the contract. It is documentation, not a credential store. Node consumes process environment; inject secrets via a deployment secret manager or a private `--env-file`. Never use VITE_* for backend settings. Empty development DB_PATH selects the environment-specific default. Staging requires all safety settings explicitly; missing values fail startup before accepting requests.

| Group | Variables / requirements |
|---|---|
| Environment | APP_ENV=staging; NODE_ENV=production; DEMO_MODE=false; INTEGRATION_MODE=false; PROVIDER_MODE=offline or test; STAGING_SEED=empty or uat |
| Database | DB_PATH absolute/new/outside static dist; PERSISTENT_VOLUME_CONFIRMED=true acknowledges host volume requirement |
| Origin | APP_ORIGIN exact HTTPS origin, no path/query/userinfo; HOST=127.0.0.1 behind TLS proxy; API_PORT |
| Auth | OPERATOR_USERS_JSON with unique IDs, role, random salt and scrypt hash; at least one admin, manager, operator |
| Session | SESSION_SECURE=true; SESSION_TTL_SECONDS 300–28800; opaque random in-memory sessions; HttpOnly/Secure/SameSite=Strict; restart/logout invalidates sessions |
| Logging | SAFE_LOGS=true; WEBHOOK_SECRET >=24 characters (sandbox verifier secret only, not Paymennt signature protocol) |
| Backups | BACKUP_DIR separate absolute/private directory; BACKUP_INTERVAL_MINUTES 15–1440; BACKUP_RETENTION_COUNT 2–168 |
| Meta | META_OUTBOUND_ENABLED=false always; in provider test mode: META_ACCESS_TOKEN, META_APP_SECRET, META_VERIFY_TOKEN, META_GRAPH_VERSION, META_NUMBERS_JSON with wa1/wa2/wa3 phone/phoneNumberId/wabaId; optional approved META_PAYMENT_TEMPLATE_JSON |
| Paymennt | PAYMENNT_ENVIRONMENT=test always; test mode requires PAYMENNT_API_KEY/PAYMENNT_API_SECRET. No arbitrary base URL, no live-mode flag accepted |
| Mapbox | Test mode requires MAPBOX_ACCESS_TOKEN and MAPBOX_PERMANENT_ENABLED=true, only after entitlement confirmed |

Offline is an explicit configuration-preparation mode: providers are not instantiated and diagnostics report NOT CONFIGURED / BLOCKED — EXTERNAL CREDENTIALS. It does not replace missing providers with mock successes. Test mode is all-or-nothing for provider settings; missing/invalid settings fail startup. Presence of a token is not proof that it belongs to a test account: verify Meta account/test recipients and use separate Mapbox staging credentials during onboarding. No credentials were supplied, read from private env files, or used for live provider validation in this sprint.

The runtime wires DisabledWhatsAppProvider for staging/integration. Outgoing jobs fail explicitly before any network call; no `sent` result or fake provider ID is generated. UnconfiguredPaymentProvider rejects work in offline mode. Paymennt adapter retains TEST checkout/link, authoritative GET and requestId recovery; even direct construction with live mode is now rejected. This intentional outbound block means real UAT scenarios that require delivery cannot pass in TL-18.

## Paymennt notification slot

`server/adapters/paymennt-notification.ts` isolates PaymenntNotificationVerifier. It always returns false. `/api/webhooks/payment` remains 503 in staging and integration. The mock-only demo route is unavailable in staging. No signature/header/encoding/payload values were guessed.

TODO before implementation: obtain official notification schema, signature header, algorithm/encoding, canonical signed bytes/string, hmacKey usage, stable event ID, retry/acknowledgment behavior and signed test vectors. Then implement normalization, authenticated durable reconciliation scheduling and replay/failure tests in a reviewed change. Existing server-side amount/AED/requestId/orderId/checkoutId checks and non-regressive payment state mapping remain intact.

Official source contract used for the existing read-only checkout search: [Paymennt API](https://docs.paymennt.com/api), cached official OpenAPI inspected during TL-13–TL-17; diagnostics use `GET /checkout?requestId=TL18-DIAGNOSTIC-NO-CHECKOUT`, never POST. [Payment-link flow](https://docs.paymennt.com/docs/payment/links) remains the authority for fetching checkout after an update. No attempt to fill the missing webhook protocol was made.

## Provider diagnostics and readiness

`GET /api/ready` is a safe local readiness snapshot: database, authentication, WA1/WA2/WA3, Paymennt, PaymenntNotification, GeoProvider, backup, HTTPS and UAT. Only READY / NOT CONFIGURED / BLOCKED / FAILED are emitted. It contains no credential values, account IDs, customer fields, order amounts or paths. Overall stays NOT READY while notification contract/UAT are blocked; never PILOT READY. HTTP 200 means local DB health, not release approval. Local checks cannot prove cloud volume durability, proxy TLS validity or off-host recoverability.

`GET /api/admin/diagnostics` exposes the same snapshot only to Admin. `POST /api/admin/diagnostics` requires Admin, a valid session/Origin and `{provider: "paymennt" | "geo"}`; unknown fields/providers are rejected. Ten-second cooldown/single active probe and normal API rate limits apply. Paymennt probe performs only authenticated TEST GET search and discards data. Geo probe performs reverse lookup of the fixed public test coordinate 25.0657,55.2089 using Mapbox v6/permanent=true; no customer location is sent. Returned data are discarded and no commercial rule is inferred. Both have bounded timeouts. Remote errors are sanitized; successful connectivity expires from readiness after five minutes. A valid empty Geo response proves protocol connectivity only, not coverage.

Mapbox source: [Geocoding v6](https://docs.mapbox.com/api/search/geocoding/). Permanent entitlement must be confirmed; the probe may consume a billed API request. No real probe was run because credentials are absent. Mock HTTP tests cover success/failure and ensure diagnostics cannot create payments/messages.

Meta onboarding still requires ownership and architecture of all three numbers, WABA IDs, business/app permissions/subscriptions, supported Graph version, system-user/test token, test recipients, coexistence/migration decision and approved template structure. Diagnostic Meta status is locally determined configuration only. Incoming challenge/signature handling is preserved for configured test mode. No Meta send check exists.

## Staging database, seed and backups

Single Node process on one persistent local volume; no NFS/shared SQLite or multiple replicas. Schema version 2 records runtime_profile. Opening a DB under another environment fails; neither old demo nor integration DBs can become staging. Existing legacy files are not migrated or silently imported. Set a new path for each environment; keep the previous DB untouched for historical sandbox review.

STAGING_SEED=uat applies only on first initialization: three fixed WA aliases; 91 unchanged source zones; three TEST conversations with deliberately non-deliverable recipient IDs; three empty TEST Building orders; ten blocked UAT scenario records. No payment, outbox job or provider-success fixture is seeded. Users come from hashed configuration, never seeded plaintext passwords. STAGING_SEED=empty creates no conversations/orders but includes zones and the ten UAT records. Restart preserves data rather than reseeding. Prices missing from the source remain null and continue blocking payment; JLT B/C/D minimum and REMRAN review remain unresolved.

Startup creates an online SQLite backup and verifies integrity before listening. A timer repeats it at the configured interval. Only dedicated `tl-staging-<timestamp>-<uuid>.sqlite` files are eligible for retention. Staging runs with umask 077; snapshots are 0600. BACKUP_DIR cannot contain the live DB or be static dist. Backup failure aborts initial startup or marks readiness FAILED later. Readiness reports observed success time, not just the presence of configuration. Backup status becomes stale after twice the interval. Tests cover restoration, retention, unrelated-file preservation and failure status. Backups remain local until hosting supplies restricted encrypted off-volume replication; that remains BLOCKED.

Manual command remains `node scripts/backup.mjs ABSOLUTE_DB NEW_BACKUP_PATH`; online backup API includes committed WAL data and verifies integrity. Never copy an open DB file alone.

Restore procedure: stop the app and all writers; preserve failed DB/WAL/SHM for investigation; verify a chosen snapshot with SQLite integrity_check; copy the snapshot into a NEW empty private directory (no old WAL/SHM); set DB_PATH to restored path; retain APP_ENV=staging and PROVIDER_MODE=offline; start one Node process, verify local readiness, record counts, UAT labels, order versions and command receipts. Review unknown/processing jobs before any later provider activation. A restored profile remains staging. Rehearse restoration from an off-volume copy before any release; local automated restore does not prove disaster recovery.

## Operator onboarding

1. Assign unique non-customer user IDs for Admin, Manager and Operator. Each person gets a unique password of at least 12 characters; avoid production credentials.
2. On a trusted host, generate a salted hash with `node scripts/operator-password.mjs USER_ID ROLE`, reading password from protected stdin (not arguments/history/logs). Combine returned entries into OPERATOR_USERS_JSON in the secret manager. Script defaults retained only for old sandbox compatibility; staging procedure requires explicit ID/role. Test fixture passwords are not staging account defaults.
3. Verify staging HTTPS origin, cookie attributes and 30-minute example TTL. Deliver access details through your normal secure channel; no message was sent in this task.
4. Admin checks readiness/configuration. Manager can reassign and inspect payments; Operator acts only on assigned conversations/orders. Admin-only diagnostics and zone settings are server-protected.
5. Rotate/remove a user by updating secret configuration and restarting; sessions are intentionally not shared across nodes and are invalidated on restart. No persistent signing secret is required for opaque server-side sessions.

## UAT and final gate

The visible badge is STAGING / TEST; new Preparación y UAT view shows status evidence and ten records. None auto-promotes itself to accepted. Prior UAT checklist `tl13-17-uat.md` remains authoritative for the ten scenarios. Local fixtures and HTTPS rehearsal verify product behavior only; client UAT, provider onboarding and real deployment checks remain BLOCKED — EXTERNAL CREDENTIALS / acceptance pending.

Final decision: **NOT READY** for integration release. TL-18 staging preparation is implemented; unchanged notification-contract and external onboarding blockers prevent INTEGRATION READY. Production remains disabled. No real WhatsApp messages, live Paymennt, production deployment, push, merge or Lovable.
