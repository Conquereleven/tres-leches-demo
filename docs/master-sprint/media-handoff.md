# Client media handoff

Original supplied files remain unchanged. No generated food photos. Family crops remain family imagery, never proof of a particular filling/flavour.

|Route|Section / family|Aspect ratio|Recommended resolution|Asset needed|
|---|---|---|---|---|
|/menu (also cart/checkout thumbnails)|Carrot Cake (`carrot-cake`)|4:3|1600 × 1200 px|Approved product/family photograph; no substitute claimed|
|/menu (also cart/checkout thumbnails)|Cheesecake (`cheesecake`)|4:3|1600 × 1200 px|Approved product/family photograph; no substitute claimed|
|/menu (also cart/checkout thumbnails)|Jelly (gelatina) fruits (`jelly-gelatina-fruits`)|4:3|1600 × 1200 px|Approved product/family photograph; no substitute claimed|
|/menu (also cart/checkout thumbnails)|Jelly (gelatina) dulce de leche (`jelly-gelatina-dulce-de-leche`)|4:3|1600 × 1200 px|Approved product/family photograph; no substitute claimed|
|/menu (also cart/checkout thumbnails)|Jelly (gelatina) yogurt strawberry (`jelly-gelatina-yogurt-strawberry`)|4:3|1600 × 1200 px|Approved product/family photograph; no substitute claimed|
|/menu (also cart/checkout thumbnails)|Orejas (`orejas`)|4:3|1600 × 1200 px|Approved product/family photograph; no substitute claimed|
|/menu (also cart/checkout thumbnails)|Bisquets (`bisquets`)|4:3|1600 × 1200 px|Approved product/family photograph; no substitute claimed|
|/menu (also cart/checkout thumbnails)|Croissant (`croissant`)|4:3|1600 × 1200 px|Approved product/family photograph; no substitute claimed|
|/menu (also cart/checkout thumbnails)|Cubilete (`cubilete`)|4:3|1600 × 1200 px|Approved product/family photograph; no substitute claimed|
|/menu (also cart/checkout thumbnails)|Rosca de Reyes (3 kings pastry) (`rosca-de-reyes`)|4:3|1600 × 1200 px|Approved product/family photograph; no substitute claimed|
|/menu (also cart/checkout thumbnails)|Milk (`milk`)|4:3|1600 × 1200 px|Approved product/family photograph; no substitute claimed|
|/menu (also cart/checkout thumbnails)|Cake Topper (`cake-topper`)|4:3|1600 × 1200 px|Approved product/family photograph; no substitute claimed|
|/menu (also cart/checkout thumbnails)|Candles (`candles`)|4:3|1600 × 1200 px|Approved product/family photograph; no substitute claimed|
|/|Hero film + poster|Desktop 16:9; mobile 15:16 safe crop|1920 × 1080 film/poster plus 1080 × 1152 mobile-safe version|Licensed original soaking film and still; current approved reference asset retained|
|/menu|Pan de Muerto, Conchas, cakes, jars|4:3|1600 × 1200 px|Optional exact flavour/filling photography; current supplied multi-product crops stay family-level|
|/|Signature cakes|1:1|1200 × 1200 px|Optional licensed original full-resolution Dulce de Leche/Mango/Saffron sources|
|/|Family story|Portrait 3:4 / collage-safe|1200 × 1600 px|Optional full-resolution approved Liza and grandmother originals|

Upload licensed originals, identify product/family and exact variant if applicable, and approve the crop. No need to discover layout again. The historical brand asset manifest includes unused legacy slots; those are not automatically launch blockers.

## Approved Drive ingestion — current review release

Source folder: `19m33LpdpR6gefpTs_We7RwVmbgE9OgfY` (80 direct JPEG files).
The complete inventory, assignments, alternates and unmatched assets are in
`src/brand/media-manifest.json`. 35 selected source images now support exact
cake/jar flavours, Rosettas, yogurt-strawberry gelatina, milk sizes, candles and a generic Cake Topper family photograph.
Selection followed contact-sheet review: Classic/Dulce/Pistachio slice images
show layers; overhead Coconut shows its decoration; whole cakes preserve
silhouette; upright jars preserve flavour identity. Unmatched designs are not
new purchasable products. Alternate views are available but unused because the
existing UI has no product gallery. Cake Jar Bundle photography is family
imagery and does not promise a mixed assortment.

196,402,815 original selected-photo bytes → 3,488,821 combined AVIF + WebP
320/640/960 derivatives (98.22% reduction). Originals remain outside the frontend.
`media.tsx` chooses the exact family/flavour/size; cart and checkout use the same
SKU mapping. No prices or assortment rules are inferred from photography.

Approved `cake packaging .MP4` (56,039,195 bytes, 2160×3840, 60fps, 20.98s):
H.264 540×960/30fps = 3,922,397 bytes; 720×1280/30fps = 6,203,148 bytes;
poster = 49,656 bytes. A VP9/WebM candidate was 4,134,921 bytes, larger than the
mobile MP4, so it is excluded from shipping. Full 9:16 frame retained, no crop
of baked-in caption. Audio omitted for muted autoplay; visual content unchanged.
Reduced motion/data saving prefers the static poster; accessible pause control
and intersection pause remain. No duplicate “LET'S PACK YOUR CAKE” headline.

### Tomorrow's asset-only patch

1. Keep originals private, named `<sourceId>.jpg` outside `public/`.
2. Add a reviewed assignment to the manifest (exact existing family/variant/size,
   alt text, route, reason, derivative filenames; do not infer a missing flavour).
3. Run `scripts/optimize-approved-media.py /private/originals` with Pillow supporting
   AVIF/WebP. Target 320/640/960 widths; retain the original aspect ratio. Prefer
   clean product visibility and at least 960px source width. Cards use contain.
4. Verify menu flavour changes and cart/checkout thumbnail at 390/768/1440.
5. Validate/build, commit assets/manifest, deploy through the existing release gate.

Still missing: Tiramisu, Berries, Chocolate/Matcha cakes and jars, Half Rosettas,
Carrot Cake, Cheesecake, fruit/dulce gelatinas, orejas, bisquets, croissants,
cubiletes, Rosca. Keep approved existing menu family crops where
available; otherwise retain the decorative brand panel. No generated food photos.

Material page-weight correction: eight existing editorial PNGs plus embedded
raster images in the approved journey SVG now use optimized derivatives under
`/brand/approved/editorial-*`. Source artwork remains unchanged. Vector geometry,
transparency, composition and alt text are preserved. Original group 16,897,768
bytes → 2,241,934 bytes (86.73% reduction). These additional assignments are in
`media-manifest.json.editorial`; no new illustration or photographic content.
