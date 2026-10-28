# Prototype Instructions

## Durable Design Direction

- The user selected visual option 1: warm, premium Mexican editorial style with cream, cacao, marigold orange, muted agave green, serif headlines, and restrained craft details.
- Preserve the storefront-first hierarchy and carry the same visual language into the internal operations experience.
- Keep customer, order, sales, and WhatsApp content visibly marked as demo/fictitious until real integrations are authorized.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Commerce OS extension (TL-09–TL-12)

- Continue directly in this Git repository; do not use Lovable.
- New operational code is strict TypeScript in `server/` and `src/commerce/`. Validate financial/state changes on the server and keep external integrations behind adapters.
- The original storefront/history remain labelled demo. Never promote its client-selected payment labels into reconciled operational records.
- Delivery source data are in `docs/sources/`; unspecified fees/minimums must stay unknown and block payment until reviewed. Do not invent geography or rates.
- Full runtime is compiled Node + SQLite (`npm start` after `npm run build`). The preserved Sites Worker is static-only; never publish it as the complete operational backend.
- Load base styles before Commerce workspace styles so the responsive navigation overrides remain effective.
- Validate changes with typecheck, lint, unit/HTTP tests, build, original Sites tests and affected Playwright scenarios. Browser E2E uses its own disposable database on port 5174.

## Approved 3L brand phase (TL-19–TL-21)

- The user's corporate manual and Master Build Specification supersede the earlier visual option for the customer site only. Use Abril Fatface / Montserrat Medium, corporate lavender/blush/gold anchors and documented cream/brown web neutrals.
- `src/brand/` is the customer experience; `src/brand/content.ts` is its approved content/asset boundary. Never populate it from the fictitious Commerce OS catalog.
- Preserve the original checkout under the explicit MVP demo entry and operations under Gestión. Do not impose editorial compositions on the workspace.
- Heritage is MEXICO CITY SINCE 1982. Missing imagery, products, phone numbers, reviews, URLs and legal content remain explicit data slots. The supplied MP4 is a filmed screen reference, not a production hero asset.
- No push, deploy or merge without explicit user approval. Build includes a prerendered brand shell for no-JavaScript reading; the preserved Worker is still static-only.
- Brand QA covers 320/375/390/430/768/1024/1280/1440, keyboard/modal, reduced motion, axe and original Commerce regressions. See `docs/brand/implementation.md`.

## TL-24 release cleanup (supersedes prototype/demo instructions above)
- Runtime and navigation must contain only canonical operations and the approved brand site. No legacy MVP entry or synthetic data.
- Test fixtures belong under tests/ and must be injected explicitly; staging seeds are empty. Preserve production/provider activation gates.

## TL-25 provider activation
- Paymennt notifications use raw bytes, Base64 HMAC-SHA256 with the private registered hmacKey. Notification payload is never financial authority; GET reconciliation and durable receipts are mandatory.
- Independent provider groups activate by configuration; Meta outbound remains explicit, same-origin and governed by the 24h/template policy.
- Approved catalog lives in SQLite; use the validated admin import with backup. No runtime product fixtures.
- Admin readiness is staging-only. Do not assert PILOT READY or enable live/production without real provider validation and Lisa UAT.
- Current activation instructions: `docs/today-activation-runbook.md`; older TL18 blocked-contract notes are historical.

## Authorized offline Production release (2026-09-11)
- Production may run the current code with providers offline; this supersedes the earlier unconditional production boot block, not the LIVE payment gate.
- Require a dedicated release-production database, secure hosted configuration, no STAGING_SEED variable, Meta/AI disabled and copilot defaults. Never copy staging secrets or databases.
- Authenticated admin readiness GET is available in production; provider probes remain staging-only. See docs/production-offline-release.md.

