# 3L UAT Production patch V2 — 3 October 2026

## Scope and compatibility
77 authored storefront products, 222 active purchase options. The 234 prior SKU IDs and prices are preserved: 14 retired Concha options remain inactive for history, two new Pistache options bring storage to236. No SQL migration. `Order.customerDetails.whatsappNumber` and server-owned `Order.storefrontProducts` are optional additive JSON fields; previous records remain untouched. Catalog import changes catalog and administrative audit only, after automatic private SQLite backup.

Pan de Muerto singles: October3–November15 in Dubai time; packs year-round. Traditional conchas Chocolate only; filled Pistache only. Confirmed prices18/21 and packs100/190/120/235AED. Existing size/pack SKUs and frozen order snapshots remain authoritative.

Each product has an authored stable ID/slug, title, single flavour, size/pack SKUs, primary photo mapping and optional gallery. Deep links: `/menu?product=<slug>`; categories: `/menu?category=<id>`. No display-name-derived identity at runtime. Price and availability continue to require a matching server product.

Quantity integer1–100 per SKU, editable with numeric keyboard, +/- and arrow keys. Malformed/zero/out-of-range drafts restore on blur; cart persists SKU and quantity. CTA: CONTINUE TO FULFILLMENT.

Required UAE mobile is unchanged. Optional international WhatsApp requires an explicit +/00 country prefix, normalizes to E.164, persists separately and appears in authorized order cards. It is not sent as the payment-provider phone and never triggers a message. Historical orders without it still render.

## Presentation
Full approved wordmark, responsive menu preview directly after packaging hero,10-step accessible ordering guide, flavour cards and detail pages. Editorial composition uses existing independent layers and one scroll-frame geometry read; transforms/opacity with stagger, no library and no looping. Reduced motion receives final composition. Existing optimized packaging media/fallback preserved.

## Release gate and rollback
Run typecheck, lint, build, full unit/integration, original/menu/checkout/closure/UATV2 Playwright, Sites packaging, audit and secret scan. Browser providers are local mocks. Review390/768/1440 captures in `work/qa/uat-v2`; original responsive suite also checks320/375/430/1024/1280.

Current baseline:8ba1cbe45954afe4de4dbdcd595294e9e30e87e5, Railway deployment ea211e75-b372-4a3d-bdf6-ab4395ad0d8b. Production project1f9a94c1-0574-49a9-b579-bf6af3aad601, servicefe8c1417-39ca-4038-b94e-68659ab1c659, environment142de30a-4879-4d04-85b9-12e79aa51bda.

Before deploy: backup `/data/3l-production.sqlite`; record counts/hashes for orders, payments, conversations and zones. Deploy exact clean archive using existing Railway pipeline. Catalog dry-run must return valid=true/count236; apply the same deployed file with automatic backup. Re-check integrity and active catalog222. Do not restore a whole database over newer transactions.

Rollback: redeploy baseline deployment and restore catalog ONLY with `npm run catalog rollback <catalog-backup>` if necessary; preserve orders/payments/volume. Optional fields are harmless to old code. Never remove new historical references or replace the full live database.

## Production settings and Lisa UAT
DELIVERY_ADDRESS_MODE=legacy. Google architecture preserved but off. META_OUTBOUND_ENABLED=false. No payment credentials, provider handlers, reconciliation, delivery fees or minimum rules change. No actual payment during QA.

1. Home: full logo, packaging video, clickable menu preview, HOW TO ORDER? anchor. Scroll cake composition, verify final settled state and reduced motion.
2. Open distinct flavours and share their product links; choose size/pack only. Confirm Pan available today, Chocolate traditional Concha and Pistache filled Concha.
3. Type40, then100; test +/-; verify correct cart subtotal and CONTINUE TO FULFILLMENT.
4. Select manual community/address: JLT A–D minimum30AED, no fee, total=subtotal. Select a valid next-day date/time;12-hour and product-specific24-hour notices still apply. Test pickup separately.
5. Enter UAE mobile and optional international WhatsApp; review normalized number. Leave payment unsubmitted during no-charge QA.
6. Operations: existing orders still present, legacy addresses visibly unverified/manual-review, new WhatsApp visible when supplied. A real payment is a separate client UAT action.

## Tomorrow’s photos
Map optimized approved source assets to `media-manifest.json.products[].primarySourceId` and optional `gallerySourceIds`. Product IDs/slugs/SKUs do not change. Exact size-specific imagery remains available in asset entries. Family fallbacks are identified as family photography; do not fabricate product photography.

34 products have a final assigned photo; 43 await Lisa. Pending IDs:

- `pan-de-muerto-traditional--azucar`
- `pan-de-muerto-traditional--ajonjoli`
- `pan-de-muerto-traditional--azucar-chocolate-covering`
- `pan-de-muerto-traditional--ajonjoli-chocolate-covering`
- `pan-de-muerto-filled--crema-diplomatica-vainilla`
- `pan-de-muerto-filled--chocolate`
- `pan-de-muerto-filled--mascarpone-y-cajeta`
- `pan-de-muerto-filled--mascarpone-y-fresas`
- `pan-de-muerto-filled--pistachio`
- `pan-de-muerto-filled--crema-diplomatica-vainilla-chocolate-covering`
- `pan-de-muerto-filled--chocolate-chocolate-covering`
- `pan-de-muerto-filled--mascarpone-y-cajeta-chocolate-covering`
- `pan-de-muerto-filled--mascarpone-y-fresas-chocolate-covering`
- `pan-de-muerto-filled--pistachio-chocolate-covering`
- `pan-de-muerto-traditional-pack`
- `pan-de-muerto-filled-pack`
- `conchas-traditional--chocolate`
- `conchas-filled--pistache`
- `conchas-traditional-pack`
- `conchas-filled-pack`
- `tres-leches-premium--tiramisu`
- `special-flavours-cake--berries`
- `special-flavours-cake--chocolate`
- `special-flavours-cake--half-rosettas`
- `special-flavours-cake--matcha`
- `cake-jar-premium--tiramisu`
- `special-flavours-jar--matcha`
- `special-flavours-jar--chocolate`
- `special-flavours-jar--berries`
- `carrot-cake`
- `cheesecake`
- `jelly-gelatina-fruits`
- `jelly-gelatina-dulce-de-leche`
- `orejas`
- `bisquets`
- `croissant--plain`
- `croissant--chocolate`
- `croissant--pistacchio`
- `croissant--cherry`
- `croissant--integral`
- `cubilete--cream`
- `cubilete--cheese`
- `rosca-de-reyes`
