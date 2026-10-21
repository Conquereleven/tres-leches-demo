"""3L-MEDIA-002: build public derivatives from the private 2026-10-19 photo delivery.

Usage: python scripts/prepare-media-002.py /private/path/NUEVAS
Pillow with AVIF/WebP support is required. Originals are never committed or edited:
each is checked against its SHA-256 in docs/media/3l-media-002/selection.json, cropped
to the reviewed box (no stretching, no colour change) and re-encoded without EXIF/GPS.

- kind "product":   one 1200x1200 WebP per photo for Product Hub upload
                    (docs/media/3l-media-002/hub-uploads/). Product media is published
                    through Product Hub, never bundled.
- kind "editorial": 3:2 category gallery frames, AVIF + WebP at 640/960/1440 px in
                    public/brand/approved/3l-media-002/, registered in category-media.json.
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageOps

repo = Path(__file__).resolve().parent.parent
originals = Path(sys.argv[1])
docs = repo / "docs/media/3l-media-002"
selection = json.loads((docs / "selection.json").read_text())
manifest_file = repo / "src/brand/category-media.json"
manifest = json.loads(manifest_file.read_text())
hub = docs / "hub-uploads"
public = repo / "public/brand/approved/3l-media-002"
hub.mkdir(parents=True, exist_ok=True)
public.mkdir(parents=True, exist_ok=True)

EDITORIAL_ALT = {
    "pan": "Pastelerías 3L Pan de Muerto · photographed assortment",
    "conchas": "Pastelerías 3L Conchas · photographed assortment",
    "bakery": "Pastelerías 3L Panadería Mexicana · photographed assortment",
}


# Founder-reviewed opening order: new photographs open each gallery.
GALLERY_ORDER = {
    "pan": ["M002-080", "M002-059", "M002-049"],
    "conchas": ["M002-026", "M002-027", "M002-024"],
    "bakery": ["M002-002", "M002-041"],
}


def stem(item):
    return f'{item["target"]}-{item["order"]}-{item["assetId"].lower()}'


def load(item):
    path = originals / item["source"]
    data = path.read_bytes()
    assert hashlib.sha256(data).hexdigest() == item["sourceSha256"], path
    image = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    return image.crop(tuple(item["crop"]))


def save(image, target, fmt):
    # A fresh RGB image carries no EXIF, XMP or GPS block.
    clean = Image.new("RGB", image.size)
    clean.paste(image)
    if fmt == "avif":
        clean.save(target, quality=62, speed=4)
    else:
        clean.save(target, quality=82, method=6)
    return target.stat().st_size


uploads = []
for item in selection:
    if item["kind"] != "product":
        continue
    image = load(item).resize((1200, 1200), Image.Resampling.LANCZOS)
    target = hub / f"{stem(item)}.webp"
    size = save(image, target, "webp")
    uploads.append(
        dict(
            file=f"hub-uploads/{target.name}",
            productId=item["target"],
            role=item["role"],
            order=item["order"],
            sourceAssetId=item["assetId"],
            width=1200,
            height=1200,
            bytes=size,
            sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
        )
    )
(docs / "hub-uploads.json").write_text(json.dumps(uploads, indent=1) + "\n")

editorial = {}
existing = {a["sourceId"]: a for a in manifest["assets"]}
for item in selection:
    if item["kind"] != "editorial":
        continue
    image = load(item)
    source_id = f'3l-media-002-{item["target"]}-{item["assetId"].lower()}'
    derivatives = []
    for width in (640, 960, 1440):
        frame = image.resize((width, round(width * 2 / 3)), Image.Resampling.LANCZOS)
        for fmt in ("avif", "webp"):
            target = public / f"{stem(item)}-{width}.{fmt}"
            size = save(frame, target, fmt)
            derivatives.append(
                dict(src="/" + str(target.relative_to(repo / "public")), width=width,
                     height=frame.height, bytes=size, format=fmt)
            )
    asset = dict(
        sourceId=source_id,
        sourceFilename=f'private delivery wetransfer_nuevas-3l_2026-10-19_1715.zip: {item["source"]}',
        family=None,
        variant="",
        size=None,
        routes=["/menu"],
        usage=f'{item["target"]} category gallery only; never a purchasable product image',
        alt=EDITORIAL_ALT[item["target"]],
        status="assigned",
        selectionReason="3L-MEDIA-002 professional photography, 19 October 2026 delivery.",
        mediaKind="photograph",
        presentation="menu-reference-landscape",
        width=image.width,
        height=image.height,
        originalBytes=(originals / item["source"]).stat().st_size,
        derivatives=derivatives,
    )
    existing[source_id] = asset
    editorial.setdefault(item["target"], []).append(source_id)

manifest["assets"] = list(existing.values())
for category, ids in editorial.items():
    ids = [f"3l-media-002-{category}-{a.lower()}" for a in GALLERY_ORDER[category]]
    entry = next((e for e in manifest["editorial"] if e["category"] == category), None)
    if entry is None:
        manifest["editorial"].append(dict(category=category, sourceIds=ids))
    else:
        # New photographs open the gallery; retained approved frames follow.
        entry["sourceIds"] = ids + [s for s in entry["sourceIds"] if s not in ids]
manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(len(uploads), "Product Hub uploads;", sum(len(v) for v in editorial.values()), "editorial frames")
