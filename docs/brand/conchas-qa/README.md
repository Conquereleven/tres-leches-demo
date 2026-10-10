# Conchas integration — local QA evidence

Branch: `feature/3l-conchas-official-image-integration`
Base: `d7b141a5a2f19c080e6dce558cee2c8330c22fed`

## Validation

| Gate | Result |
| --- | --- |
| Typecheck / lint / build | Passed |
| Commerce unit/integration/payment suite | 445 / 445 |
| Preserved Sites tests | 4 / 4 |
| Conchas + shared Pan comparison Chromium / WebKit, 390 / 768 / 1440, EN / ES / AR | 28 / 28 |
| Existing checkout Chromium, independent fixture DB | 19 / 19 |
| Existing checkout WebKit, independent fixture DB | 19 / 19 |
| Source hashes | 4 originals + 24 derivatives verified |
| Secret scan | 0 findings |
| npm audit | 0 vulnerabilities |
| Axe product/options EN / ES / AR | 0 violations |
| Browser page errors, RTL and overflow | Passed |
| AVIF → WebP → existing family image fallback | Passed in both engines |

All browser runs used offline local provider fixtures and disposable test databases. No LIVE/TEST provider network call, production data mutation or production deployment was performed. The canonical checkout suite is executed separately per engine so public order-number counters start at the same fixture baseline. An initial `--browser=all` invocation included unavailable Firefox and shared counters between engines; the independent Chromium/WebKit runs above are the final evidence. No checkout test or payment behavior was changed to pass these checks.

Catalog/menu data and all `server/`, `shared/` and PaymentFrame files are byte-identical to the base. The single `Shop.tsx` change passes the existing fallback image into the shared thumbnail renderer; it does not alter checkout requests or calculations.

## Visual comparison

Full-page screenshots, local approved catalog fixture. Menu has only the four released Concha presentation products; Vanilla, Traditional Pistache and Tricolor appear only in the category gallery and are never offered as products. All public provenance labels were removed by Joel’s priority update. Mobile checkout has its existing order-summary drawer expanded to reveal the thumbnail. Product size selectors are also exercised independently of these captures.

| View | Before | After |
| --- | --- | --- |
| Menu 390px | ![Before menu 390](before/menu-390.png) | ![After menu 390](after/menu-390.png) |
| Product 390px | ![Before product 390](before/product-390.png) | ![After product 390](after/product-390.png) |
| Cart 390px | ![Before cart 390](before/cart-390.png) | ![After cart 390](after/cart-390.png) |
| Checkout 390px | ![Before checkout 390](before/checkout-390.png) | ![After checkout 390](after/checkout-390.png) |
| Menu 1440px | ![Before menu 1440](before/menu-1440.png) | ![After menu 1440](after/menu-1440.png) |
| Product 1440px | ![Before product 1440](before/product-1440.png) | ![After product 1440](after/product-1440.png) |
| Cart 1440px | ![Before cart 1440](before/cart-1440.png) | ![After cart 1440](after/cart-1440.png) |
| Checkout 1440px | ![Before checkout 1440](before/checkout-1440.png) | ![After checkout 1440](after/checkout-1440.png) |

## Pan de Muerto reference vs Conchas

Identical components and computed banner ratio/margins, card ratio/radius, image containment, grid gaps and transition timings at each breakpoint. Rotation, focus pause and reduced-motion behavior validated in Chromium/WebKit.

| Width | Pan de Muerto reference | Conchas |
| --- | --- | --- |
| 390px | ![Pan 390](after/reference-pan-390.png) | ![Conchas 390](after/reference-conchas-390.png) |
| 768px | ![Pan 768](after/reference-pan-768.png) | ![Conchas 768](after/reference-conchas-768.png) |
| 1440px | ![Pan 1440](after/reference-pan-1440.png) | ![Conchas 1440](after/reference-conchas-1440.png) |

[Exact file list](changed-files.txt). Original checkout tests are unchanged; the prior Pan-only gallery assertions now allow the explicitly approved Conchas editorial gallery.
