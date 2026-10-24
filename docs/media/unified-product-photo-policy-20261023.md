# 3L unified product photography presentation · 2026-10-23

## Existing approved visual contract
- Product cards and product-detail hero/gallery: **1:1 square** with consistent crop and subject center; avoid white or gray side bars.
- Category/editorial galleries: **3:2**. Separate from purchasable product imagery, existing approved gallery rotation remains.
- Photographic assets: `object-fit: cover`. Deliberate digital illustrations and branded fallback icons retain `contain` by media-kind, not product category.
- Product cards display **only the published primary image**, never a rotating gallery. The detail page presents additional published gallery assets separately. This prevents a crossfade from misrepresenting the exact product or pack count.
- Applies to every present/future category using shared `ProductOptions`, `ResponsiveMedia`, media CSS and cart thumbnail, without per-category overrides.
- Uploaded originals remain untouched: rendering presentation handles aspect ratio without regenerating, republishing or duplicating SQLite media. Product Hub's existing square preview is consistent.
- Protect representation: a single Tricolor item must not be pictured by a 3-piece pack; a fixed red/white/green pack needs a photo showing exactly those three pieces. No automated crop can guarantee pack count, so visual acceptance of the two newly assigned photos is required.

## Mantecadas: content dependency, not an image-layout defect
- 2026-10-19 mapping inventoried `M002-032` through `M002-036` (five MANTECADAS JPG originals), but the catalog has **no Mantecadas product**. They were intentionally marked unmatched.
- Original source files are stored outside the repository in the private professional photography handoff. No manufactured placeholder photography or unsupported catalog data.
- Before Product Hub onboarding/publish: approved product/SKU, variants/presentation, AED price, availability, category and exact source JPEGs. Stage image draft, review; **explicit publication authorization** required. No pricing invented.
- Scope of product-media assignment is **only** Tricolor Concha · 1 piece, Tricolor Conchas · Pack of 3, and Mantecadas. Plain Croissant excluded.

## Cost and safety
- This visual patch changes only shared menu/media presentation and a focused existing isolated synthetic E2E assertion. No new infrastructure, dependencies or upload processing; no production catalog write or manual checkout.
- No PR until review; branch push does not activate the PR-only paid GitHub browsers. When authorized, open a **single** targeted PR on the already optimized #57 workflows, inspect exact-head CI once and avoid manual reruns.
