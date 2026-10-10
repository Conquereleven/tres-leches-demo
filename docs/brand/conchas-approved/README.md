# Approved Conchas digital artwork

Lisa approved the four supplied digital illustrations; Joel authorized this development/QA sprint on 10 October 2026. These are digitally generated illustrations, not photographs of actual bakery products. This approval supersedes the older approval-pending wording inside the source handoff ZIP. No new artwork was generated, edited or cropped in this sprint.

Only **Traditional Chocolate** is assigned to the existing `conchas-traditional--chocolate` presentation product. Its six square AVIF/WebP derivatives (320/640/960 px) are copied byte-for-byte into `public/brand/approved/`. Original PNGs for all four images are archived here, unchanged. The 18 derivatives for Vanilla, Traditional Pistache and Tricolor are retained in the source archive and copied byte-for-byte into `public/brand/approved/` for the category editorial gallery only. `image-index.json` records source and derivative SHA256 hashes, approved status and paths.

Traditional Pistache must not represent Filled Pistache. Both Concha packs and Filled Pistache retain their released imagery. No new SKUs, assortment rules, availability or prices were added. The four assets are category editorial imagery; the other three have no product assignment and no purchase CTA of their own.

The existing responsive media pipeline serves Chocolate across menu/product/cart/checkout. Its composition is contained without a crop. Per Joel’s priority visual update, provenance stays in the internal manifests and this source documentation. The public UI has no digital/AI/concept labels and does not call the assets photographs. Product and category alt text use the existing translated names. AVIF load failures retry WebP; failure of both optimized formats returns to the existing family asset, including cart/checkout thumbnails.

Production, provider configuration, Paymennt code, Meta, Resend, SQLite, catalog and business rules were not modified. No deployment or merge is part of this sprint.

## Shared menu reference architecture

Pan de Muerto is the reference: Conchas reuses `MediaRotation`, `ResponsiveMedia`, `.b-category-showcase` (3:2), square cards, existing radius, spacing, 800 ms crossfade and 3.5 s cadence. Hover/focus/offscreen pause and reduced-motion behavior are shared. Source square compositions are contained, never cropped to fill the 3:2 editorial frame.

`src/brand/category-media.json` is a data-only extension point for future category editorial assets. `presentation: menu-reference` opts assets into the existing Pan presentation classes. No other category is redesigned. Product galleries and rotations resolve the same `productMediaAssignments` registry; a single exact Chocolate asset remains static rather than showing other flavours in its product card/detail. Filled Pistache and packs retain existing images.
