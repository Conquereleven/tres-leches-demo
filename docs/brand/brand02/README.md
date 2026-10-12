# BRAND-02 — Storefront Visual Integration & Conchas Media Refresh

**GO for review of the visual/structural integration.**
**Media status: AWAITING FOUNDER-APPROVED IMAGES.**
The final replacement media batch is not completed or approved by this PR.
Current images remain usable as interim assets while the founder supplies new
sources. No new food images were generated, sourced or invented.

## Baseline and integration contract

Main: `5d47c9d09b629bec73d47b34026848ca9ccca72a` (verified 12 October 2026).
Branch: `feature/3l-brand-v2-conchas-media`, separate worktree of the canonical
`~/code/tres-leches-demo` Git repository.

PR #6 source: `14484ab0eef21c64732ea744c31eb3f6761839c3`.
Scoped port: product/category manifests, versioned square derivatives and prior
independent editorial derivatives, source originals/hash index, responsive media
presentation check, transformation script and Conchas regressions. Historical
`conchas-final-approved` records retain their original provenance and have an
explicit current interim-status notice. Existing seven product/source identities
remain intact; their prior artwork is not declared final for the new batch.

PR #8 source: `bda10c35ee33f042e412b656b4f16b79c548b9ea`.
Scoped port: public brand/storefront/checkout CSS and palette QA. Palette is
blush #F6DFE0 dominant, white surfaces, graphite #27242D text and raspberry
#A93C68 buttons. Tokens are scoped to brand containers; global and Operations
styles are unchanged. Gold remains existing official/decorative artwork.
Older PR screenshot reports were reviewed as source evidence; current before/
after evidence is captured again against this baseline.

## Deliberate overlap resolution

Both PRs touch the category showcase rule in `storefront.css`. The combined rule
keeps PR #6's shared panel radius and PR #8's white background, retaining 3:2
banner ratio, size, margin and rotation behavior. Square 1:1 product frames keep
contain fit and the common Pan de Muerto component; no category-specific override
or layout redesign is introduced. Geometry/font/motion declaration regression
compares current main plus that approved showcase radius addition.

`AGENTS.md` preserves main's Operations D1 instructions and appends the current
public V2 palette/structure and pending-media decision. No older branch version
replaces the current Operations instructions. Imported color QA now references
current main for the untouched Operations/global-theme assertions.

A file-transfer issue with Git-quoted accented filenames was caught by media
hash tests and browser console 404 checks, then fixed using NUL-delimited Git
paths and exact UTF-8 source paths. After rebuilding the bundle, the affected
checks were rerun. There is no server/static-routing or payment fix in this PR.

## Replacement handoff

[`replacement-manifest.json`](replacement-manifest.json) covers seven exact
product identities, their variants and all canonical SKU/size identifiers, plus
three independent editorial sources. Each row includes current derivative paths,
source identity/dimensions, required replacement filename, target/source minimum
size, formats, quality, proportional transformation, alt/fallback guidance and
placement. Prices are never supplied by this media specification.

| Product presentation | Required source | Target |
| --- | --- | --- |
| Traditional chocolate | `conchas-traditional--chocolate.png` | 2048 × 2048, 1:1 |
| Traditional vanilla | `conchas-traditional--vainilla.png` | 2048 × 2048, 1:1 |
| Traditional pistachio | `conchas-traditional--pistache.png` | 2048 × 2048, 1:1 |
| Traditional tricolor | `conchas-traditional--tricolor.png` | 2048 × 2048, 1:1 |
| Filled pistachio | `conchas-filled--pistache.png` | 2048 × 2048, 1:1 |
| Traditional pack | `conchas-traditional-pack.png` | 2048 × 2048, 1:1 |
| Filled pack | `conchas-filled-pack.png` | 2048 × 2048, 1:1 |
| Opening gallery frames 1–3 | `conchas-editorial-1.png` … `conchas-editorial-3.png` | 2100 × 1400, 3:2 |