## TL-27 premium operations shell
- Operations use a fixed left sidebar (252px desktop, 80px tablet rail) and a native modal drawer below 768px. One centralized navigation; existing permissions and routes remain authoritative.
- Approved operations styling: Montserrat UI, warm neutral surfaces, restrained lavender and taupe. No decorative headings for operational data; customer storefront unchanged.
- UI-only scope: preserve providers, auth, domain logic, database, state machine and commercial rules. No fake catalog/conversations/metrics.
- Branch feature/3l-premium-dashboard-shell stays local until Rodrigo reviews screenshots. No automatic production deployment or merge.

## Approved current Liza menu (1 October 2026)
- Canonical repository is `~/code/tres-leches-demo`. Preserve the approved public storefront direction.
- `src/brand/menu-data.json` and `data-imports/liza-current-menu.json` contain the reviewed current menu; the old AED25 `pan-de-muerto` SKU is retired and exists only in historical test fixtures.
- Latest Pan de Muerto/Conchas image menus override the older PDF. Packs have no invented assortment rules. Filled Conchas select size and filling only. Special cake sizes remain Mini / Small / Big.
- Advance-order notices apply only to Mango Cake, gelatinas and Rosca. Do not change scheduling or payment logic to implement them.
- Customer orders use product → cart → web checkout → Paymennt. WhatsApp remains support-only. No deploy without approval.

## Approved UAT patch V2 (3 October 2026)
- Flavours are separate authored storefront products with stable slugs; sizes/packs retain authoritative SKU IDs. Retired concha SKUs remain historical, not purchasable. Traditional conchas: Chocolate only. Filled conchas: Pistache only, existing prices confirmed.
- Customer approved maximum100 units per SKU; quantity supports direct integer entry. Pan singles season begins October3 through November15.
- Full text header wordmark, linked homepage menu preview, accessible visual ordering guide, scroll-driven assembly of separate cake layers; no looping motion and reduced motion shows final composition.
- Optional international WhatsApp contact is separate from required UAE operations mobile. Production remains legacy address mode; Google prepared but off.

## Approved final polish and cutoff (6 October 2026)
- Preserve existing assets/layout and cream/cacao identity; use reusable blush/pink accents. Journal portrait reveals original raster pencil detail with scroll-driven SVG brush masking. Mexico→Dubai route follows the physical journey (left→right desktop, top→bottom stacked mobile), never reversed by RTL. Reduced-motion shows final composition.
- Customer next-day cutoff is Asia/Dubai: entire 21:00 minute inclusive; 21:01 onward earliest global date is day after tomorrow. Delivery and pickup server normalization use shared policy, preserve 12/24-hour product-specific window-start notice and choose the later valid date. No closed production weekdays are invented.
- Apple Pay is provider-hosted, observed visible in Safari macOS on an existing authorized LIVE checkout. Do not add Apple/Stripe JS, change payment credentials or simulate a wallet button.
- MCP is audit/planning scope only; keep remote activation and any write tool behind separate explicit authorization. No Meta outbound, migration or ownership change. This sprint is TEST/preview-only until Production is separately authorized.

## Visual polish v2 (6 October 2026, hotfix after failed visual acceptance)
- Scroll-driven artwork measures the artwork's own on-screen centre, never its taller section; otherwise the animation finishes before it is visible.
- Mexico→Dubai: pink route drawn behind a visible moving marker; 0–20% Mexico active, 20–80% travel, 80–100% Dubai active. Sizes are authored in screen pixels.
- Journal portrait is drawn by hand-placed pencil strokes in an artist's order (construction, eyes and nose, mouth, hair, shoulders and necklace, secondary linework), each line growing behind a pencil point, then the untouched original resolves over them. Stroke data: `src/brand/journal-drawing.json`. No hatching, masks, wipes, filters or edge detection. Strokes are explicit geometry: Safari mis-measures dashes on long paths.

