# Liza's approved current menu

Approved 1 October 2026. `src/brand/menu-data.json` contains 29 storefront families and 218 purchasable SKUs. `data-imports/liza-current-menu.json` is the matching version-1 server catalog import, validated by the existing importer. Each option carries a unique SKU; the server continues to price and validate every cart line. No payment, delivery or operational state rules were changed.

Sources: the two 23 September image menus override PDF Pan de Muerto and Conchas. The PDF supplies remaining categories. Product names, labels and amounts follow the reviewed normalization. Filled items have no invented weight. Ambiguous packs and jar bundles have no assortment selector. Filled Conchas select size and filling only. Explicit advance-order notices apply to Mango Cake, gelatinas and Rosca; scheduling validation is unchanged.

Photography is extracted from supplied source assets into `public/brand/menu/`, without editing originals or upscaling. Generic bakery/speciality photos are category imagery only. Missing product photos use a brand mark. The previously approved large Pan de Muerto family image remains in the hero; small flyer crops are limited to cards.

## Catalog activation after release approval

No remote catalog was updated during this sprint. Before allowing the new menu to accept orders, apply the approved import to the intended database using the existing catalog command, with its mandatory backup. First run `npm run catalog -- dry-run data-imports/liza-current-menu.json`. The importer replaces the catalog only; existing orders, receipts and transitions remain. It removes the retired `pan-de-muerto` SKU. Keep the returned backup for `catalog rollback` if needed.

The guarded Railway TEST startup now uses this same full-menu import and a verified backup when catalog activation is required. Provider/environment gates and payment calls are unchanged. Production startup remains unchanged. No deployment or hosted database mutation was performed.

The public menu displays approved prices but disables Add to Cart if a SKU is missing, ordering is unavailable, or its server price differs. It never substitutes the old AED25 SKU or falls back to WhatsApp ordering. A stale cart with a retired SKU is handled by the existing unknown-product checks.

Historical financial regression tests retain the AED25 fixture under `tests/fixtures/retired-pan-de-muerto.json`; it is not a current catalog import. New menu/browser tests use the full-menu fixture and local provider only. No real Paymennt calls are used.

## 9 October 2026 — six unauthorized Pan de Muerto combinations removed

Removed products: `pan-de-muerto-traditional--ajonjoli-chocolate-covering` and
`pan-de-muerto-filled--{crema-diplomatica-vainilla,chocolate,mascarpone-y-cajeta,mascarpone-y-fresas,pistachio}-chocolate-covering`
(12 SKUs). The storefront now has 71 products and 210 purchasable SKUs.

Production's stored catalog still holds the 12 SKUs as active. Deploying this code is enough to stop them
being listed or paid for (`RETIRED_SKUS`). Optionally, after approval, tidy the stored rows:
take the usual verified backup, then run the existing admin catalog import with
`data-imports/liza-current-menu.json`, which marks only those 12 rows inactive. No order or payment record changes.
