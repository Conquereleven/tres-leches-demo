"""Offline, reviewed photo assignments. Originals remain outside the public bundle.
Run with the extracted official ZIP directory as the only argument.
No filename-based product inference; ambiguous compositions stay unpublished.
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageOps

repo = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1])
assignments = [
    ("pan-de-muerto-traditional--azucar", "pan-de-muerto-traditional", "Azúcar", ["08.jpg"]),
    ("pan-de-muerto-traditional--ajonjoli", "pan-de-muerto-traditional", "Ajonjolí", ["09.png", "06.jpg"]),
    ("pan-de-muerto-traditional--azucar-chocolate-covering", "pan-de-muerto-traditional", "Azúcar · Chocolate covering", ["12.png", "10.png"]),
    ("pan-de-muerto-filled--chocolate", "pan-de-muerto-filled", "Chocolate", ["16.jpg", "18.jpg", "29.png"]),
]
assets, products = [], []
used = {name for _, _, _, names in assignments for name in names}
inventory = []
for path in sorted(source.iterdir()):
    image = Image.open(path)
    cutout = image.mode == "RGBA" and image.getextrema()[-1][0] < 255
    inventory.append({"filename": path.name, "width": image.width, "height": image.height,
                      "cutout": cutout, "status": "assigned" if path.name in used else "review-required"})
for product, family, variant, names in assignments:
    ids = []
    for index, name in enumerate(names):
        image = ImageOps.exif_transpose(Image.open(source / name)).convert("RGB")
        identifier = "official-pan-" + Path(name).stem
        ids.append(identifier)
        derivatives = []
        for width in (320, 640, 960):
            thumb = ImageOps.contain(image, (width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
            for fmt, quality in (("avif", 65), ("webp", 82)):
                relative = f"/brand/official-pan/{identifier}-{width}.{fmt}"
                target = repo / "public" / relative.lstrip("/")
                target.parent.mkdir(parents=True, exist_ok=True)
                thumb.save(target, quality=quality)
                derivatives.append({"src": relative, "width": thumb.width, "height": thumb.height,
                                    "bytes": target.stat().st_size, "format": fmt})
        assets.append({"sourceId": identifier, "sourceFilename": name, "family": family,
                       "variant": variant, "size": None, "status": "assigned",
                       "alt": f"Pastelerías 3L {variant} Pan de Muerto · photo {index + 1}",
                       "width": image.width, "height": image.height,
                       "originalBytes": (source / name).stat().st_size, "derivatives": derivatives})
    products.append({"productId": product, "primarySourceId": ids[0], "gallerySourceIds": ids[1:]})
manifest = {"sourceArchive": "PAN DE MUERTO PACK.zip", "inventory": inventory, "assets": assets, "products": products}
(repo / "src/brand/official-pan-media.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"inspected": len(inventory), "cutouts": sum(p["cutout"] for p in inventory),
                  "assignedPhotos": len(assets), "reviewRequired": len(inventory) - len(assets),
                  "optimizedBytes": sum(d["bytes"] for a in assets for d in a["derivatives"])}))