## Final 3L web palette (6 October 2026, authoritative; supersedes the five-colour palette)
- Brand colours are ONLY `--3l-blush #F6DFE0` (Pantone 9286 C) and `--3l-gold #A28D5B` (Pantone 8383 C), declared once on `:root` in `src/styles.css`, plus the existing cream/beige base. Pink `#FFC0C8`, lavender `#A191B2` and lavender-soft `#DDDAE8` are retired from the customer site: do not reintroduce them, approximate, or tint by opacity.
- Cream/beige stays the dominant canvas. Blush = warm surfaces and selected states; gold = rules, markers, active lines and the Mexico→Dubai route.
- Neither colour reaches text contrast on cream: text, numerals and outlines stay chocolate; focus rings pair a chocolate outline with a gold halo.
- `tests/polish-e2e/polish.spec.ts` asserts the computed token values, the rendered colours, and that no retired colour is defined or painted.
- Operations (`src/commerce/`) keeps its TL-27 styling and functional status colours until Joel decides otherwise.

## Order Experience V2 (6 October 2026)
- Customer-facing order number is `publicOrderNumber` shown as `#001`; the internal `TL-…` id stays the only key for payments, idempotency and audit. Issued once when an order first becomes paid; historical orders are not renumbered and show their internal id.
- Checkout captures first and last name separately. Delivery area is a typeahead whose value is always a canonical zone id; minimums come from the zone, never from typed text.
- Pickup asks only for street and city as billing (name from contact, country fixed UAE); never use the shop address as a customer's billing address. Pickup point is "3L Pastelerías".
- Customer emails are durable events written with the operator's transition (production started; ready for pickup — pickup only; out for delivery — delivery only), sent through Resend only when explicitly enabled. Manager WhatsApp number is private configuration (`WHATSAPP_MANAGER_PHONE`), never source. `META_OUTBOUND_ENABLED` stays false until Meta approval.
- Details and remaining configuration: `docs/order-experience/v2.md`.

## Official Pan de Muerto photography (9 October 2026)
- Source library stays outside the repo; `docs/brand/pan-de-muerto-photo-map.csv` accounts for all 50 files and `scripts/prepare-official-pan-media.py` regenerates public derivatives. Photos are assigned by visible coating/filling only; mixed boards are category imagery, never a flavour or pack. Never publish a photo together with its cutout twin.
- One rotation (`MediaRotation` in `src/brand/media.tsx`) serves cards and the Pan de Muerto banner. Products without their own photo keep the earlier image.

## Removed Pan de Muerto combinations (9 October 2026, Joel)
- Six chocolate-covering combinations were never approved and are removed: Ajonjolí · Chocolate covering (traditional) and Chocolate covering on all five fillings. The only covering product is Azúcar · Chocolate covering. Do not reintroduce them.
- Their 12 SKU ids live in `RETIRED_SKUS` (`shared/commerce-policy.ts`), which blocks listing and checkout regardless of the stored catalog; the import file marks them inactive. Historical orders are untouched.

## Approved Pan de Muerto prices (9 October 2026, Joel) — Conchas deferred
- Table and previous→new values: `server/domain/pan-price-update.ts`. Traditional 13/15; filled 21/23; Pistachio 23/26; packs 72/140/80/155 (traditional), 120/235/130/255 (filled). Pack prices are fixed, never multiples.
- Conchas (prices, names, variants, availability, photos) are out of scope until the next sprint and must stay identical to the released catalog. Azúcar · Chocolate covering Pan de Muerto and the filled Pistache concha are authorized products: never remove them.
- Production prices change only through `update-pan-prices` (plan, then apply); never the general importer for this release. See `docs/catalog/current-menu.md`.
- Homepage hero: new story film at ≥1024px, original packaging video below. Static files answer Range requests so Safari can play video.

