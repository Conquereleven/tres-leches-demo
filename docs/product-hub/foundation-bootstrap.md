# Catalog foundation — Production initialization

Status: **tool and procedure ready; Production is BLOCKED by 24 discrepancies** (below).
Nothing here has been run against Production. The audit results come from a local copy
of the backup taken on 12 October 2026 at 08:16 (file time on the workstation that holds it); it does not describe anything
that happened in Production afterwards, so the audit must be repeated on the live
database before any change.

## What the foundation is

`State.catalogFoundation` is descriptive metadata around the commercial catalog:
categories, families, products, variants, images, translations and a revision
fingerprint. It holds **no prices and no availability**; those stay in `State.catalog`.
Product Hub and the public catalog API need it. Production has never had one.

## The tool

`scripts/catalog-foundation.ts`, compiled to `dist/node/catalog-foundation.js`.

| Mode             | Writes                     | Purpose                                                                   |
| ---------------- | -------------------------- | ------------------------------------------------------------------------- |
| `audit`          | nothing (read-only handle) | Any database profile, `release-production` included. Exit 2 when blocked. |
| `apply`          | `catalogFoundation` only   | Verified backup, then one transaction.                                    |
| `revert`         | removes that key only      | Non-destructive recovery while nothing depends on the foundation.         |
| `retire-removed` | 12 catalog rows            | Separate approval. Stores the removed 9 October combinations as inactive. |

Output is catalog facts (SKU ids, names, prices, flags), counts and fingerprints. No
customer, order, payment, credential or environment value is read into a report or an
error message.

### What the audit checks

- database profile and `PRAGMA integrity_check`;
- whether a foundation exists; if so, that its fingerprint matches its content and the
  stored catalog (`absent`, `current`, `differs-from-plan`, `inconsistent`);
- every SKU against the approved source (`data-imports/liza-current-menu.json`):
  presence, name, price in fils, active, availability, category, description;
- that the storefront sources map every active SKU to a product;
- `catalogFingerprint` (the commercial catalog) and `protectedFingerprint` (everything
  except the foundation: orders, payments, customers, zones, webhooks, audit, catalog);
- `sources.fingerprint`, so an audit run in the container can be shown to use the same
  approved sources as the one reviewed here.

**The database is never corrected from the repository.** A difference blocks the
migration. It is resolved either by correcting the repository sources in a reviewed
change (when Production is right) or by a separately approved commercial change (when
the approved decision was never stored), and then auditing again.

### What `apply` guarantees

1. Refuses unless `APP_ENV` matches the database profile; Production also needs
   `CONFIRM=initialize-production-catalog-foundation`.
2. Needs `EXPECT_CATALOG` and `EXPECT_REVISION`: the fingerprints from the audit that
   was reviewed. They are checked before the backup and again **inside** the write
   transaction (`BEGIN IMMEDIATE`), so a catalog change in between refuses the write.
   New orders arriving meanwhile are not catalog changes and do not block.
3. Takes a backup from a read-only handle into `BACKUP_DIR` (must be outside the
   database directory), then checks its integrity and that it holds the audited catalog.
4. Adds `catalogFoundation`, validates it, and refuses if anything else in the state
   would differ. No audit entry, event or other record is written.
5. A second run reports `applied: false` and takes no backup.

## Audit of the Production backup (12 October 2026, 08:16)

| Check                                   | Result                      |
| --------------------------------------- | --------------------------- |
| Profile / integrity                     | `release-production` / `ok` |
| SKUs in database / approved source      | 236 / 236                   |
| Prices, names, categories, descriptions | all 236 identical           |
| Foundation                              | absent                      |
| Active / availability differences       | **12 SKUs, 24 fields**      |
| Decision                                | **BLOCKED**                 |

The 12 SKUs are exactly the six Pan de Muerto chocolate-covering combinations removed on
9 October (mini and individual of each). `RETIRED_SKUS` blocks them in code, so they are
neither listed nor purchasable, but their stored rows still say `active: true`,
`availability: available`; the approved source says inactive and unavailable. The
removal release changed code and the import file, not the stored rows.

