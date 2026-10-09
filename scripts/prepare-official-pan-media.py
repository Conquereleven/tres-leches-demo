"""Offline, reviewed photo assignments for the official Pan de Muerto shoot.

Run with the organized library (the folder holding `_documentation/`) as the
only argument. Originals are read, never written. Every one of the 50 sources is
accounted for in docs/brand/pan-de-muerto-photo-map.csv; only the reviewed
selections below become public derivatives.

Assignments name what a photo shows from outside (coating, visible filling at
the seam). Nothing here claims a hidden recipe or a size.
"""
import csv
import json
import sys
from pathlib import Path
from PIL import Image, ImageOps

repo = Path(__file__).resolve().parent.parent
library = Path(sys.argv[1])
public = repo / "public/brand/official-pan"
T, F = "pan-de-muerto-traditional", "pan-de-muerto-filled"
# (product id, family, variant, [original filenames: primary first], visible evidence)
assignments = [
    (f"{T}--azucar", T, "Azúcar", ["08.jpg", "11.png"],
     "Whole sugar-coated bread, no topping or filling shown"),
    (f"{T}--ajonjoli", T, "Ajonjolí", ["09.png", "06.jpg"],
     "Whole glazed bread with sesame seeds"),
    (f"{T}--azucar-chocolate-covering", T, "Azúcar · Chocolate covering", ["12.png", "10.png"],
     "Sugar-coated bread half dipped in dark chocolate"),
    (f"{F}--crema-diplomatica-vainilla", F, "Crema diplomática (vainilla)", ["14.png", "14 PNG.png", "13.png"],
     "Joel approved these three, in this order, on 9 October 2026 (photo, its cutout, group of three)"),
    (f"{F}--chocolate", F, "Chocolate", ["16.jpg", "18.jpg", "16 PNG.png", "18 PNG.png", "29.png"],
     "Joel approved these five, in this order, on 9 October 2026 (two photos, their cutouts, side detail)"),
    (f"{F}--mascarpone-y-cajeta", F, "Mascarpone y cajeta", ["23.png", "30.png", "26.png"],
     "Pale cream with amber sauce running down the bread"),
    (f"{F}--mascarpone-y-fresas", F, "Mascarpone y fresas", ["17.jpg", "20.jpg", "24.png", "21.png"],
     "Pale cream with visible strawberries"),
    (f"{F}--pistachio", F, "Pistachio", ["07.png", "25.png", "27.jpg", "15 PNG.png"],
     "Pale green coating with chopped pistachio; the menu's only pistachio bread"),
]
# Mixed boards belong to the category, never to one flavour or a pack.
editorial = ["01.png", "02.png", "03.png", "04.png"]
# Shown whole inside the square frame instead of filling it.
contain = {"13.png"}
held = {
    "05.png": "Portrait assortment; the category banner is landscape",
    "22.jpg": "Portrait assortment; the category banner is landscape",
}

rows = list(csv.DictReader((library / "_documentation/PAN_DE_MUERTO_IMAGE_MANIFEST.csv").open(encoding="utf-8-sig")))
by_original = {row["Original filename"]: row for row in rows}
assert len(rows) == 50, len(rows)


def identifier(name: str) -> str:
    stem = Path(name).stem.lower().replace(" png", "-cutout")
    return "official-pan-" + ("assortment-cutout" if stem.startswith("panes") else stem)


def derive(name: str, widths: tuple[int, ...]):
    row = by_original[name]
    path = library / row["Relative organized path"]
    transparent = row["Transparent background (yes/no)"] == "yes"
    image = ImageOps.exif_transpose(Image.open(path)).convert("RGBA" if transparent else "RGB")
    derivatives = []
    for width in widths:
        scaled = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
        for fmt, quality in (("avif", 60), ("webp", 80)):
            relative = f"/brand/official-pan/{identifier(name)}-{width}.{fmt}"
            scaled.save(repo / "public" / relative.lstrip("/"), quality=quality)
            derivatives.append({"src": relative, "width": scaled.width, "height": scaled.height,
                                "bytes": (repo / "public" / relative.lstrip("/")).stat().st_size, "format": fmt})
    return image, transparent, derivatives, path


public.mkdir(parents=True, exist_ok=True)
for stale in public.iterdir():
    stale.unlink()
assets, products, role = [], [], {}
for product, family, variant, names, evidence in assignments:
    ids = []
    for index, name in enumerate(names):
        image, transparent, derivatives, path = derive(name, (320, 640, 960))
        ids.append(identifier(name))
        role[name] = ("product gallery" if index else "product primary", product, evidence)
        assets.append({"sourceId": identifier(name), "sourceFilename": name, "family": family,
                       "variant": variant, "size": None, "status": "assigned", "transparent": transparent,
                       "fit": "contain" if name in contain else "cover",
                       "alt": f"Pastelerías 3L {variant} Pan de Muerto · photo {index + 1}",
                       "width": image.width, "height": image.height,
                       "originalBytes": path.stat().st_size, "derivatives": derivatives})
    products.append({"productId": product, "primarySourceId": ids[0], "gallerySourceIds": ids[1:]})
for index, name in enumerate(editorial):
    image, transparent, derivatives, path = derive(name, (640, 960, 1536))
    role[name] = ("category editorial", "pan", "Mixed board of several breads")
    assets.append({"sourceId": identifier(name), "sourceFilename": name, "family": "pan-de-muerto-category",
                   "variant": "", "size": None, "status": "assigned", "transparent": transparent, "fit": "cover",
                   "alt": f"Pastelerías 3L Pan de Muerto assortment · photo {index + 1}",
                   "width": image.width, "height": image.height,
                   "originalBytes": path.stat().st_size, "derivatives": derivatives})
manifest = {"sourceArchive": "PAN DE MUERTO PACK.zip", "assets": assets, "products": products,
            "editorial": [{"category": "pan", "sourceIds": [identifier(name) for name in editorial]}]}
(repo / "src/brand/official-pan-media.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

# The full account: one line per source, including what is deliberately not shown.
shown_groups = {by_original[name]["Related image group"] for name in role}
with (repo / "docs/brand/pan-de-muerto-photo-map.csv").open("w", newline="", encoding="utf-8") as handle:
    out = csv.writer(handle)
    out.writerow(["Original filename", "Organized filename", "Transparent", "Role", "Product or category",
                  "Displayed", "Public asset id", "Reason"])
    for row in rows:
        name = row["Original filename"]
        transparent = row["Transparent background (yes/no)"]
        if name in role:
            kind, target, reason = role[name]
            out.writerow([name, row["New organized filename"], transparent, kind, target, "yes", identifier(name), reason])
        elif name in held:
            out.writerow([name, row["New organized filename"], transparent, "category editorial (held)", "pan", "no", "", held[name]])
        else:
            assert transparent == "yes", name
            paired = row["Related image group"] in shown_groups
            out.writerow([name, row["New organized filename"], transparent, "cutout alternate", "", "no", "",
                          "Same composition as the published photo of this series" if paired
                          else "Cutout of a mixed board; the photographed boards are published instead"])
print(json.dumps({"sources": len(rows), "productPhotos": sum(len(a[3]) for a in assignments),
                  "editorial": len(editorial), "notDisplayed": len(rows) - len(role),
                  "derivatives": sum(len(a["derivatives"]) for a in assets),
                  "optimizedBytes": sum(d["bytes"] for a in assets for d in a["derivatives"])}))
