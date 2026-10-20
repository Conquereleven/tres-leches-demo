# Kitchen email — supplied visual reference

This supersedes the previous dense sans-serif product-first proposal. The founder supplied `Confirmación de pedido Tres Leches (1).png`: centered pink wordmark header, serif New Order title, rounded Product / Qty / Price panel, gold rules and total, paired schedule and address/contact blocks. The attachment is kept private; none of its customer data, prices, products or dates entered fixtures.

The real renderer uses Georgia/Times/system fallbacks, inline table layout and the approved pink/gold palette with darker accessible text. No external fonts, decorative image requests, hand-drawn icon substitutes or fake device chrome. Decorative bow/contact icons are omitted; no unapproved asset/transport dependency is introduced. This matches the format rather than copying the illustrative order.

Amounts remain accepted line totals, with unit/box price captions when quantity exceeds one. The subtotal uses those frozen lines; the delivery/fulfillment fee comes from the accepted quote. An unavailable fee stays unknown. Payment method is omitted because the renderer has no authoritative method field: the mock’s Card label must not be invented.

Original allergy/preparation/delivery notes remain complete directly after the product/total panel, before fulfillment and contacts. Packs retain nested frozen contents, exact box/piece counts and separate same-SKU mixtures. Address values already literally present in the full address appear once; missing/conflicting values and warnings remain explicit. The text fallback and all legacy-recipient output stay byte-identical.

## Browser heights

The new visual reference supersedes old 844px/35% reduction assertions. Tests now assert serif typography, centered brand/pink header, rounded table, full accepted data and no overflow. Heights are measured, never made to fit by truncation. Native mail-client usable height remains unknown.

|Fixture|Chromium 320|375|390|430|WebKit 320|375|390|430|
|---|---:|---:|---:|---:|---:|---:|---:|---:|
|short|816|742|722|704|813|742|722|704|
|three|1014|899|838|820|1012|899|838|820|
|typical|1189|1074|1013|974|1186|1074|1013|974|
|large|1415|1287|1260|1206|1412|1287|1260|1206|
|long|3066|2756|2659|2387|3131|2790|2693|2421|
|pickup|1142|1061|999|979|1139|1061|999|979|
|review|1243|1110|1048|973|1240|1110|1048|973|

At 390px, removing redundant customer-introduction copy and reducing vertical whitespace (not product font size) reduced one product from 820 to 722px, three products from 952 to 838px, and a six-piece box plus three singles from 1135 to 1013px. Customer identity remains in the contact block. All original instructions, warnings, accepted prices, quantities and nested compositions remain complete. Both engines pass accessibility and content checks.

The one/three-product fixtures fit a **raw 390 × 844 browser**, with only 6px spare for three products. They are NOT certified as fitting the actual mail viewport. The founder identified an iPhone 18 Pro, and Apple Mail, but no physical-device mail-client viewport or rendering has been captured. Required usable heights are 722px / 838px / 1013px respectively. Any smaller usable viewport requires scrolling. Larger orders and long safety notes deliberately scroll; no clipping, tiny-font workaround, phone-resolution assumption or inferred client-chrome deduction is used.

[Three-product mobile preview](previews/product-first-three-webkit-390.png) · [Box plus singles](previews/product-first-typical-webkit-390.png). See root `design-qa.md` for visual comparison and expected deviations.

## Safety / release

Only specifically opted-in internal recipients use this renderer. Empty `OPERATIONS_EMAIL_COMPACT_TO` stays legacy for all. No changes to routing, dispatch, provider IDs, frozen outbox rows, payment logic, customer emails, catalog or Production. No real send, merge or deployment. The previous source/integration heads and their CI cannot validate this follow-up; current exact-head evidence belongs in PR#50/#52. Native UAT, exact private allowlist, current independent backup restore and explicit controlled-release approval remain required.

## Integration regression follow-up

The first combined CI for this reference exposed two unrelated readiness checks. Operations read every image's `complete && naturalWidth > 0` immediately after route-shell visibility. The same predicate now waits within the existing assertion budget; broken images still fail. WebKit's UX payment setup was reproduced locally (1/5 failed): after REVIEW ORDER's pointer action the trace remained on Details and consent never appeared. It now uses the same centered, stable, uncovered-target assertion already used by PAY/Tricolor, followed by one normal click and explicit consent visibility. No forced click, fixed delay, retry, timeout increase, skipped assertion or business-code edit. Ten traced WebKit repeats pass after the correction. These remain in the existing PR, not a new feature/branch.

The same traced REVIEW ORDER race also reproduced in the stale-cart setup during the complete WebKit suite. Both setup paths now reuse `tests/helpers/stable-control.ts` rather than maintaining duplicate synchronization. Full checkout validation after that change passes21/21 Chromium and21/21 WebKit; all old/new amount, distinct-order, provider-redirect, superseded-checkout, uncertain-payment and consent assertions remain.
