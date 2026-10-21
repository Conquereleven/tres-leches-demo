# 3L-MEDIA-002 · Professional photography (19 October 2026 delivery)

Tracking: issue #53. Base: `main` `29d02ba` (Closure Sprint 01 release).
No Production write, Product Hub publication, configuration change or deployment was made.

## Source

`wetransfer_nuevas-3l_2026-10-19_1715.zip`, SHA-256 `0bd28756dadf43758b2a1473f2355508350a3668d9ef9bde2149e12add597e53`, 94 JPEGs (260 MB, stored uncompressed). The entry list was checked for absolute paths, `..` segments and symlinks before extraction (none). The originals stay private, outside the repository. All 94 carry a camera GPS block (DJI PP-041); no public file in this PR has EXIF, XMP or GPS data (asserted in `tests/commerce/media-002.test.ts`).

- Inventory: [`../3L_MEDIA_20261019_INVENTORY.csv`](../3L_MEDIA_20261019_INVENTORY.csv): id, file, format, size, orientation, hash and near-duplicates. GPS presence only, never coordinates.
- Labeled contact sheets: [`contact-sheets/`](contact-sheets/) (one per folder, plus the reviewed crops).
- Mapping for every photo: [`../3L_MEDIA_20261019_MAPPING.csv`](../3L_MEDIA_20261019_MAPPING.csv).

## Mapping summary

Matched against the published catalog (revision `catalog-v1-63d2f003…`) by what each photo shows, never by filename alone.

| Status | Photos | What happens |
|---|---:|---|
| Product media, staged for Product Hub | 34 | 12 live products; new photo becomes primary, current images kept after the new ones |
| Category gallery frames, implemented here | 8 | Pan +3, Conchas +3, Bakery +2 (new). New photographs open; approved frames follow |
| **Needs approval** | 5 | `CONCHAS COLORES 01`, `CONCHAS ROJAS*`: Tricolor is a colour-choice product with an approved neutral placeholder; these photos show only red (or a partial mix) |
| Unmatched | 5 | `MANTECADAS*`: no Mantecadas product is published |
| Not selected | 42 | Alternate takes, near-duplicates, top-down boards whose square crop would cut pieces, and groups that don't match the 6/12 Conchas chocolate pack |

| Product | New primary (photo) | New gallery | Previous primary |
|---|---|---|---|
| `bisquets` | M002-006 | M002-003, 004 | none |
| `orejas` | M002-037 | M002-039, 042 | none |
| `conchas-traditional--chocolate` | M002-008 | M002-013, 010 | concha-tradicional-chocolate (illustration) |
| `conchas-traditional--vainilla` | M002-023 | M002-019, 021 | concha-tradicional-vainilla (illustration) |
| `pan-de-muerto-traditional--azucar` | M002-064 | M002-052, 058 | official-pan-08 |
| `pan-de-muerto-traditional--ajonjoli` | M002-048 | M002-046, 043 | official-pan-09 |
| `pan-de-muerto-traditional--azucar-chocolate-covering` | M002-066 | M002-067, 068 | official-pan-12 |
| `pan-de-muerto-filled--chocolate` | M002-088 | M002-086, 087 | official-pan-16 |
| `pan-de-muerto-filled--mascarpone-y-fresas` | M002-091 | M002-090 | official-pan-17 |
| `pan-de-muerto-filled--pistachio` | M002-084 | M002-085, 083 | official-pan-07 |
| `pan-de-muerto-traditional-pack` | M002-074 | M002-077, 073 | official-pan-02 |
| `pan-de-muerto-filled-pack` | M002-094 | M002-093 | official-pan-02 |

Notes for review: the new chocolate-covered photos have no orange-peel garnish (the previous ones do); filled Fresa shows white cream with strawberry, the only strawberry filling published (`mascarpone-y-fresas`); pack photos are product-level only and make no size or count claim. Not touched: Tricolor products, `conchas-traditional-pack`, `conchas-filled--pistache`, `conchas-filled-pack`, cakes, jars and every retired SKU.

## Gallery order (proposed, for founder visual approval)

New photographs open each gallery and the previously approved frames follow. No photograph assignment changed.