Resolution with commercial evidence: Joel's decision of 9 October is recorded in
`AGENTS.md`. `retire-removed` stores exactly that decision — those 12 rows, flags only,
prices and names untouched, one audit entry, verified backup — and is refused once a
foundation exists. It needs its own approval and its own confirmation phrase.

Rehearsal of the full procedure on a disposable copy of that backup, with the compiled
tool: audit BLOCKED → `retire-removed` (12 rows) → audit READY → `apply` → audit
ALREADY_INITIALIZED with the protected fingerprint identical before and after →
second `apply` writes nothing → `revert` → state identical to before `apply`. The copy
was deleted afterwards.

## Procedure for an authorized operator

Requires founder approval for each write step. Run inside the Production service
container, from the application directory, after the release containing this tool is
deployed. `<db>` is the configured `DB_PATH`; `<backups>` a directory on the volume that
is not the database directory.

1. **Audit (no approval needed, writes nothing).**

   ```bash
   DB_PATH=<db> node dist/node/catalog-foundation.js audit
   ```

   Confirm `sources.fingerprint` equals the value from the reviewed audit, and read
   `decision`, `discrepancies`, `database.catalogFingerprint`.

2. **If blocked only by the 12 removed combinations** (approval: commercial change).

   ```bash
   APP_ENV=production CONFIRM=deactivate-removed-pan-de-muerto-combinations BACKUP_DIR=<backups> EXPECT_CATALOG=<catalogFingerprint from step 1> DB_PATH=<db> node dist/node/catalog-foundation.js retire-removed
   ```

   Any other discrepancy stops here: report it, do not proceed.

3. **Audit again.** Expect `READY_TO_APPLY`. Note `database.catalogFingerprint` and
   `foundation.plannedRevision`.

4. **Apply** (approval: initialization).

   ```bash
   APP_ENV=production CONFIRM=initialize-production-catalog-foundation BACKUP_DIR=<backups> EXPECT_CATALOG=<catalogFingerprint from step 3> EXPECT_REVISION=<plannedRevision from step 3> DB_PATH=<db> node dist/node/catalog-foundation.js apply
   ```

   Expect `applied: true`, `catalogIdentical: true`, `foundation: current`,
   `integrity: ok`.

5. **Audit a last time.** Expect `ALREADY_INITIALIZED` and the same
   `protectedFingerprint` as step 3 if no order arrived in between (a new order changes
   it legitimately; `catalogFingerprint` must be identical regardless).

Nothing visible changes for customers or staff: the feature flags that read the
foundation stay off.

## Rollback

- **Before anything is built on the foundation** (Product Hub never used):

  ```bash
  APP_ENV=production CONFIRM=initialize-production-catalog-foundation BACKUP_DIR=<backups> EXPECT_REVISION=<applied revision> DB_PATH=<db> node dist/node/catalog-foundation.js revert
  ```

  Removes only the foundation. Orders taken since are kept. Refused if Product Hub has
  any state or the stored revision is not the expected one.

- **Restoring a backup file** is the last resort: it discards every order and payment
  recorded after the backup. Do not use it to undo this migration.
- `retire-removed` has no automatic undo by design. Its backup shows the previous flags;
  reverting them would re-store products the founder removed.

## After initialization

Tools that change `State.catalog` directly (`catalog-import`, `update-pan-prices`,
`activate-conchas`) now re-fingerprint the foundation in the same transaction, so it
never points at a stale catalog. They refuse when the change cannot be represented
(a SKU added or removed) or when a Product Hub draft is open. Before this change, any
of them would have left an initialized foundation inconsistent and the catalog API
failing closed.

## Tests

`tests/commerce/foundation-bootstrap.test.ts`: reconciliation; read-only audit of a
`release-production` database with no private data in output; discrepancies block;
full gated migration on a disposable previous-schema database with verified backup,
fingerprints before/after, idempotence and recovery; concurrent change refused inside
the transaction; the removed-combinations step; existing tools keep the foundation
consistent.
