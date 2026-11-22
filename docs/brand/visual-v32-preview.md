# 3L Visual V3.2 - Local interactive preview (Draft PR #83)

Run in isolated worktree feat/3l-v32-commerce-integration-20261122:

    npm ci
    node scripts/preview-visual-v32.mjs

Open http://127.0.0.1:3232/visual-v32, /visual-v32/menu, /visual-v32/bakery.
Inspect 1440x900 desktop and 390x844 / 375x667 mobile; check real variants, cart, checkout without payment.

Script compiles branch, creates synthetic temporary SQLite, uses offline fixture only.
APP_ENV=test, NODE_ENV=test, PROVIDER_MODE=offline, clock frozen Oct 8, 2026.
Never use real customer data, credentials, webhook providers or payment APIs.
Preview is not Production. No deployment or merge authorized.
Canonical approved target: standalone V3.2 ZIP. Repo media differs from the approved visual reference.
Four desktop columns preserved. No custom payment logic.
## Extended Founder GO: connected visual preview (22-Nov-2026)
- Preview-only V3.2 routes: /visual-v32/contact, /cart, /checkout, /checkout/return,
  /how-to-order, /terms, /privacy, /refund-policy and /delivery-policy.
- Shared V3.2 header, customer-facing footer and visual shell. Reuse existing Shop
  and Policy components; preserve checkout validations, price authority, product photos,
  customer information, session recovery and provider boundaries. No custom payment engine.
- Preview-internal link handling remaps existing canonical storefront paths only when
  clicked within V3.2. External links and payment-hosted URLs are never intercepted.
- No current visual sign-off: original standalone V3.2 ZIP refs/assets Cormorant and
  reference photographs are not available in this checkout; visual comparison remains NO-GO.
- CI browser evidence is required at the new SHA. No merge/deploy/Production authorization.

## V3.2 fidelity correction F01/F02 (22-Nov-2026)
- Founder feedback: header navigation should use natural case (Home/Menu/Journal/
  Contact/Cart) and language control must share the vertical centreline.
- Product selector must use approved V3.2 anatomy, including scrollable variant
  section, price and explicit minimum within the scroll body, quantity and single
  CTA in the persistent footer. No legacy after-add recommendations, duplicate
  bottom links, or distorted modal from the existing commercial AddToCart UI.
- `AddToCart.onAdded` is an optional preview-only completion hook. Its absence
  preserves all existing store behavior; when present it closes V3.2 dialog,
  restores product-card focus and exposes an accessible catalog status while
  retaining the canonical cart.add process. No extra payment or price logic.
- Add browser checks for title case, selector alignment, clean after-add,
  canonical cart-count increase, Escape/focus, 320/375/390 short viewports.
- Visual fidelity still awaiting reference source assets and Founder approval.

## Source ZIP recovered and validated, Preview-only asset injection
- Source ZIP: `3L_VisualLab_V3_2_2026-11-22(1).zip`.
  SHA-256 `508d0e624f51242b2eb35a4ab301080028a9687e632204623608b192f7c7bf9b`.
- Original source components inspected: Layout.jsx, ProductPopup.jsx,
  HomePage.jsx, MenuPage.jsx, BakeryPage.jsx and refidelity-v2.css.
- The preview script will, **only in APP_ENV=test**, read the matching ZIP from
  `V32_REFERENCE_ZIP` or recognised Downloads filenames. It extracts five exact
  authored preview-only visual source assets into `dist/client/visual-v32-reference`
  **after** the test build. No image is committed into public/ or main.
- When source ZIP is absent, the preview falls back to already-released media.
  The reference imagery includes screenshots crops and a conceptual bakery photo
  and must NEVER ship as true 3L product photos to Production.
- Verify image parity using the original ZIP assets in preview, then replace
  with true founder-approved source photos before release. The standalone visual
  was approved, **not** this PR candidate.
