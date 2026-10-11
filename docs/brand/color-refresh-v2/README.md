# 3L Visual Identity V2 — Blush Color Refresh

Founder correction (11 October): blush is the dominant canvas, with white details and secondary surfaces. This supersedes the initial white-base V2 proposal.

Color-only changes from main `e2a82387549d5861e110178d6b9c8b8ae7f84f10`.
PR #6 inspected: `14484ab0eef21c64732ea744c31eb3f6761839c3`; PR #7 inspected: `b65be4915327f74ef54325bf7793bc15f54596da`. Both remain separate/open; neither was incorporated. Canonical branch/stash and the uncommitted filled-Conchas collection were preserved. Isolated branch `feature/3l-visual-identity-color-refresh-v2`.

Reference: https://tres-leches-dubai-express.lovable.app/#top (visually inspected). Only approved colour direction was used; no layout, copy or WhatsApp ordering implementation was copied.

## Design diff

| Component | Before | V2 | Layout changed? |
|---|---|---|---|
| Public canvas/header/menu | cream #F6EFE3 / #F8F4ED | blush #F6DFE0 | No |
| Forms/media frames/editorial detail panels | cream/beige | white #FFFFFF | No |
| Primary text | brown #33241A / #372C27 / #2B1B16 | graphite #27242D | No |
| Secondary text | brown #735A40 / #66554B / #715E54 | #605660 | No |
| Primary CTA | brown #805B36 / text-primary | raspberry #A93C68, white text | No |
| Secondary CTA | transparent, brown text | white, raspberry text/border | No |
| Selected controls/filters | blush with gold outline | blush with raspberry indicator | No |
| Neutral secondary panels | beige #EEE7DB / #E9DFCD | soft petal #FBEFF3 | No |
| Footer | dark brown #2B1B16 | white with graphite text | No |
| Shadows/video overlays | brown RGB + alpha | graphite RGB, original alpha | No |
| Checkout done/checkmark/focus | gold, sometimes white text | raspberry, AA contrast | No |
| Operations | TL-27 global/scoped palette | identical | No |

132 declarations changed; exact replacements are in [audit.json](audit.json). Seven V2 tokens are scoped to `.brand-experience`, `.b-modal`, `.b-return`; existing public aliases resolve to them. `src/styles.css` and `src/commerce/operations-shell.css` remain byte-identical. A public-only `:has(.brand-experience)` rule colours browser gutters blush; no route or JSX change is needed.

Gold remains only official artwork or restrained decoration (route/pencil/rules); it is not used for new small UI text. Dusty rose is available as a decorative token, not normal text. Functional danger/success colours are retained. No legacy cream/brown UI colour literal remains in the three public stylesheets. Global legacy tokens remain solely to preserve Operations; approved photographs, film frames and artwork retain their original colours.

## Before/after evidence

60 equivalent states, same data/locale/viewport/reduced-motion capture settings:
- 390 / 768 / 1440 px; English home, catalog, category/filter, product, cart, fulfillment, details, review, form error, confirmed/failed return, privacy, native menu modal, Operations.
- Spanish and Arabic RTL home/category/fulfillment at each width.
- Lazy images are loaded by scrolling before capture. All media references, crops, aspect ratios and geometry are unchanged.
- Full-page JPEG captures: [before](before/) / [after](after/). JPEG originals and full computed-geometry evidence remain in local `work/qa/color-refresh-v2/`.
- Preview comparisons show the first 900px; full captures cover editorial sections and footer.

| Width | Home | Catalog category | Product | Cart | Checkout | Confirmation | Modal |
|---|---|---|---|---|---|---|---|
| 390px | [home](compare-home-390.webp) | [category](compare-category-390.webp) | [product](compare-product-390.webp) | [cart](compare-cart-390.webp) | [checkout](compare-checkout-390.webp) | [confirmation](compare-confirmation-390.webp) | [modal](compare-modal-390.webp) |
| 768px | [home](compare-home-768.webp) | [category](compare-category-768.webp) | [product](compare-product-768.webp) | [cart](compare-cart-768.webp) | [checkout](compare-checkout-768.webp) | [confirmation](compare-confirmation-768.webp) | [modal](compare-modal-768.webp) |
| 1440px | [home](compare-home-1440.webp) | [category](compare-category-1440.webp) | [product](compare-product-1440.webp) | [cart](compare-cart-1440.webp) | [checkout](compare-checkout-1440.webp) | [confirmation](compare-confirmation-1440.webp) | [modal](compare-modal-1440.webp) |

All 60 computed geometry/style/media snapshots match exactly (dimensions, positions, font/line height, padding/margin, border radius, object fit, aspect ratio, transforms and animation/transition durations). The three authenticated Operations fixtures also retain every computed colour/shadow. Motion hooks, video logic and assets are untouched; the existing 28-test motion/palette suite passes.

## Accessibility and QA

- Axe WCAG A/AA/2.1 AA: zero violations across 57 public captured states.
- Zero broken images and page errors; no new horizontal overflow.
- Exact contrast ratios: [contrast.json](contrast.json). Graphite/secondary text, white-on-raspberry CTAs, focus/selected states and control boundaries meet normal-text 4.5:1 / UI 3:1 where applicable. Gold and dusty rose are decoration only. Disabled controls preserve existing disabled semantics.
- **Pre-existing limitation:** Contact details has horizontal overflow at all three widths in the baseline and V2 (present before the refresh). Its geometry is identical; this color-only sprint intentionally does not change layout or validation behavior.
- Typecheck, lint, build: pass.
- Commerce: 450 passed, zero failed/skipped (447 baseline plus three preservation tests).
- Sites: four passed. Checkout: Chromium 19 / WebKit 19 passed. On the resumed run WebKit initially failed one checkbox interaction (18/19); a complete isolated rerun passed 19/19 without code changes. This transient failure is retained in local QA logs.
- Motion/palette: Chromium 28 passed (includes EN/ES/AR and normal/reduced motion).
- Secret scan: zero findings; npm audit: zero vulnerabilities.
- Build reports pre-existing pending business-information slots and Node experimental localStorage warning; no build failure.

## PR #6 conflict plan and safety

PR #6 overlaps `storefront.css` at the category showcase/background area: it adds the approved radius and image assets/associations. This branch changes only the existing background colour. At eventual integration retain PR #6 geometry, assets, object-fit and rotation logic, and apply V2 colour aliases. Re-run Conchas/Pan parity and color-regression tests after both PRs land. Do not replace whole files or merge either PR here.

No TSX/runtime business files, media assets, catalog/price/SKU data, database, Paymennt, Meta, checkout APIs, delivery/pickup policy, credentials or Production settings changed. No real payments or provider calls. No deployment/merge operation was performed; GitHub workflow validates only. Rollback is a code-only revert of this visual commit; no data restore or configuration change is required. Production remains prohibited for this sprint.
