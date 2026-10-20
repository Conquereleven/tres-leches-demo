# Kitchen email — supplied visual reference

This supersedes the previous dense sans-serif product-first proposal. The founder supplied `Confirmación de pedido Tres Leches (1).png`: centered pink wordmark header, serif New Order title, rounded Product / Qty / Price panel, gold rules and total, paired schedule and address/contact blocks. The attachment is kept private; none of its customer data, prices, products or dates entered fixtures.

The real renderer uses Georgia/Times/system fallbacks, inline table layout and the approved pink/gold palette with darker accessible text. No external fonts, decorative image requests, hand-drawn icon substitutes or fake device chrome. Decorative bow/contact icons are omitted; no unapproved asset/transport dependency is introduced. This matches the format rather than copying the illustrative order.

Amounts remain accepted line totals, with unit/box price captions when quantity exceeds one. The subtotal uses those frozen lines; the delivery/fulfillment fee comes from the accepted quote. An unavailable fee stays unknown. Payment method is omitted because the renderer has no authoritative method field: the mock’s Card label must not be invented.

Original allergy/preparation/delivery notes remain complete directly after the product/total panel, before fulfillment and contacts. Packs retain nested frozen contents, exact box/piece counts and separate same-SKU mixtures. Address values already literally present in the full address appear once; missing/conflicting values and warnings remain explicit. The text fallback and all legacy-recipient output stay byte-identical.

## Browser heights

The new visual reference supersedes old 844px/35% reduction assertions. Tests now assert serif typography, centered brand/pink header, rounded table, full accepted data and no overflow. Heights are measured, never made to fit by truncation. Native mail-client usable height remains unknown.

|Fixture|Chromium 320|375|390|430|WebKit 320|375|390|430|
|---|---:|---:|---:|---:|---:|---:|---:|---:|
|short|932|840|820|802|930|840|820|802|
|three|1147|1014|952|934|1144|1014|952|934|
|typical|1329|1196|1135|1096|1327|1196|1135|1096|
|large|1555|1409|1378|1325|1553|1409|1378|1325|
|long|3206|2878|2781|2509|3271|2912|2815|2543|
|pickup|1282|1183|1121|1101|1280|1183|1121|1101|
|review|1383|1232|1171|1095|1381|1232|1171|1095|

At390px, the one-product fixture fits the raw844px browser viewport; three products with complete allergy/address warnings and larger orders scroll. This is not native iPhone screenshot certification. The extra safety information absent from the mock is deliberately retained.

[Three-product mobile preview](previews/product-first-three-webkit-390.png) · [Box plus singles](previews/product-first-typical-webkit-390.png). See root `design-qa.md` for visual comparison and expected deviations.

## Safety / release

Only specifically opted-in internal recipients use this renderer. Empty `OPERATIONS_EMAIL_COMPACT_TO` stays legacy for all. No changes to routing, dispatch, provider IDs, frozen outbox rows, payment logic, customer emails, catalog or Production. No real send, merge or deployment. The previous source/integration heads and their CI cannot validate this follow-up; current exact-head evidence belongs in PR#50/#52. Native UAT, exact private allowlist, current independent backup restore and explicit controlled-release approval remain required.

## Integration regression follow-up

The first combined CI for this reference exposed two unrelated readiness checks. Operations read every image's `complete && naturalWidth > 0` immediately after route-shell visibility. The same predicate now waits within the existing assertion budget; broken images still fail. WebKit's UX payment setup was reproduced locally (1/5 failed): after REVIEW ORDER's pointer action the trace remained on Details and consent never appeared. It now uses the same centered, stable, uncovered-target assertion already used by PAY/Tricolor, followed by one normal click and explicit consent visibility. No forced click, fixed delay, retry, timeout increase, skipped assertion or business-code edit. Ten traced WebKit repeats pass after the correction. These remain in the existing PR, not a new feature/branch.

The same traced REVIEW ORDER race also reproduced in the stale-cart setup during the complete WebKit suite. Both setup paths now reuse `tests/helpers/stable-control.ts` rather than maintaining duplicate synchronization. Full checkout validation after that change passes21/21 Chromium and21/21 WebKit; all old/new amount, distinct-order, provider-redirect, superseded-checkout, uncertain-payment and consent assertions remain.
