# Backup readiness — OWNER ACTION REQUIRED

**Production backup NOT VERIFIED.** No live database, backup, private preflight export or recovery secret was read or copied. Verification requires private Production data, which this sprint explicitly excludes. The live metadata confirms `/data`, and the names DB_PATH, BACKUP_DIR, BACKUP_INTERVAL_MINUTES and BACKUP_RETENTION_COUNT; their actual path/value settings were NOT retrieved. Actual DB/backup paths, latest completed LIVE backup timestamp, integrity, retention, off-volume copy and restore relationships remain unknown. Configuration alone is not a backup success.

Code review: secure hosted startup awaits an online SQLite backup; a timer repeats it at the configured interval. BackupManager verifies integrity, applies 0600, keeps a separate directory and bounds deletion to its own naming contract. `lastSuccessfulAt` is in-memory for the current process and is not independent durable history. Backup filenames use the legacy `tl-staging-*` prefix even for Production. A backup directory on the same volume does not protect against volume loss.

Fresh synthetic recovery: 7 orders, 7 payments, 7 conversations, 1 receipt, 1 historical fixture catalog item. Full document equality, order→conversation and payment→order/amount relationships, integrity `ok`, mode 0600 passed. Backup copied to a separate disposable path, opened read-only and removed afterward. The measured local restore took 2 ms on the first run; this is **not a Production RTO**. [Aggregate evidence](evidence/backup-rehearsal-initial.json).

Owner/private operator procedure, requiring separate authorization:

1. Identify actual DB_PATH/BACKUP_DIR and interval/retention privately; prove they refer to Production `/data`, not static dist or staging.
2. Inspect completed backup files and private backup-success evidence; record timestamp, file size, integrity, permission and checksum without publishing contents or credentials.
3. Under future release authorization, produce a fresh consistent online SQLite backup. Do not copy a live SQLite file naively while WAL/writes are active.
4. Preserve the external webhook-secret file separately in encrypted private custody; SQLite alone cannot recover registered HMAC/config secrets. Never rotate registrations for a restore rehearsal.
5. Transfer only via approved encrypted private channel to an isolated environment with all provider/worker egress disabled. Do not start the live app against a copied database: it could process queued jobs.
6. Open restore read-only first. Compare counts by order/payment/receipt states, original timestamps, accepted totals, fingerprints, references, snapshot hashes and relevant foreign relationships to the consistent backup baseline. SQLite integrity alone is insufficient.
7. Measure elapsed recovery and validated loss window; record owner sign-off privately. Keep only aggregate evidence in the release report.
8. Restore to Production only through a separately approved, reconciled incident procedure; never overwrite new legitimate transactions with an old complete DB.

RPO: **unverified**; nominal interval is not a guarantee. Once the actual interval and last successful independent durable copy are verified, quantify loss since that copy. RTO: **unverified**, including private transfer, restoration, secret custody, integrity/financial reconciliation, code startup and operator handoff. Agree service targets with the owner before GO. Retention must include pre-release, daily/weekly approved snapshots and a private off-volume copy with least privilege; validate expiry and restoration periodically. No retention/config/storage change was made here.
