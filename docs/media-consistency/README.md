# 3L-COMMERCE-006 — Published product media

Development/QA only. No merge, deployment, Production catalog/database writes,
provider calls, real orders or email sends were performed for this task.

## Root cause and policy

`src/brand/media.tsx:publishedProductMedia` previously returned `null` both for
bundled mode and an empty published product assignment. It also returned `null`
for a recognized authored primary, ignored other non-uploaded assets, and expanded
that result into the current bundled gallery. `selectedProductMedia` and
`productGalleryMedia` consequently resurrected removed or stale library images.
`ResponsiveMedia` could then use its caller's bundled family fallback.
`src/brand/Shop.tsx:Thumb` had another independent collections/family fallback.
The list in `src/commerce/ProductHub.tsx:Overview` used only product-level media,
so its empty thumbnail disagreed with the storefront.

The shared resolver now distinguishes bundled (`null`) from authoritative empty
(`[]`). In dynamic mode, ordered **product.media** links alone select product
imagery. Primary precedes gallery, then order, then a stable asset-ID tie-breaker.
Published derivatives and version identity are preserved, including approved
library assets; an authored gallery is never implicitly appended. An empty,
unknown or loading product gets no bundled fallback. Product-level empty takes
precedence over legacy variant-media links, matching the editor's removal action;
these legacy links and their assets are retained, not deleted or republished.

Cards, detail gallery, cart and checkout thumbnails share that policy. `Thumb`
subscribes directly to live revisions so an already-open cart updates its image.
Homepage named-product features now pass their canonical product IDs; category and story previews explicitly opt into editorial media. The existing 60-second ETag revalidation and focus/resume refresh remain intact.
Drafts remain private. No new endpoint, schema, publication or cache bypass is
introduced. The dynamic HTML response also replaces only renderer-marked bundled product photographs with neutral placeholders before JavaScript runs (`server/catalog/product-media-html.ts`, invoked by the existing `markDynamicCatalog`). Editorial HTML and the static response path are unchanged. A failed assigned image displays a neutral 3L placeholder with
`data-media-state="load-error"`; empty assignments use the normal no-photo state.
A replacement remounts the image by its published asset/version, clearing failure
state. Responsive derivatives and approved presentation metadata are retained.

Static mode retains its bundled assets and existing intentional Tricolor neutral
presentation. Category editorial rotation is separate (`categoryEditorialMedia`)
and unaffected by product removal or replacement. Historical files remain stored.

## Confirmed Production exposure

Read-only public revision: `catalog-v1-63d2f003c1f1724d474e3854ad246208dcd03f41987b9eff0d62449bf0f6f05e`.

The three reported examples all have empty product media:

| Product | Product links | Legacy variant links |
|---|---:|---:|
| `conchas-traditional--tricolor` | 0 | 0 |
| `conchas-filled--pistache` | 0 | 2 variants retain links |
| `conchas-filled-pack` | 0 | 4 variants retain links |

The existing special case already suppressed the Tricolor photo in the released
code, but it did not fix the generic fallback for the other products. The new
fixed Tricolor pack also has no assigned product photograph, as intended.

Other currently empty product assignments (which must also remain neutral):
`carrot-cake`, `cheesecake`, `jelly-gelatina-fruits`,
`jelly-gelatina-dulce-de-leche`, `orejas`, `bisquets`, `croissant--plain`,
`croissant--chocolate`, `croissant--pistacchio`, `croissant--cherry`,
`croissant--integral`, `cubilete--cream`, `cubilete--cheese`, `rosca-de-reyes`.
This policy can affect any future product or gallery removal, not only Conchas.
Assigning photographs to these products is a separate administrator publication;
this PR neither assigns photographs nor reconstructs assets.

## Metadata

The shared `conchas-traditional` family is stored with the chocolate product's
name. Vanilla, Pistachio and Tricolor correctly reference that same family ID;
using its name as their listing subtitle misleadingly described them as chocolate.
The list now shows the existing category and each product's distinct stored sizes
(`productListingSizes`), while its title and editable family relationship remain
unchanged. Chocolate/Vanilla/Pistachio/Tricolor show Mini 40 g and Individual 70 g;
filled Pistachio shows Mini/Individual; packs show their actual piece counts.
No translation, ingredients, description or commercial classification was invented.

**Data issue retained:** the shared family name itself still says chocolate.
Renaming it to an approved neutral family label would require a separately approved
Product Hub family draft/review/publication against the then-current revision.
No such Production correction is executed here. The public product titles continue
using published EN/ES/AR content, not a family-based reconstruction.

## Production release verification (read-only)

- Railway deployment `836c40b0-4145-4b65-a25f-095dfe506564`: SUCCESS, 1/1 replica,
  zero issues, no staged changes. Deployment metadata and the container's
  `RAILWAY_GIT_COMMIT_SHA` confirmed `33fb371db6a96f709c4d0d427ff547ce240a15bd`.
- Public catalog revision remains `63d2f003c1f1`; SQLite contained 238 SKUs.
- All four Tricolor SKUs are orderable and agree with checkout config:
  Mini single AED 11; Individual single AED 13; 3-mini pack AED 33;
  3-individual pack AED 39. Latest HTTP evidence is in
  [production-public-check.json](production-public-check.json).
- **Known observability gap:** health is HTTP 200/ok but reports old
  `a75a0fa1637f4511ed0237e2b4fff621489e619a` from stale `BUILD_SOURCE_SHA`.
  No variable is changed. Do not use this field as proof of the deployed SHA.