Product source minimum: 960 × 960. Gallery source minimum: 1440 × 960.
Existing editorial originals are 4:3 and remain contained in the approved 3:2
frame. New framing is a source brief, not permission to crop existing artwork.
Do not invent pack assortment rules or depict a specific filling under a
traditional product. Ambiguous imagery needs review before assignment.

A media-only follow-up must:

1. Receive founder approval of source bytes and exact product/editorial identity.
   Store originals and SHA-256/approval evidence in a new dated source batch,
   preserving current originals unchanged. Do not relabel old files as new approval.
2. Auto-orient, convert to sRGB/RGB and resize proportionally with Lanczos,
   without upscaling, cropping, stretching or generating background/food content.
   Encode AVIF quality 65 and WebP quality 82 at 320/640/960px widths.
3. Keep `sourceId`, product IDs and SKU IDs stable. Use derivative filenames with
   a source SHA-256 prefix/version, then update derivative references, dimensions,
   byte counts and approval evidence only. Paths must change when bytes change so
   caches cannot serve a superseded picture. Existing `square-v2` paths stay intact.
4. Keep gallery source IDs and ordering independent of product assignments. A new
   square product source must not automatically replace an editorial frame.
5. Use existing EN/ES/AR product/category alt labels and neutral family fallback;
   no new ingredients, flavour, pack mixture or photography claims. Validate
   AVIF→WebP→family fallback, mobile/desktop contain fit and no broken paths.
6. Re-run identity, price/availability, gallery/rotation, cart and checkout
   regressions. No server, pricing, SKU, availability or checkout edit is needed.

Runtime `status: assigned` remains the existing technical mapping flag so interim
images continue resolving. `replacementStatus` explicitly marks the pending new
approval; it does not change commercial availability or add customer-facing badges.

## QA and responsive evidence

See `before/`, `after/` and `evidence/`. Captures cover home, Conchas category,
product detail, cart, checkout and mocked return at 390/768/1440px. EN/ES/AR and
Arabic RTL are exercised in both engines. Current source colors and square
framing were visually inspected; shared gallery/card geometry is measured by the
Conchas suite. Reduced motion, rotation pause, all seven cards/row alignment,
variant images, asset fallback, keyboard and accessibility remain covered.

Final required QA:

| Check | Result |
| --- | --- |
| Typecheck / lint / build + content audits | PASS |
| Full commerce unit/integration/HTTP | 494 passed, zero failed/skipped |
| Conchas Chromium + WebKit | 52 passed |
| Hosted checkout Chromium / WebKit | 19 / 19 passed |
| Before responsive capture, Chromium | 9 passed |
| After responsive EN/ES/AR + WCAG, Chromium / WebKit | 9 / 9 passed (54 page checks per engine) |
| Editorial motion/palette Chromium / WebKit | 28 / 28 passed |
| Sites packaging | 4 passed |
| npm audit | 0 vulnerabilities at all severities |
| Secret scan | 1223 files in final report/source scan, zero heuristic findings |

Accessibility checks use axe WCAG 2 A/AA and 2.1 AA tags; automated results do not
replace manual assistive-technology testing. Existing build chunk-size and
pending-business-information warnings remain. All protected runtime/commercial
paths have an empty diff against main. Screenshot index: [comparison](screenshots.md). No real provider call
or card submission is performed by these fixtures. Return screenshots use a
mocked historical confirmed checkout, not a new live payment.

## Preserved boundaries and remaining gate

Commercial catalog, SKU/price/availability/seasonality data and public menu
translations are byte-identical to the baseline. Customer checkout/cart code,
server/payment adapters, Product Hub backend, Operations theme/login/permissions/
tickets, Railway configuration and dependencies are unchanged. Existing PRs and
uncommitted Conchas work were not edited. Coordination with other agents is via
this PR contract; media fields are metadata and must not become a pricing source.
A future Product Hub publication should version these media-reference changes
through its own approved catalogFoundation publication path. This public-media
port does not update or activate stored backend metadata or CRUD.

Final media refresh remains blocked on founder-supplied, founder-approved files.
That does not block review of the functioning structural/color integration.
No Production database access, merge or deployment is included. Rollback is a
code/media-reference revert retaining the original asset files; no data migration
or restoration of customer/payment records is involved.
