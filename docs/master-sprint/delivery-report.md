# 3L master sprint — review candidate

## Outcome
Canonical repository: `/Users/rodrigom./code/tres-leches-demo`. Branch: `feature/3l-master-delivery-storefront`, based on `78baadf4c30969a81ae83967fbff8e20fcf48ccc`. No merge, deployment, production DB change, real payment or Meta activation.

The customer journey remains Product → Cart → Web Checkout → hosted Paymennt → authoritative reconciliation. Geography activation and PR publication are blocked by external inputs. Arabic and remote MCP are foundations, not completed account integrations.

## Requirement matrix
| Requirement | Result / evidence |
|---|---|
| Reference homepage | Five completed reference sections, cream/gold, food video poster and approved local imagery; unfinished reference placeholders omitted. Desktop comparison saved. Full pixel equivalence is not claimed. |
| Official brand identity | Abril Fatface/Montserrat retained; approved gold mark/favicon; lilac interiors. Existing manual-inspection record used because original PDF is unavailable. |
| Separate menu | `/menu`, server route allowlist and existing catalog component; eight categories. |
| Photography/video | Real reference assets locally bundled with provenance; no generated food; playback is user-controlled, offscreen pauses. |
| How to order | `/how-to-order`; actual cart, pickup/delivery, windows and hosted checkout guidance. |
| Quantity/cart reset | Quantity bounds, invalid quantity rejection, explicit clear confirmation; paid checkout capability retained. |
| Floating affordances | Left support WhatsApp +971585943319; cart shown for nonempty cart, header cart visible even empty. |
| Pan de Muerto season | Singles October 15–November 15 inclusive, Dubai timezone; server config and pricing enforce it. Packs permanent. |
| Pack presentation | Half Dozen/Dozen labels; canonical sizes/SKUs preserved; no invented assortment selectors. |
| Pistachio/chocolate | Owner approved same base prices; 16 new explicit single variants, candidate catalog 234 options. Original 218 prices preserved. No production import. |
| Option ordering | Descending prices and deterministic SKU tiebreak. |
| Next day only | Server rejects same-day requests. Tomorrow is earliest UI date. |
| Notice | Shared 12-hour minimum from window start; Mango cakes, gelatinas and Rosca 24 hours. |
| Windows | Only 8AM–1PM, 1PM–4PM, 4PM–9PM accepted by server. |
| Minimum | Area dropdown shows AED minimum; existing server quote/minimum checks retained. |
| Address authority | Private verified full address/building registry → coordinates → exactly one active approved polygon → area/minimum. Claimed dropdown area cannot override result. Unknown or overlapping addresses fail closed before payment creation/resume. |
| Geographic activation | Pending approved map/verified coordinate data; owner will provide after sprint. Typed arbitrary-address geocoding remains external work until provider/data approval. |
| Checkout | Existing hosted flow, card/payment state and authoritative reconciliation regression tests pass. |
| Order history/paid immutability | Existing frozen snapshots, idempotency, cart fingerprint and superseded unpaid order behavior retained. |
| Tracking | Existing capability-protected actual order/payment status and fulfillment timeline retained; confirmation screenshots and server-authority tests. |
| Arabic | Navigation resources, persisted language, RTL document direction and switcher. Full catalog/error/guidance translation pending; legal/payment copy kept in English. |
| Dashboard security | Existing session/RBAC/origin protections preserved; no new public operations access. |
| Apple Pay | Hosted-method merchant readiness documented; no activation/button/charge. |
| Meta | Existing backend and activation gates retained; no configuration change or outbound activation. |
| MCP | Disabled default; authenticated admin/manager readonly redacted domain tools. External OAuth and transport conformance remain pending; no Lisa account connection. |
| Accessibility/responsive | Automated eight-category axe checks and overflow/console checks at 390, 768 and 1440; checkout responsive tests. |
| PR | Blocked: no Git remote; need repository URL/base branch. |

## Key boundaries
- `shared/commerce-policy.ts`: Dubai calendar, season, notice and windows shared by server and browser.
- `server/domain/website-address.ts`: fail-closed server-owned address resolution; no keyword-to-area bypass.
- `server/domain/web-checkout.ts` and `server/http.ts`: enforce schedule/location before creating or resuming payment; serve new routes.
- `src/brand/Experience.tsx`, `storefront.css`, `StorePages.tsx`, `SiteChrome.tsx`: public presentation and routes.
- `src/brand/menu-data.json`, `data-imports/liza-current-menu.json`: exact selectable SKUs; existing 218 prices unchanged.
- `server/domain/mcp.ts`: redacted read-only role-protected facade.

## Delivery chain and safety
ADDRESS → verified server coordinates → one active polygon → authoritative AREA → MINIMUM → tomorrow-or-later DATE → notice at window START → approved WINDOW → checkout. Create and resume reject a mismatched claimed area; client-provided coordinates are not accepted. A missing map/registry never becomes synthetic coverage. Pickup bypasses delivery geography but still obeys scheduling.

No payment adapter, payment state machine or provider settings were changed. Existing real Paymennt/Meta services were not called. Credentials remain server-side; no new secret-bearing UI. Verified address files must stay private and must not be committed. MCP output excludes customer PII and payment records.

## Validation
- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: 309 passed, 0 failed (baseline 295).
- `npx playwright test --config playwright.checkout.config.ts`: 19 passed.
- `npx playwright test --config playwright.menu.config.ts`: 8 passed.
- `npm run test:sites`: 4 passed.
- `npm run build`: pass. Existing missing business-copy warnings remain explicitly visible.
- `npm run audit`: 0 vulnerabilities after compatible transitive brace-expansion 5.0.12 patch.
- `npm run scan:secrets`: 256 scanned, 0 heuristic findings.
- Final presentation-only screenshot run covers 390/768/1440. No external payment requests, page errors, console errors or horizontal overflow in the tested menu/cart/checkout views; axe category checks pass.

## Screenshots
Artifacts are local under `work/qa/master-sprint/`: homepage, cakes, jars, bakery, pan, conchas, specialities, seasonal, extras, product, cart and checkout at 390/768/1440; desktop `reference-comparison.png`. Delivery/pickup screenshots: `work/qa/delivery-pickup/`. Confirmation/tracking: `work/qa/ux/paid-confirmation-{390,1440}.png`. All are isolated test data, not a real charge.

## Exact remaining business inputs
1. Approved zone polygons/GeoJSON and verified address-coordinate examples (or approval for a specific geocoder). Owner deferred these until after sprint.
2. Original identity manual location for reinspection.
3. Approved Arabic catalog, instructions, validation and sensitive text.
4. Paymennt merchant confirmation of Apple Pay on hosted checkout.
5. Meta approval/identifiers separately; no activation in this sprint.
6. GitHub repository URL and intended PR base branch.

See `external-readiness.md` for activation boundaries. The sprint is a review candidate; it is not production-ready geography or fully connected remote MCP.
