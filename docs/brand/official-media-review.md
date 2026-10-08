# Official media — Joel review

Canonical repo: `~/code/tres-leches-demo`. Local branch: `feature/3l-official-pan-media`.
No deployment, provider requests, database/catalog imports, commercial-data or backend changes.

## Reviewed sources

`PAN DE MUERTO PACK.zip`: 50 files, 106,980,074 uncompressed bytes.
27 photos with backgrounds; 23 transparent cutouts. Original uploads are unchanged in Downloads.
Extracted review originals: `/private/tmp/3l-official-pan-sources` (temporary, not deployed).
Every filename, dimensions, transparency and assignment status is inventoried in
`src/brand/official-pan-media.json`. The reproducible offline image helper is
`scripts/prepare-official-pan-media.py`; it uses explicit reviewed assignments only.

## Product mapping

| Existing product | Primary photo | Secondary photos | Evidence |
| --- | --- | --- | --- |
| Azúcar Pan de Muerto tradicional | 08.jpg | None | Intact sugar-coated bread, no filling shown |
| Ajonjolí Pan de Muerto tradicional | 09.png | 06.jpg | Sesame-coated intact bread, two angles |
| Azúcar · Chocolate covering Pan de Muerto tradicional | 12.png | 10.png | Sugar bread with external dark chocolate coating |
| Chocolate Pan de Muerto relleno | 16.jpg | 18.jpg, 29.png | Sliced bread with visible dark chocolate filling |

The imagery represents the flavour/presentation, not a proven weight. Both existing size options retain their unchanged catalog information.
Cards use natural backgrounds and retain the complete photo proportions; galleries show distinct sources.
No mixed tray is assigned to a six/dozen pack: the number of pieces and assortment rules are unconfirmed.

## Awaiting Joel's identity confirmation (42 unpublished files)

- 23 cutouts: every filename containing ` PNG` (including 15 PNG.png, which has no background counterpart).
- Mixed trays/compositions: 01.png, 02.png, 03.png, 04.png, 05.png, 13.png, 22.jpg.
- Green-coated presentations: 07.png, 25.png, 27.jpg. Confirm coating versus filling and exact pistachio SKU.
- Sugar breads with uncertain hidden filling: 11.png, 21.png.
- White cream: 14.png, 23.png, 30.png. Confirm diplomatic cream versus mascarpone/cajeta.
- White cream with red fruit: 17.jpg, 20.jpg, 24.png. Confirm mascarpone/strawberry identity.
- Amber filling: 26.png. Confirm exact filling.

None of these 42 sources are published or used as a fallback for another flavour.

## Desktop video

Source: `d61ef385-902c-400d-a04a-5d0beb899dc4.MP4` (11,000,036 bytes).
Optimized: H.264, 576×1024, full 68.7 seconds, 5,281,415 bytes, fast-start MP4.
Audio removed to prevent any audible autoplay. No story edits, subtitles or branding crops.
Poster: frame at 4 seconds, WebP, 30,306 bytes.

At ≥1024px the existing cream editorial hero presents the portrait video using `object-fit: contain`.
Hero copy, layout, navigation and CTAs are preserved. No material hero-layout redesign was required.
Below 1024px the previous packaging videos and poster remain byte-for-byte unchanged.
Only one source is mounted for the device width. Reduced motion, save-data and slow connections keep the poster;
the existing explicit play control remains available. A failed decode also leaves a usable poster.

## Photo optimization and rotation

8 verified natural photos → 48 responsive derivatives: 320/640/960px, WebP and AVIF.
Total image payload on disk: 2,978,063 bytes; browsers select a format and responsive size.
Raw ZIP and unassigned originals are not in the public bundle. No cutout derivative is shipped until its identity is approved.
Multi-photo Pan cards rotate every 7 seconds, fade over 900ms, hold a stable square frame,
pause on hover/keyboard focus and stop for reduced motion. Single-photo products are static.
Product detail uses a static primary with secondary gallery; unrelated categories retain their existing behavior.

## Local review

Preview: `http://127.0.0.1:3220/` (isolated mock server, no provider calls).
Product: `/menu?product=pan-de-muerto-traditional--ajonjoli`; collection: `/menu?category=pan`.
Screenshots: `work/qa/official-media/`, Chromium and WebKit, widths 390/768/1024/1440/1920.
Review desktop hero and the mapping above before any production deployment.

Validation: typecheck, lint and build pass; 413/413 unit/integration tests, 8/8 menu/cart browser tests,
19/19 checkout browser tests, 12/12 palette-lock browser tests and 4/4 preserved Sites tests pass.
Secret scan: 635 source/bundle files checked, zero findings. Official-media checks: 5 Chromium viewports
and 5 WebKit viewports (390/768/1024/1440/1920), with WebKit playback explicitly unresolved below.
Chromium playback is verified. Local WebKit requests the video (HTTP 200) but stays at readyState 0 / networkState 3,
despite reporting H.264 support. The existing server responds with chunked transfer and no Range support;
this is a potential cause, not a confirmed diagnosis. Server changes are explicitly outside this sprint.
WebKit source selection, poster, images, crossfade, keyboard pause and responsive layout are tested independently;
those passing checks must not be reported as passing video playback. Confirm Safari playback on the intended
media-serving environment, or authorize a separate static-media serving fix, before deployment.
