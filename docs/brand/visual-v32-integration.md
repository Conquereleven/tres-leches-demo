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
