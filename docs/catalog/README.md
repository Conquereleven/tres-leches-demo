# Approved catalog import

Lisa supplies one UTF-8 JSON file based on `template.json`. An empty template deliberately contains no invented products. Add approved item objects using these fields:

| Field | Required | Contract |
|---|---|---|
| id | yes | Unique SKU, 1–100 ASCII letters/digits/underscore/hyphen; starts alphanumeric; duplicates compared case-insensitively |
| name | yes | Approved name, 1–150 characters |
| category | yes | Approved category, 1–100 characters |
| priceAed | yes | Decimal **string**, two decimals, positive; e.g. format `digits.dd`. Converted exactly to integer fils |
| active | yes | Boolean |
| availability | no | `available` (default) or `unavailable` |
| description | no | At most 2000 characters |
| image | no | Approved HTTPS image reference |
| whatsappPrefill | no | At most 1000 characters |

No extra fields, duplicate SKUs, zero/negative prices, floating point numbers or absent IDs are accepted. Maximum 10,000 items. The importer replaces the complete catalog atomically; omitted products become unavailable for new orders. Issued payments retain their amount and order catalog snapshot. An empty catalog cannot create a chargeable order. There is no catalog seed.

After build, validate without credentials or a running server:

```sh
node dist/node/catalog-import.js dry-run /absolute/private/approved-catalog.json
```

Apply with the staging environment already supplied by the secret manager (or use `node --env-file=/absolute/private/staging.env` before the script path):

```sh
node dist/node/catalog-import.js apply /absolute/private/approved-catalog.json
```

Apply requires `APP_ENV=staging`, an existing absolute `DB_PATH` and absolute `BACKUP_DIR`. It creates and integrity-checks a unique private SQLite backup **before** changing the catalog. Validation failures do not change products. Standard output contains only item count and backup path, never source contents. Current order/receipt data remain untouched. Run from the release checkout so the SQLite schema file is available (standalone build places it alongside the tool).

Rollback a catalog without rolling back newer orders or payment receipts:

```sh
node dist/node/catalog-import.js rollback /absolute/private/backups/catalog-BACKUP-ID.sqlite
```

Rollback extracts only the catalog from that backup, revalidates it and creates a new pre-change backup. Never replace the live database with an old catalog backup while orders have advanced.
