# Kitchen email visual QA

- Source visual: `/Users/rodrigom./Downloads/Confirmación de pedido Tres Leches (1).png`,941×1672 pixels. Source has iOS status chrome; app-owned email starts below approximately69 source pixels. Normalize source body to390 CSS px (scale390/941). No status bar is reproduced.
- Implementation: `docs/email/previews/product-first-three-webkit-390.png` and `product-first-typical-webkit-390.png`,390 CSS px at device scale1. Both were opened alongside the source in the same comparison input. Actual HTML, no manual mockup.
- Live local preview: `http://127.0.0.1:3394/compact-three.html`, opened and inspected in the in-app browser. No sending. Mobile matrix also uses Chromium/WebKit at320/375/390/430 and desktop1024.
- State differs intentionally: accepted synthetic order#042, three actual fixture lines versus illustrative source order. No source personal data or amounts copied. The implementation includes real operational warnings/notes absent from the source; full heights therefore differ.

## Comparison iterations

1. Previous proposal: P1 sans-serif compact brief, small left header and unframed table materially differed from the supplied reference. Fixed with centered pink wordmark block, serif heading/body, rounded bordered summary, uppercase spaced column labels, gold rules/total and paired lower panels.
2. First reference capture: P2 price wrapping and contact/address density. Fixed price column width and no-wrap individual price, preserved exact line/box amounts. Contact text now has a compact system-sans fallback; exact duplicate structured address values are shown once in the full address. Conflicting/missing values remain explicit, with regressions for partial-match conflicts.
3. Reopened source and revised390px browser captures together. Reviewed main composition and focused header, product/price and lower information regions. No remaining actionable P0/P1/P2 differences within the requested email format.

## Five fidelity surfaces

- Typography: Georgia/Times serif for New Order, products and totals; system sans uppercase labels.32px title,18px product names. No unsupported web font dependence. Source is a raster mock, so exact font rasterization is not claimed.
- Layout: pink centered header, rounded classic table and divided rows; aligned quantity/price columns; total on the right; schedule/address/contact below. Complete safety notes are an additional panel before secondary information. Full names/compositions can wrap and extend height.
- Color: approved#F6DFE0 and#A28D5B rules with accessible darker gold/ink on a warm neutral canvas. Axe passes in both engines. Source gradient/texture is not recreated; email-compatible solid fills preserve the requested palette.
- Assets: no product images. Decorative bow/contact icons are omitted rather than substituted with emoji/handmade SVG or new remote image dependencies. Wordmark is real editable text; no fake iOS chrome. This is a P3 decorative difference, not a claim of pixel-perfect duplication.
- Copy/data: accepted fixture products, quantities, prices, contacts and frozen preparation only. Paid status remains from the existing guarded event. No invented Card method or order-created date; the visible date is the stored fulfillment date and is labeled as such. All original warnings/notes preserved.

## Checks / remaining gaps

Responsive Chromium/WebKit, no horizontal overflow, zero axe violations, HTML escaping, no external render requests and actual authenticated OMS URL are tested. The link remains44px high. Delivery/pickup, multiple boxes, distinct same-SKU mixtures, long notes and missing snapshots remain covered. No real customer/provider action. Native Gmail/Apple Mail UAT and exact native usable height remain PENDING, not certified by screenshots.

## Follow-up polish

P3: decorative bow/icons would require separately approved email-safe assets/hosting; none were fabricated. Native font rendering may differ. No transport or provider changes are part of this visual correction.

final result: passed
