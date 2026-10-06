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
