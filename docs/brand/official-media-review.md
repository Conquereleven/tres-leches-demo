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

## Product mapping (9 October 2026, supersedes the first eight-photo pass)

All 50 sources are accounted for in `docs/brand/pan-de-muerto-photo-map.csv`
(original filename, organized filename, role, product, displayed, reason).
Filenames below are the originals; the CSV gives the organized names.

| Existing product | Primary | Rotation / gallery | What the photo shows |
| --- | --- | --- | --- |
| Azúcar · tradicional | 08.jpg | 11.png | Whole sugar-coated bread |
| Ajonjolí · tradicional | 09.png | 06.jpg | Whole glazed bread with sesame |
| Azúcar · Chocolate covering · tradicional | 12.png | 10.png | Sugar bread half dipped in dark chocolate |
| Crema diplomática (vainilla) · relleno | 14.png | 13.png | Plain pale cream at the seam |
| Chocolate · relleno | 16.jpg | 18.jpg, 29.png | Brown chocolate-coloured cream |
| Mascarpone y cajeta · relleno | 23.png | 30.png, 26.png | Pale cream with amber sauce |
| Mascarpone y fresas · relleno | 17.jpg | 20.jpg, 24.png, 21.png | Pale cream with strawberries |
| Pistachio · relleno | 07.png | 25.png, 27.jpg, 15 PNG.png (cutout) | Pale green coating, chopped pistachio |

Category banner (mixed boards, no flavour or pack implied): 01.png, 02.png, 03.png, 04.png.

Identification is by what is visible and by elimination against the live menu:
plain cream is the only filling without fruit, sauce or chocolate; the green bread
is the menu's only pistachio item. No photo proves a hidden recipe or a size, so
both sizes of a product share its photos. **Joel/Liza should confirm the three
cream assignments and pistachio before Production.**

Not displayed (24): 22 cutouts that repeat a published photo or board, and two
portrait assortments (05.png, 22.jpg) that do not fit the landscape banner.
No photograph exists for Ajonjolí · Chocolate covering, the five chocolate-covered
fillings or the two packs; they keep their previous image and stay static.

## Desktop video

Source: `d61ef385-902c-400d-a04a-5d0beb899dc4.MP4` (11,000,036 bytes).
Optimized: H.264, 576×1024, full 68.7 seconds, 5,281,415 bytes, fast-start MP4.
Audio removed to prevent any audible autoplay. No story edits, subtitles or branding crops.
Poster: frame at 4 seconds, WebP, 30,306 bytes.

Final decision (9 October 2026): the new official film and poster are used at 1024px and wider; tablet and mobile keep the original packaging video.
The existing cream editorial hero presents the portrait video using `object-fit: contain`.
Hero copy, layout, navigation and CTAs are preserved. No material hero-layout redesign was required.
Below 1024px the homepage requests the original packaging video and poster, unchanged.
Only one source is mounted at a time. Reduced motion, save-data and slow connections keep the poster;
the existing explicit play control remains available. A failed decode also leaves a usable poster.

## Photo optimization and rotation

26 sources → 156 derivatives (AVIF + WebP at 320/640/960, banner at 640/960/1536), 10.8 MB on disk;
a card typically downloads one 20–60 KB AVIF. The cutout keeps its alpha channel. Originals are read only.
Regenerate with `scripts/prepare-official-pan-media.py <organized library>` (needs Pillow with AVIF).
One rotation component serves product cards and the category banner: 7 s interval, 900 ms fade of the
incoming photo over the previous one (no blank frame), square card frame, only current + next photo mounted,
waits for the next photo to load, pauses on mouse hover, keyboard focus and off-screen, static for reduced motion.
Product detail shows a static primary with the remaining photos as a gallery.

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

## Safari playback (resolved 9 October 2026)

Cause: static files were sent without `Accept-Ranges`/`Content-Length`, and Safari will not play video from a
server that ignores Range. Static responses now honour a single byte range (`server/static-range.ts`).
The official-media test requires real playback (readyState ≥ 2 and advancing currentTime) in Chromium and WebKit
at 390/768/1024/1440/1920. Production currently has the old behaviour until this release is deployed.

## Visual refinement (9 October 2026)

- Menu introduction: the official wordmark as one 8% watermark (Joel approved 8%) behind "Menu / THE 3L MENU / FIND YOUR FAVOURITE."; `aria-hidden`, no pointer events, already cached by the header, no layout shift.
- Pan de Muerto banner restored at Lisa's request: boards 01–04 whole in their original 3:2 frame (`official-pan-banner-0N`, 640/960/1536).
- Pack photographs made square without letterboxing:
  - Traditional pack 02.png and 01.png: studio backdrop continued above and below.
  - 03.png: backdrop continued above only (the board's front edge is at the bottom).
  - 04.png: centred square of a tight detail whose breads the source frame already cuts.
  - Filled pack 13.png: backdrop continued above, bare board mirrored below (182 px), as a separate asset.
  The added areas are background only. Originals are unchanged.