## Menu watermark, restored banner and square pack photos (9 October 2026, Joel and Lisa)
- The official wordmark appears once as an 8% watermark (Joel approved Proposal A) behind the Menu introduction only (`.b-menu-intro-mark`). Never on product photos, cards, galleries, detail pages, or as a repeating or global background.
- The Pan de Muerto category banner is back (Lisa): the four mixed boards, whole, 3:2, same 3.5 s rotation. No banners on other categories. This supersedes the earlier "banner removed" decision.
- Pack photos are square by continuing each photo's own background (`extend` in `scripts/official-pan-crops.json`); breads are never copied, moved or redrawn. 3L-MEDIA-001 supersedes the filled pack's primary with founder-approved `02.png` (`official-pan-02`). Retain the historical `official-pan-13-pack` asset and Crema diplomática's unchanged approved third photo (`official-pan-13`).

## Operations D1 (11 October 2026)
- Admin shell uses isolated EN/TL resources and per-user browser preference. Never change customer notification language or stored state enums to localize labels.
- Products route is an honest unavailable state until PR #7 is integrated; do not connect unfinished catalog APIs.
- Print Center is preview-only. Known Epson models do not establish connectivity; no print jobs, IP communication or fake success until explicitly authorized hardware integration.
- Operations CSS stays scoped to `.commerce.ops-shell`; public EN/ES/AR styles and commerce rules are independent.

## BRAND-02 integration (12 October 2026, founder)
- Public Visual Identity V2 supersedes the earlier cream/cacao rule: dominant blush #F6DFE0; white surfaces; graphite #27242D; accessible raspberry #A93C68 CTAs. Scope variables to brand containers only. Operations/global styling remains unchanged. Preserve layout, typography, navigation, responsive behavior and motion.
- Retain PR #6 square product frames and independent three-frame 3:2 editorial opening gallery. Product/detail/cart/checkout resolve stable source identities; gallery assets must not silently follow product replacement.
- Current seven Conchas image presentations are interim, NOT final. New media status is AWAITING FOUNDER-APPROVED IMAGES. No generated, sourced or substituted final assets in this task. See docs/brand/brand02/replacement-manifest.json for required sources and media-only follow-up. Historical “final-approved” folder records prior provenance, not current final approval.
- Do not change SKU/price/availability, checkout/payment behavior, Operations, Product Hub backend, Railway or Production SQLite. No merge/deploy without separate approval.

## Catalog foundation initialization (12 October 2026)
- `catalog-foundation` audit is read-only on any profile; apply adds only `catalogFoundation`, needs the audited fingerprints, a verified backup and, in Production, an explicit confirmation and founder approval. Never correct the database from repository sources: a difference blocks until resolved with commercial evidence.
- Tools that write `State.catalog` directly must call `rebaseFoundation` in the same transaction. Procedure, audit results and rollback: `docs/product-hub/foundation-bootstrap.md`.

## Product Hub V2 (12 October 2026)
- Operations → Products is a real editor: private draft, before/after review, admin-only publication. `State.catalog` stays the only price and availability authority; the draft (`State.productHub`) is a candidate copy and is never read by checkout.
- Off by default: `PRODUCT_HUB_ENABLED` (editor) and `PRODUCT_HUB_PUBLISH_ENABLED` (publish). Publication is refused in Production in code until the storefront reads published data; do not describe the hub as publishing to customers before that integration.
- Admins and managers can create, edit, save, and discard private drafts and upload media. Only admins can publish. Operators and agents have no Product Hub access. Roles are enforced in the API.
- Existing SKU ids, published slugs and removed combinations are permanent: deactivate, never delete or reactivate. Details and remaining steps: `docs/product-hub/product-hub-v2.md`.

