# Approved Conchas digital artwork

Lisa approved the four supplied digital illustrations; Joel authorized this development/QA sprint on 10 October 2026. These are digitally generated illustrations, not photographs of actual bakery products. This approval supersedes the older approval-pending wording inside the source handoff ZIP. No new artwork was generated, edited or cropped in this sprint.

Only **Traditional Chocolate** is assigned to the existing `conchas-traditional--chocolate` presentation product. Its six square AVIF/WebP derivatives (320/640/960 px) are copied byte-for-byte into `public/brand/approved/`. Original PNGs for all four images are archived here, unchanged. The 18 unassigned derivatives for Vanilla, Traditional Pistache and Tricolor remain outside `public/` and are not shipped in the frontend build. `image-index.json` records source and derivative SHA256 hashes, approved status and paths.

Traditional Pistache must not represent Filled Pistache. Both Concha packs and Filled Pistache retain their released imagery. No new SKUs, assortment rules, availability, prices or editorial gallery were added. The other three assets may support a later explicitly illustrative gallery; they currently have no product assignment.

The existing responsive media pipeline serves Chocolate across menu/product/cart/checkout. Its composition is contained without a crop. A visible EN/ES/AR label discloses digital illustration on menu and product pages; its descriptive alt text also identifies the illustration. AVIF load failures retry WebP; failure of both optimized formats returns to the existing family asset, including cart/checkout thumbnails.

Production, provider configuration, Paymennt code, Meta, Resend, SQLite, catalog and business rules were not modified. No deployment or merge is part of this sprint.
