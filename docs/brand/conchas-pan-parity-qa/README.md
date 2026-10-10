# Conchas — exact Pan de Muerto presentation

Joel's final correction supersedes the earlier horizontal product-card request.
Conchas now uses the actual Pan de Muerto design, without its own frame rules:

- square product cards and details; shared 20px panel radius, cream and contain fit;
- the shared 3:2 opening gallery, with the three previous horizontal Conchas images;
- identical grid, spacing, title/selector styling and MediaRotation crossfade,
  hover/focus pause and reduced-motion behavior;
- the existing square cart/checkout thumbnails, with their shared 12px radius.

The four traditional image assignments are unchanged. The three new square
originals supplied by Joel replace product imagery only, retaining product/source
identifiers. The earlier horizontal images remain in the opening gallery as
independent editorial assets. Square product sources fill the frames like Tricolor,
without internal letterbox bands. No cropping, stretching or public provenance badges.

## Comparison and journey captures

| Width | Pan reference | Conchas reference | All seven Conchas | Cart | Checkout |
| --- | --- | --- | --- | --- | --- |
| 390 | [Pan](reference-pan-390.png) | [Conchas](reference-conchas-390.png) | [Seven](seven-cards-390.png) | [Cart](seven-cart-390.png) | [Checkout](seven-checkout-390.png) |
| 768 | [Pan](reference-pan-768.png) | [Conchas](reference-conchas-768.png) | [Seven](seven-cards-768.png) | [Cart](seven-cart-768.png) | [Checkout](seven-checkout-768.png) |
| 1440 | [Pan](reference-pan-1440.png) | [Conchas](reference-conchas-1440.png) | [Seven](seven-cards-1440.png) | [Cart](seven-cart-1440.png) | [Checkout](seven-checkout-1440.png) |

Browser assertions compare computed Pan and Conchas styles directly, including
actual frame/image dimensions, radius, backgrounds, spacing, selector height and
transitions. All seven frames are measured for equal heights and aligned rows;
each product detail, cart and checkout is checked. Per-card measurements are in
`geometry-{chromium,webkit}-{390,768,1440}.json`.

The test suite covers EN/ES/AR and RTL, image fallbacks, loading, accessibility and
console errors. All checkout tests use disposable local mock fixtures, never
real provider calls. Validation: typecheck/lint/build passed, 449/449 commercial/unit/HTTP tests,
4/4 Sites tests, 52/52 Conchas Playwright tests and 38/38 checkout regressions.
Audit: zero vulnerabilities. Secret scan: zero findings. Final comparison captures
are repeated separately for both engines after isolating fixed screenshot overlays.
Product-detail captures for the three new artworks are also included at all widths.

No catalog, pricing, availability, delivery rules, payment/provider logic,
backend, SQLite or Production changes. No merge or deployment.