## Dynamic storefront catalog (12 October 2026)
- `STOREFRONT_DYNAMIC_CATALOG_ENABLED` (off by default) makes the menu read the published revision from `GET /api/storefront/catalog`; Production also needs `STOREFRONT_DYNAMIC_CATALOG_PRODUCTION=founder-approved`. Off means the storefront is exactly the build's catalog.
- With adoption on and no valid revision the endpoint answers 503 and checkout sells nothing; never fall back to bundled data. `State.catalog` stays the price authority; the browser never supplies amounts.
- Product Hub publication in Production is allowed only while adoption is active there. Keep the storefront's approved look: no new customer copy or CSS for this feature. Details and limits: `docs/product-hub/storefront-dynamic-catalog.md`.
- Product photographs resolve only through `selectedProductMedia` / `productGalleryMedia` (`src/brand/media.tsx`); menu, product page and cart must not pick images any other way. Catalog translations are never generated: missing ES/AR wording shows the pending marker.
- Price rollback is a new publication of the previous price from Product Hub. Never restore a database file or use the storefront flag to undo a price.

## Fronts A and C integrated (12 October 2026)
- Operations names products through `src/commerce/product-names.ts` only: the reviewed dictionary first, then English names approved in Product Hub (`productNames` from `/api/workspace`), always SKU plus exact recorded definition. Never translate at runtime, never rewrite an order snapshot; unknown definitions keep the original text with the review warning.
- The variant field "English name for Operations and tickets" is staff-only and must not appear in any public catalog response. Approved names are append-only.
- Candidate, conflicts and joint QA: `docs/product-hub/integration-candidate.md`.

## TL-OMS-01 order management (13 October 2026, Joel)
- Operations → Orders is a list (`OrdersList`) plus one page per order at `/operations/orders/:orderId` (`OrderDetails`), keyed by the internal id; `?order=` links are rewritten to it. Kitchen, Deliveries and Inbox keep `OrderCard` / `OrderPanel`.
- Presentation rules live in `src/commerce/order-view.ts` (pure, tested). Never duplicate state-machine or permission logic in components; actions reuse the existing commands and the server stays the authority.
- Operations palette: the only chromatic colours in any `src/commerce/*.css` are `#F6DFE0`, `#FFC0C8` and `#A28D5B`, plus ink `#27242D` and grey `#5A565F` (enforced in `tests/commerce/oms.test.ts`). No brown, orange, blue, red, purple or green accents: state is carried by icon, label and shape. This supersedes "Operations keeps its TL-27 styling". Gold never carries white text (ink on gold). `operations-shell.css` may differ from the baseline in colour declarations only; new order styles go in `oms.css`, scoped to `.commerce.ops-shell`.
- Show stored facts only: prices from the order snapshot (unknown stays "Not stored"), customer name from checkout before the conversation label and never a delivery area, notifications "Sent" only with provider evidence. Internal notes and product thumbnails are deferred: no backend field exists. Details: `docs/operations/oms/README.md`.
- The order page title is the order number (shell `heading` prop). Address warnings are advisory: the backend does not check addresses on transitions; do not add blocking rules in the UI or state machine without approval (`docs/operations/oms/address-dispatch-review.md`). New Tagalog labels are not natively reviewed (`docs/operations/oms/tagalog-review.md`).

## October 13 founder price correction
- Exactly ten Pan de Muerto SKUs now use `PAN_OCT13_CORRECTION`: chocolate covering 18/21, traditional packs 60/115/72/140, filled packs 100/190/120/235 AED. This supersedes October 9 only for these IDs; other prices and commercial rules stay unchanged. Never calculate packs from unit prices. Historical accepted order snapshots/payments are immutable.

## PACK-001 personalized Pan de Muerto packs (15 October 2026)
- `PERSONALIZED_PACKS_ENABLED` defaults off. Preserve the eight fixed-price pack SKUs. Components are preparation identities only: no individual-price sums, surcharges, presets or automatic distributions.
- Published Foundation `packEligibility` is the only component-approval source, independently of seasonal retail-single availability. Absent/empty rules approve nothing. Lisa must confirm actual production availability before release; test-fixture approvals are never commercial defaults.
- Preserve normalized composition in cart identity, quotation, idempotency and immutable accepted preparation snapshots. Historical kitchen/ticket text must use stored preparation names, not current catalog settings. Managers draft; only admins publish. No real roles change as part of PACK-001.
- The proposed illustrative-image disclaimer remains internal documentation until separately approved. Release and rollback: `docs/packs/personalized-packs.md`.

