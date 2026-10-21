# Tricolor: color-specific singles and fixed three-piece boxes

Development candidate from `d7bee2793191dd47d8d7f661059d410f657b1ac4`. No Production writes, deployment, live provider actions or email sends.

## Commercial mapping

| Existing/new SKU | Pieces per purchase unit | Size per piece | Fixed AED | Quantity 2 AED |
| --- | --- | --- | --- | --- |
| `conchas-traditional-tricolor-mini-40-g` (retained) | 1, mandatory Red/White/Green | 40 g | 11 | 22 |
| `conchas-traditional-tricolor-individual-70-g` (retained) | 1, mandatory Red/White/Green | 70 g | 13 | 26 |
| `conchas-tricolor-pack-3-mini` (new) | 3: one Red, one White, one Green | 40 g | 33 | 66 |
| `conchas-tricolor-pack-3-individuales` (new) | 3: one Red, one White, one Green | 70 g | 39 | 78 |

All four rows at quantity two: AED192. Two boxes mean six physical pieces. No composition selector, component price, premium calculation or Pan de Muerto eligibility entry is introduced for fixed Tricolor packs. Two existing singles keep their identifiers, availability, names and prices. The two new pack options share one product card with an explicit size/quantity selector. Code catalog becomes 238 SKUs: 218 active / 20 inactive, 75 public product cards, 30 families. No other commercial rows change.

## Implementation and historical safety

`color` is a strict enum on cart/order lines. Same SKU with different colors has separate identity and idempotency/cart fingerprints. New checkout requires a color; fixed boxes reject client colors and compositions. All prices still come exclusively from the authoritative catalog.

Acceptance generates the existing immutable preparation snapshot contract, versioned `tricolor-preparation-v1`: one component for a single or three components for a fixed box. Components are preparation identities, not purchasable SKUs. Frozen English names feed Operations/tickets/emails; localized frozen names feed public confirmation. Existing Pan snapshot generation and pricing remain unchanged.

Historical Tricolor singles without recorded colors remain readable at their original financial amounts and display a preparation-review warning. No color is inferred. Malformed new snapshots are rejected or surfaced for review. Historical financial snapshots are never rebuilt from current catalog data.

The existing image of a single three-colored concha is retained as an asset but withdrawn from the product assignment/resolver. New presentations use a neutral brand mark. An approved Product Hub upload can replace it later through the shared media resolver. No food images were generated. Category opening gallery is unchanged.

Kitchen HTML/plain text retain parent-first pricing and frozen composition. Singles show selected color and physical totals. Boxes show one fixed price per box, then their internal breakdown and total physical pieces. Existing email recipients, queues and idempotency are untouched. The included HTML/text example is entirely fictional, generated with injected fake payment transport and no email transport.

## QA

- Typecheck, lint and build, including i18n/customer-copy audits.
- Complete commerce/unit/integration suite: 664/664.
- New focused tests: 8/8 (commercial matrix, colors, snapshots, fake paid reconciliation, historical immutability, zone minima, idempotency, and guarded migration rehearsal).
- Chromium/WebKit Tricolor: 24 scenarios across 390/768/1440px and EN/ES/AR, plus kitchen email, paid confirmation, Operations and preview-only tickets.
- Existing checkout: 21/21 Chromium, 21/21 WebKit.
- Product Hub browser workflows/accessibility: 8/8 across Chromium/WebKit.
- Baseline comparison: all 236 existing commercial rows byte-for-byte equivalent as parsed records; exactly two additions, zero edits/deletions.
- Existing Pan premium browser regression: 24/24 across both engines.
- Local secret heuristic: zero findings. Dependency audit: zero vulnerabilities.
- Images in `screenshots/`; retained representative mobile/tablet/desktop evidence. Browser test regenerates every locale/width combination.

Browser evidence uses synthetic SQLite and fake Paymennt only. No physical-device or real mail-client delivery claim. Build retains existing bundle-size warnings and existing pending business-information warnings.

## Reviewed migration plan: NOT EXECUTED

`node --import tsx scripts/plan-tricolor-catalog.ts /private/verified-backup.sqlite`

