# Pan de Muerto approved correction — 13 October 2026

Exactly ten existing price fields; all other catalog fields and financial history remain unchanged.

| SKU | Previous AED | Approved AED |
|---|---:|---:|
| pan-de-muerto-traditional-azucar-mini-40-g-chocolate-covering | 13 | 18 |
| pan-de-muerto-traditional-azucar-individual-70-g-chocolate-covering | 15 | 21 |
| pan-de-muerto-traditional-pack-6-mini | 72 | 60 |
| pan-de-muerto-traditional-pack-12-mini | 140 | 115 |
| pan-de-muerto-traditional-pack-6-individuales | 80 | 72 |
| pan-de-muerto-traditional-pack-12-individuales | 155 | 140 |
| pan-de-muerto-filled-pack-6-mini | 120 | 100 |
| pan-de-muerto-filled-pack-12-mini | 235 | 190 |
| pan-de-muerto-filled-pack-6-individuales | 130 | 120 |
| pan-de-muerto-filled-pack-12-individuales | 255 | 235 |

Release uses PAN_PRICE_CORRECTION_20261013=true once. Before HTTP starts, the compiled updater validates each SKU and allowed price, creates a private consistent SQLite backup, verifies its state, and writes only the ten price fields in one transaction. An initialized Product Hub foundation is rebased; pending drafts or unexpected prices block the release. Existing audit history is preserved and one audit entry is appended. After verification set the flag false without redeployment.

The old October updater now uses the approved targets and cannot restore obsolete prices. Packs have fixed prices. Rollback never restores the database over new transactions: retain corrected catalog and forward-fix code if necessary.

Historical order TL-DF13D782 retains its accepted prices and payment. Two chocolate-covered Individual units at AED 15 instead of AED 21 leave an AED 12 discrepancy for a separate business decision; no charge or refund is performed.

Validation: typecheck, lint, build; 572 commercial/unit/integration tests; 19 checkout tests per Chromium/WebKit; ten selector/cart/delivery/pickup tests per Chromium/WebKit; zero secret scan findings and npm audit vulnerabilities. No paid transaction is created.
