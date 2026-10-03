# Closure screenshot index

Fresh local mock-only captures, 2026-10-03. Widths are CSS viewport pixels. No real customers, charges or provider calls. Images are intentionally ignored local artifacts; preserve/export this directory when moving machines.

| Page |390px|768px|1440px|
|---|---|---|---|
|Homepage|[390](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/homepage-390.png)|[768](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/homepage-768.png)|[1440](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/homepage-1440.png)|
|Menu|[390](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/menu-390.png)|[768](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/menu-768.png)|[1440](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/menu-1440.png)|
|Product selections|[390](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/product-390.png)|[768](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/product-768.png)|[1440](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/product-1440.png)|
|Cart|[390](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/cart-390.png)|[768](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/cart-768.png)|[1440](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/cart-1440.png)|
|Checkout|[390](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/checkout-390.png)|[768](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/checkout-768.png)|[1440](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/checkout-1440.png)|
|How to Order|[390](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/how-to-order-390.png)|[768](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/how-to-order-768.png)|[1440](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/how-to-order-1440.png)|
|RTL menu|[390](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/rtl-menu-390.png)|[768](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/rtl-menu-768.png)|[1440](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/rtl-menu-1440.png)|
|Customer tracking|[390](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/tracking-390.png)|—|[1440](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/tracking-1440.png)|
|Coverage rejection|[390](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/coverage-rejected-390.png)|—|[1440](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/coverage-rejected-1440.png)|

Product capture shows the real inline family/variant presentation; no invented product-detail route. Tracking and dashboard show the same synthetic persisted order. All required mobile/desktop pages were manually reviewed.

## Reference comparison evidence

Left: reference. Right: current local implementation. Official font/accessibility/checkout differences are documented in design-qa.md.

|Section|390px|768px|1440px|
|---|---|---|---|
|hero|[390](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-hero-390.png)|[768](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-hero-768.png)|[1440](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-hero-1440.png)|
|bridge|[390](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-bridge-390.png)|[768](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-bridge-768.png)|[1440](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-bridge-1440.png)|
|featured|[390](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-featured-390.png)|[768](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-featured-768.png)|[1440](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-featured-1440.png)|
|tradition|[390](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-tradition-390.png)|[768](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-tradition-768.png)|[1440](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-tradition-1440.png)|
|family|[390](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-family-390.png)|[768](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-family-768.png)|[1440](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/compare-family-1440.png)|

[Saved variant dashboard](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/variant-dashboard-1440.png)

[Full reference 390px](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/reference-full-390.png)
[Full reference 768px](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/reference-full-768.png)
[Full reference 1440px](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/reference-full-1440.png)

[Mobile homepage preview](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/homepage-preview-390.png)
[Desktop homepage preview](/Users/rodrigom./code/tres-leches-demo/work/qa/closure/homepage-preview-1440.png)

## Non-Google closure pass — final reference comparison

Fresh in-app-browser captures, 390/768/1440, with image/reveal loading. Left reference / right current implementation. Mobile hero crop and logo adjusted; public cart remains web checkout. Other closure page screenshots above were regenerated by the final 12-scenario local run. No live Google QA.

|Width|Comparison|Full local|
|---|---|---|
|390|[Compare](/Users/rodrigom./code/tres-leches-demo/work/qa/non-google/compare-390.png)|[Homepage](/Users/rodrigom./code/tres-leches-demo/work/qa/non-google/local-390.png)|
|768|[Compare](/Users/rodrigom./code/tres-leches-demo/work/qa/non-google/compare-768.png)|[Homepage](/Users/rodrigom./code/tres-leches-demo/work/qa/non-google/local-768.png)|
|1440|[Compare](/Users/rodrigom./code/tres-leches-demo/work/qa/non-google/compare-1440.png)|[Homepage](/Users/rodrigom./code/tres-leches-demo/work/qa/non-google/local-1440.png)|

Flow health: (1) home/reference composition reviewed; (2) menu/variants pass; (3) cart/clear/floating pass; (4) mocked verified delivery, minimum/schedule and unavailable/pickup pass; (5) saved order/dashboard/customer tracking pass. DOM keyboard, axe, overflow and console tests supplement screenshots. Remaining differences are the approved corporate fonts, accessible contrast, ecommerce cart/support separation and functional footer; reference placeholders/autoplay are not copied.