The command opens SQLite **read-only**, verifies integrity, checks Product Hub/Foundation consistency, refuses an existing draft and verifies both existing single prices/availability. It emits only revision-bound existing Product Hub commands: add the pack family/product/two SKUs if absent, remove the known misleading Tricolor image assignment, clarify only Tricolor display-name translations, and publish. Existing uploaded replacement media is preserved. Conflicting existing IDs/prices stop the plan. An identical second plan emits no changes. No general catalog import or direct catalog SQL writes exist in this tool.

The synthetic rehearsal publishes through `hubCommand` against isolated SQLite and checks unchanged unrelated catalog rows, orders and payments. The plan must be reviewed again against the live published revision before any future authorized execution; it never copies other repository prices over newer publications.

## Future release / independent authorization gates

1. Review this PR and authorize merge/deployment separately. Confirm deployment automation before merging.
2. Before Production writes, inspect current catalog, pending Tricolor checkouts, Foundation revision and existing drafts read-only. Never assign colors to old unpaid/paid orders. Existing colorless historical checkouts require operational review if completed.
3. Take a private consistent SQLite backup; verify integrity and isolated restore. Obtain explicit commercial-publication approval.
4. Deploy this reader/validator/UI code first. Dynamic Production catalog retains the existing two singles; new packs remain absent until publication. Verify existing checkout and Pan rules before proceeding.
5. Generate/review the plan from the current private snapshot and execute only its existing Product Hub draft commands, with current version/revision checks. Review the complete diff: two new fixed pack SKUs, their metadata, Tricolor display-name translations and the known Tricolor image assignment only. Do not carry unrelated draft work.
6. Publish through the administrator workflow. Smoke-check the four prices, color validation, fixed capacities, matching config/catalog revision, existing Pan premium behavior and historical snapshots. No real payment is required.

## Rollback

Never restore an old database over active transactions. Before any new-format checkout exists, code rollback may use the prior approved build after checking pending checkouts. After any new-format order exists, retain the new preparation reader: the old build rejects preparation snapshots without the old personalized composition field. Prefer a forward fix; if commercially authorized, archive only the two new pack variants through a new Product Hub publication. Keep all SKU references, accepted colors, preparation snapshots, payments and order history. Do not roll back Pan premium pricing, provider configuration or unrelated catalog publications.

## Remaining release limitations

- Approved photos for one chosen-color piece and a three-separate-piece box are still missing; neutral imagery is intentional.
- Production remains on its existing code/catalog. No deployment or catalog publication is authorized by this delivery.
- The founder must review and separately authorize the release and narrowly scoped Product Hub publication.

## Evidence

[Complete file inventory](FILES_CHANGED.md). Representative screenshots:

| View | Screenshot |
| --- | --- |
| Mini single / Individual single (mobile ES) | [Mini](screenshots/chromium-390-es-single-1.png) · [Individual](screenshots/chromium-390-es-single-0.png) |
| Fixed Mini / Individual box (mobile ES) | [Mini](screenshots/chromium-390-es-pack-1.png) · [Individual](screenshots/chromium-390-es-pack-0.png) |
| Desktop products | [Single](screenshots/chromium-1440-en-single-0.png) · [Box](screenshots/chromium-1440-en-pack-0.png) |
| Cart / checkout | [Mobile cart](screenshots/chromium-390-es-cart.png) · [Desktop checkout](screenshots/chromium-1440-en-checkout.png) |
| Arabic RTL tablet | [Cart](screenshots/webkit-768-ar-cart.png) · [Checkout](screenshots/webkit-768-ar-checkout.png) |
| Frozen paid confirmation | [WebKit](screenshots/webkit-confirmation.png) |
| Operations / preview-only ticket | [Order](screenshots/webkit-oms.png) · [Ticket](screenshots/webkit-ticket.png) |
| Kitchen email | [Mobile](screenshots/chromium-390-email.png) · [Desktop](screenshots/chromium-1440-email.png) · [HTML](fictional-kitchen.html) · [Text](fictional-kitchen.txt) |