## 3L-META-003 direct integration decision (16 October 2026)
- Founder selected DIRECT META CLOUD API ONLY; no BSP, intermediary subscription or provider dashboard. GOLOSITALIA/3L own-business access and CornerTech's future Tech Provider registration are separate legal/use cases.
- Preserve existing app, portfolio, WABA and Business App number. No ordinary `/register` workaround, number linking, permission changes or outbound activation without explicit authorization.
- Current direct readiness and Meta-native coexistence gates: `docs/meta/direct-cloud-readiness.md`. Code/synthetic tests never prove individual number eligibility or actual signed delivery.

## Approved product-first kitchen email (20 October 2026, founder)
- Opted-in internal emails use a compact branded header, then an actual Product / Qty / Price table before notes, totals and compact fulfillment/contact/address rows. Preserve accepted names, sizes, quantities, frozen prices, every original instruction and safety warning.
- Each accepted pack line keeps its own nested composition, box counts and physical-piece totals; never combine distinct mixtures of the same SKU. Pack headings have no leading quantity; the quantity column remains explicit for all products.
- Optional OPERATIONS_EMAIL_COMPACT_TO remains a verified subset only. Non-opted-in recipients retain the original template byte-for-byte; frozen outbox rows and idempotency remain unchanged. No automatic rollout.
- Target widths 320/375/390/430. Small orders should fit where practical; large orders scroll without truncation. Browser height measurements never certify native Gmail/Apple Mail screenshot fit. Written design is available; the referenced screenshot was not attached.

## Supplied kitchen email visual reference (20 October 2026, founder)
- The now-attached “Confirmación de pedido Tres Leches (1).png” supersedes the previous dense sans-serif proposal: centered pink wordmark header, large serif New Order title, rounded classic Product/Qty/Price panel, gold dividers/total, paired schedule and address/contact blocks. Use Georgia/system fonts and email-compatible inline tables.
- Reference names, amounts, dates and payment method are illustrative only. Preserve authoritative frozen values, full notes/warnings and recipient-specific rollout; no new transport or decorative tracking assets. The prior 844px/35%-reduction visual budgets are superseded by reference fidelity; measure and disclose scroll instead of shrinking or truncating operational data.

## Media technical closure (25 October 2026, founder)
- The current Tricolor pack photo and whole-cake photos for Special Flavours Cake Jars Matcha/Chocolate/Berries are explicit temporary non-blocking commercial exceptions. Preserve their assignments; do not claim they are corrected or extend the exception to Tricolor single.
- Menu viewport reservation is loading-state-only. Keep loaded card/detail/cart/checkout geometry and static-gallery behavior unchanged. The offline Media Quality Gate never grants commercial approval or publishes catalog data; metadata corrections remain proposals until separately authorized.

## Storefront Conversion UX V2 (26 October 2026)
- The customer pack builder requires all 6 or 12 approved components before Add to Cart. Its explicit fill-remaining control preserves existing selections; box quantity is independent of piece composition. Existing server eligibility, premiums and frozen-cart identity remain authoritative.
- Product search reads the current published Product Hub catalog intersected with checkout availability and prices. It must never offer retired, unavailable, unpublished or mismatched-price SKUs. Search vocabulary may add localized synonyms, never a parallel product or price catalog.
- Complementary suggestions are optional after a successful Add to Cart. Curate families in `src/brand/recommendation-rules.json`; resolve current SKUs, availability, photos and prices from published sources. Complex packs must open the existing builder. Never add without an explicit customer action or block the cart/checkout path.
- Preserve EN/ES/AR and RTL. The local conversion fixture uses disposable SQLite and fake providers; its screenshots and QA are in `docs/storefront/conversion-v2/`.