- On 18 October, read-only SQLite integrity checks passed for both live DB and
  `/data/backups/tricolor-2026-10-18T12-12-35-010Z/pre-release.sqlite`.
  The private `pre-publication.sqlite` backup also existed. Persisted
  `rehearsal-result.json`, `publication-result.json` and `final-verification.json`
  were inspected: the isolated restore/publication rehearsal read all 13 historical
  order/payment snapshots with zero failures. The final verification preserved all
  236 pre-existing catalog rows and protected state.
- This task's 18 October comparison hashed full orders and payments against the
  backup: **13 orders and 13 payments identical**, including recorded amounts.
  No customer data or database file was exported to this repository.
- **Freshness limitation:** after the interrupted session resumed on 19 October,
  SSH could no longer offer the unlocked key (`no-ssh-key-offered`). Public HTTP and
  Railway health were rechecked successfully; historical SQLite equality was not
  re-verified after that interruption. Restore/readability evidence above is from
  the successful 18 October audit, not a newly claimed 19 October restoration.

## QA evidence

All fixtures are local and synthetic. Screenshots demonstrate assigned → removed →
replaced media on the same build; fixture replacements are **not commercial image
approvals**. The publication test also uploads, publishes, removes and republishes
through the real editor/API against disposable SQLite. No live provider transport.

- Typecheck, lint, production build and original Sites worker checks.
- 667 unit/integration tests: commerce, prices, Foundation, Product Hub, historical
  snapshots, preparation, kitchen email, provider reconciliation/idempotency.
- Dynamic storefront: 32 Chromium/WebKit scenarios; EN/ES/AR, 390/768/1440 px,
  product cards/detail/cart/checkout, homepage before and after JavaScript, inactive failed gallery frames, actual upload/publication/removal, draft
  privacy, ETags, broken assigned image, metadata subtitles.
- Checkout: 21 Chromium + 21 WebKit scenarios.
- Product Hub: 8 Chromium/WebKit scenarios, including responsive axe coverage.
- Static official-media: 10/10 Chromium/WebKit scenarios at 390/768/1024/1440/1920 px; final build rechecked at 390 px in both engines (2/2).
- Secret scan: zero findings. Dependency audit: zero vulnerabilities.
- Source catalog, 238 SKU definitions, prices, pack rules and immutable snapshots
  remain unchanged; only media presentation, list subtitle presentation and tests
  are changed. The pre-existing static QA suite is also run independently.

Local detailed logs: `work/qa/media-consistency/logs/` (ignored, no customer data).
The GitHub browser job now includes the dynamic storefront suite.

### Screenshots

| Engine / width | Assigned | Removed | Replacement |
|---|---|---|---|
| Chromium 390 | [Before](screenshots/chromium-390-before.png) | [Empty](screenshots/chromium-390-removed.png) | [New image](screenshots/chromium-390-replacement.png) |
| Chromium 768 | [Before](screenshots/chromium-768-before.png) | [Empty](screenshots/chromium-768-removed.png) | [New image](screenshots/chromium-768-replacement.png) |
| Chromium 1440 | [Before](screenshots/chromium-1440-before.png) | [Empty](screenshots/chromium-1440-removed.png) | [New image](screenshots/chromium-1440-replacement.png) |
| WebKit 390 | [Before](screenshots/webkit-390-before.png) | [Empty](screenshots/webkit-390-removed.png) | [New image](screenshots/webkit-390-replacement.png) |
| WebKit 768 | [Before](screenshots/webkit-768-before.png) | [Empty](screenshots/webkit-768-removed.png) | [New image](screenshots/webkit-768-replacement.png) |
| WebKit 1440 | [Before](screenshots/webkit-1440-before.png) | [Empty](screenshots/webkit-1440-removed.png) | [New image](screenshots/webkit-1440-replacement.png) |

[Operations Chromium](screenshots/chromium-operations-subtitles.png) ·
[Operations WebKit](screenshots/webkit-operations-subtitles.png).

## Release and rollback

Recommendation: review the focused code PR; no commercial migration is needed to
honor currently empty assignments. Deployment remains separately authorized only.
Before a future deployment: refresh main/CI, unlock SSH if needed, rerun the current
read-only SQLite/catalog preflight and retain the existing recoverable backup.
Confirm expected photo placeholders (including other deliberately empty products),
unchanged 11/13/33/39 prices and gallery behavior in a controlled release.

After an authorized code-only release, exercise assigned/replaced/removed images
using a private UAT draft and explicitly approved publication, checking cards,
detail, cart, checkout and current revision. Do not publish a synthetic commercial
edit or resend historical notifications. No feature flag change is required.

Rollback is code-only to the last validated build, retaining live SQLite, catalog
revision, assets and all new transactions. Never restore the historical DB to roll
back this UI change. That old code can resurrect removed photos; record that
known limitation if rollback is necessary. Any metadata renaming or new image
assignment is a separate Product Hub publication, not part of rollback.

## Changed code and tests

- `src/brand/media.tsx`: authoritative resolution, presentation and error handling.
- `src/brand/MenuCatalog.tsx`, `Shop.tsx`: remove bypass fallbacks, shared gallery and live cart thumbnails.
- `src/brand/Experience.tsx`, `StorefrontGuide.tsx`, `primitives.tsx`: explicit product versus editorial identities.
- `server/http.ts`, `server/catalog/product-media-html.ts`: dynamic HTML media boundary only; no route/auth changes.
- `src/commerce/ProductHub.tsx`, `product-hub-presentation.ts`: category/size listing subtitle.
- `tests/commerce/published-media.test.ts`, `tests/storefront-dynamic-e2e/{media,publish}.spec.ts`: regression coverage.
- `.github/workflows/personalized-packs.yml`: run the dynamic suite with existing local-fixture browser checks.
- This report, public-only preflight evidence and synthetic screenshots.
