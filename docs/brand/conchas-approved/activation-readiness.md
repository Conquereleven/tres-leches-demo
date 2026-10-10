# Production release: six approved Conchas SKUs

Authorization: 2026-10-10. Lisa approved digital Conchas images; owner approved selling Traditional Vainilla, Traditional Pistache and Traditional Tricolor in Mini 40 g (AED 11) and Individual 70 g (AED 13). Each of these six IDs already existed inactive; no SKU identities or prices were invented.

The storefront uses the exact product images and shared Pan de Muerto presentation. Filled Pistache, both packs, Pan de Muerto and every other item are intentionally untouched. No public labels or claims that digital imagery depicts a physical photograph.

## GO / NO-GO

1. Review updated PR #5, require all CI green and verify six new purchase cards, 390/768/1440 px, EN/ES/AR and matching per-flavour images in cart/checkout. Validate new browser tests with Chromium and WebKit and record updated visual evidence.
2. Before any Production change, read-only inspect all 6 SKUs in the active SQLite DB, live orders, payments, payment notifications, settlement events, audit count and existing Paymennt cutoff. Create a fresh SQLite-consistent backup and verify an isolated restore.
3. Never use the full-catalog importer; that overwrites unrelated records and could undo independently approved live prices. Use only the targeted `activate-conchas` script.
4. Deploy the reviewed pinned GitHub SHA with no changes to the Paymennt cutoff, provider secrets or attached /data volume. Production must reach SUCCESS; verify SHA and /api/health.
5. Run `node dist/node/activate-conchas.js plan` inside the Production service. GO only if `blocked: []`, `safeToApply: true`, and exactly six expected SKU IDs appear in `willChange` (or are already current). Abort otherwise.
6. Run `node dist/node/activate-conchas.js apply`. It backs up SQLite again and writes only 6 `active` and 6 `availability` fields atomically. Re-run `plan` and require `willChange: []`, six `alreadyCurrent`, and `untouchedIdentical: true`.
7. Check `/api/checkout/config` returns all six SKU IDs at 1100/1300 fils; the full menu shows each exact photo and a working Add to Cart. Test both sizes in browser, quantity/mixed cart, pickup or delivery and checkout up to the external payment boundary. Never create synthetic Paymennt LIVE charges. Delivery minimums remain authoritative per selected active zone (configured bands AED 30 / 50 / 100 / 150 / 200 / 250 / 300, with the live zone record determining eligibility); do not impose a universal AED 30 threshold. Delivery fee stays AED 0 for supported zones when that zone's minimum is met. Existing pickup behavior does not use a zone minimum and must not be altered. One AED 11/13 concha may be below a delivery zone minimum and can be combined with other products or quantities.
8. Recheck current orders, payments, notifications, settlements and receipt fingerprints. Do not silently reactivate any other inactive Conchas item (notably filled variants).
9. On failures, restore old application build as needed, preserving the active database. Never overwrite new orders with an old SQLite backup. A catalog rollback needs a separately guarded targeted six-SKU deactivation, not a full import or DB restore.

Production code and catalog are separate gates. The source change is not commercially LIVE until BOTH deployment and the targeted DB activation are verified. The PR itself must not be merged or deployed without the owner's release authorization.