| Gallery | Order |
|---|---|
| Pan | **M002-080**, M002-059, M002-049, then official banners 01–04 |
| Conchas | **M002-026**, M002-027, M002-024, then the retained chocolate-dozen and pistachio-cellophane frames |
| Bakery | **M002-002**, M002-041 (new gallery) |

Opening frames as rendered in the browser: [`previews/opening-*.png`](previews/). Previous vs proposed sequence: [Pan](previews/gallery-order-pan.jpg) · [Conchas](previews/gallery-order-conchas.jpg).

## What this PR changes

- `src/brand/category-media.json` + `public/brand/approved/3l-media-002/`: 8 gallery frames, 3:2, AVIF + WebP at 640/960/1440 px, `family: null` so they can never resolve as product media.
- `src/brand/media.tsx`: `categoryEditorialMedia` now combines the category-media and official lists for a category (category-media first, so the new photographs open) instead of taking the first list only. No other behaviour changes.
- `docs/media/3l-media-002/hub-uploads/`: 34 square 1200 px WebP files (≤ 325 KB, metadata-free) for Product Hub. **Product photos are published through Product Hub, not bundled.**
- `scripts/prepare-media-002.py`: reproducible build from the private originals (hash-checked, reviewed crop boxes in `selection.json`, no stretching or colour edits).
- `scripts/media-002-hub.ts`: stages the product media as a private Product Hub draft (see plan below).
- Tests: `tests/commerce/media-002.test.ts` (new); four existing tests now pin the retained opening frames instead of a fixed gallery length.

No price, SKU, availability, description, translation, pack rule, checkout, order, payment, notification or permission change.

## Validation

- typecheck, lint, build; commerce suite 713/713 (+3 media tests).
- Full rehearsal on a disposable local server with the same build: dry run, `--draft`, then publication. Product Hub reported exactly 34 new assets and 12 product-media changes, zero issues. Every option, price and availability was identical before and after. All 12 products rendered the new photos in the planned order (byte hashes checked), zero broken images and no horizontal overflow at 390 or 1440 px. The cart showed the new thumbnails. The rehearsal fixture's media for these 12 products is identical to live.
- Browser suites (Chromium + WebKit, Playwright 1.64): official media 10/10, Conchas 52/52, dynamic storefront 32/32.
- Before/after previews: [`previews/`](previews/). "Before" is the live public site; "after" is the rehearsal. The cart preview's AED 21 vs 23 for filled chocolate is the fixture's price list, not this change.

## Production publication plan (requires approval)

1. Approve the mapping above and decide Tricolor (leave the placeholder, or choose a photo).
2. Merge this PR (code-only: galleries; main autodeploys). Verify the three category galleries on www.
3. Admin session in Operations, then dry run (read-only):
   `HUB_BASE=https://www.3ldubai.ae HUB_COOKIE='tl_session=…' node --import tsx scripts/media-002-hub.ts`
   It stops if the published revision is no longer `catalog-v1-63d2f003…` or any product's media changed.
4. `… scripts/media-002-hub.ts --draft`: refuses if any Product Hub draft already exists; saves the currently published media of the 12 products to `media-002-published-snapshot.json` (keep it with the release record); uploads; saves the private draft; stops if anything but media would change; then verifies the whole draft. It never publishes.
5. In Operations → Products, review the draft comparison (expected: 34 assets, 12 product-media rows, no issues).
6. Immediately before publishing, rerun read-only `… scripts/media-002-hub.ts --verify`: it fails if the draft contains anything unplanned (another editor's change, an extra image, a different order). Only then **Publish**.
7. Check on www: the 12 products (menu card, detail, cart thumbnail) at 390 and 1440 px.

**Rollback:** product images are a Product Hub edit. Move the previous image back to primary, or remove the new ones, and publish; the previous assets are kept in each product's media. Galleries: revert this PR's `category-media.json` lines. Never restore a database to undo media.

## Related PR #6

PR #6 (stale since 10 Oct, conflicting) carries the digital Conchas artwork already on `main`, plus the **withdrawn** `conchas_de_pistache_sobre_tabla_de_madera` frame. This PR shares no file with it and keeps that frame out. Recommendation: close #6 as superseded. Do not merge it.
