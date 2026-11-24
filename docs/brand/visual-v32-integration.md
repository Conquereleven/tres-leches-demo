# 3L Visual Lab V3.2 · I01–I05 integration candidate

Founder approved V3.2 visually on 2026-11-22 at 390×844, 375×667 and 320×568, **not** the previous PR #82. Preserve four-column desktop catalog.

## Scope
- New isolated preview: `/visual-v32`, `/visual-v32/menu`, `/visual-v32/bakery`.
- Authoritative products, variants, prices, seasonal rules and published-state protections supplied by existing `useMenu`, `useCheckoutConfig`, `availableSku`, `liveOrderable`, `ProductOptions` and `AddToCart`.
- Cart/checkout remain the existing system; no provider calls or database changes were implemented.
- Old public routes, Operations, Product Hub and Production remain unchanged.

## Known fidelity delta
- New visual shell is an initial integration port, not a pixel-exact copy of the standalone V3.2 ZIP. HOME uses repository-owned legacy images while the approved Visual Lab used derived crops; this is deliberate until original photos are approved for Production.
- The commercial product configurator uses the existing safety-correct selectors and cart control inside the V3.2 popup. Final appearance requires browser acceptance against REF_C/D.
- Personalization mock note input was NOT ported, as the real checkout does not currently support that free-text choice at this boundary.
- Some unapproved or missing product imagery remains unassigned; never use demo stock photos in the live catalog.

## Verification
- GitHub typecheck, lint, build, security and Playwright evidence REQUIRED before VERIFIED.
- Browser test: four columns, dialog placement and Escape focus, short mobile viewport, catalog-down fail-closed case, no mock add-to-cart.
- Visual acceptance of original V3.2 does not automatically authorize this integrated rendering.
- No merge, deploy, real payments or Production actions authorized. Draft PR is review/CI only.

## Status
EXECUTED remote branch/commits; end-to-end CI and screenshot verification pending.

## Source ZIP fidelity pass (2026-11-22)
Founder uploaded `3L_VisualLab_V3_2_2026-11-22(1).zip`, SHA source to record in evidence separately.
Compared actual source `src/components/ProductPopup.jsx`, `src/refidelity-v2.css`,
`src/components/Layout.jsx`, Home/Menu/Bakery sources and preview asset PROVENANCE.md.
- Source typography: Cormorant Garamond headings, Jost body; original CSS uses Google Fonts. This isolated preview now imports the same font definitions under existing allowed CSP (network availability affects actual load).
- Source popup: price and quantity on the same row, CTA below, preserved independent scroll area with responsive height and visible CTA; use real cart engine and server-authoritative pricing instead of original mock prices.
- Original selected product personalisation free-text input is a MOCK behavior not supported by 3L's current cart/checkout data model; do not fake customer notes or accept unsupported order instructions.
- Original ZIP contains temporary reference-derived visual crops and synthetic conceptual artwork. The source explicitly prohibits using these as real production catalog photography. They are not yet carried into the deployable public asset bundle. Exact photo fidelity therefore still NO-GO, independently of markup fidelity.
- Founder retains final visual decision. Never claim this branch is Production ready.

### Source geometry fidelity
- `src/components/ProductPopup.jsx` original selects a desktop anchor
  width = `min(448, vw-24)`, height = `min(610, vh-50)` and mobile compact
  top = `max(12,min(54,round((vh-540)/2)))`. The integrated preview restores
  these parameters, keeping actual product triggers and real SKU pricing.
- `src/components/Layout.jsx` original backdrop `#F8E3DE` /
  `#FBEFEA` and glass header are now scoped to `.v32-app`.
- The original source includes a mock `Personalization` note that is not a
  real cart field. The exact source visual does not grant authority to store or
  silently drop that note. Preserved as explicit functional acceptance gap.

## New architecture after Founder clarification, 22-Nov-2026
- Founder rejects the earlier approach of wrapping legacy Shop/Policies/StorePages.
  New V3.2 customer pages are **standalone presentation components**, kept on
  isolated test-only routes. Production legacy UI remains untouched until separate GO.
- New src/brand/visual-v32/V32Commerce.tsx renders Contact, How to order,
  Policies, Cart, Checkout (synthetic no-payment preview) and Return using only
  domain business facts, authoritative cart/config, and quote endpoints.
- Product dialog now renders V32AddToCart, directly calling domain cart.add
  and supporting canonical six-piece minimums, tricolor color selection,
  conditional box composition. It does NOT import the legacy Shop frontend.
- Existing server quote, catalog authority and session storage contracts stay.
  Online payment is NOT wired yet: real payment requires separate verified
  integration preserving idempotency/reconciliation. No false payment success.
- Motion recaptured from source as CSS transitions/entrance and route stroke
  animation (supports prefers-reduced-motion); no third-party motion dependency.
- Required E2E: zero mounted legacy .b-* UI in /visual-v32 customer pages;
  functional cart; checkout has no payment side effects, responsive and no
  cross-route escape. All screenshots must be reviewed against ZIP REF_A/B/C/D.
