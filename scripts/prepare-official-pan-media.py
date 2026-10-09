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
from PIL import Image, ImageFilter, ImageOps

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
    # Packs: illustrative groups only; the size selector stays authoritative.
    (f"{T}-pack", f"{T}-pack", "", ["02.png", "01.png", "03.png", "04.png"],
     "Mixed board of sesame, sugar and chocolate-dipped breads (plus pistachio-coated); illustrative, no pack count implied"),
    (f"{F}-pack", f"{F}-pack", "", ["13.png#pack"],
     "Three cream-filled breads, the only group photograph of filled breads; illustrative, no pack count implied"),
    (f"{F}--mascarpone-y-cajeta", F, "Mascarpone y cajeta", ["23.png", "30.png", "26.png"],
     "Pale cream with amber sauce running down the bread"),
    (f"{F}--mascarpone-y-fresas", F, "Mascarpone y fresas", ["17.jpg", "20.jpg", "24.png", "21.png"],
     "Pale cream with visible strawberries"),
    (f"{F}--pistachio", F, "Pistachio", ["07.png", "25.png", "27.jpg", "15 PNG.png"],
     "Pale green coating with chopped pistachio; the menu's only pistachio bread"),
]
# The category banner shows the same boards whole, in their original 3:2 frame.
banner = ["01.png", "02.png", "03.png", "04.png"]
held = {
    "05.png": "Mixed board; the pack photos already cover assortments and none is a filled group",
    "22.jpg": "Mixed board; the pack photos already cover assortments and none is a filled group",
}

rows = list(csv.DictReader((library / "_documentation/PAN_DE_MUERTO_IMAGE_MANIFEST.csv").open(encoding="utf-8-sig")))
by_original = {row["Original filename"]: row for row in rows}
assert len(rows) == 50, len(rows)


def source(name: str) -> str:
    """`13.png#pack` is a second, differently framed asset from the same original."""
    return name.split("#")[0]


def identifier(name: str) -> str:
    stem = Path(source(name)).stem.lower().replace(" png", "-cutout")
    suffix = "-" + name.split("#")[1] if "#" in name else ""
    return "official-pan-" + ("assortment-cutout" if stem.startswith("panes") else stem) + suffix


CREAM = (246, 239, 227)
crops = json.loads((Path(__file__).parent / "official-pan-crops.json").read_text())


def square(name: str, image: Image.Image) -> Image.Image:
    """Every published photo is a 1:1 product photograph with the whole bread centred.

    Reviewed windows live in official-pan-crops.json: `crop` trims unused
    photographic background around the bread (cutouts may extend past the
    source, staying transparent); `canvas` places a group photograph whole on a
    cream square because no square window holds every bread. Nothing is
    stretched and no pixel is invented. `extend` makes a landscape group square
    by continuing the photograph's own background above and below it: the
    studio backdrop's edge tone, or a mirrored strip of bare board. Breads are
    never copied, moved or redrawn.
    """
    spec = crops[name]
    if spec["mode"] == "extend":
        image = image.crop((0, 0, image.width, image.height - spec.get("trimBottom", 0)))
        top, bottom = spec["top"], spec["bottom"]
        canvas = Image.new("RGB", (image.width, image.height + top + bottom))
        if top:
            canvas.paste(background(image, 0, top, "edge"), (0, 0))
        canvas.paste(image, (0, top))
        if bottom:
            canvas.paste(background(image, image.height, bottom, spec.get("bottomFill", "edge")), (0, top + image.height))
        assert canvas.width == canvas.height, (name, canvas.size)
        return canvas
    if spec["mode"] == "canvas":
        side = max(image.size)
        canvas = Image.new("RGB", (side, side), CREAM)
        canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
        return canvas
    x, y, side = spec["square"]
    if image.mode == "RGBA":
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(image, (-x, -y))
        return canvas
    assert x >= 0 and y >= 0 and x + side <= image.width and y + side <= image.height, name
    return image.crop((x, y, x + side, y + side))


def background(image: Image.Image, edge: int, height: int, fill: str) -> Image.Image:
    """Extra background beyond the top (edge 0) or bottom (edge = height) of a photo."""
    width = image.width
    if fill == "mirror":
        return image.crop((0, edge - height, width, edge)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    rows = (0, 14) if edge == 0 else (edge - 14, edge)
    tone = image.crop((0, rows[0], width, rows[1])).resize((width, 1), Image.Resampling.BOX)
    return tone.filter(ImageFilter.GaussianBlur(40)).resize((width, height), Image.Resampling.NEAREST)


def derive(name: str, widths: tuple[int, ...], whole: str = ""):
    row = by_original[source(name)]
    path = library / row["Relative organized path"]
    transparent = row["Transparent background (yes/no)"] == "yes"
    image = ImageOps.exif_transpose(Image.open(path)).convert("RGBA" if transparent else "RGB")
    image = image if whole else square(name, image)
    derivatives = []
    # Never enlarge: a tight crop of a small bread simply ships fewer sizes.
    for width in [w for w in widths if w <= image.width * 1.05] or widths[:1]:
        scaled = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
        for fmt, quality in (("avif", 60), ("webp", 80)):
            relative = f"/brand/official-pan/{whole or identifier(name)}-{width}.{fmt}"
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
        ids.append(identifier(name))
        kind = "product gallery" if index else "product primary"
        if name in role:  # one published asset may serve two products
            role[name] = (role[name][0], role[name][1] + " + " + product, role[name][2])
            continue
        image, transparent, derivatives, path = derive(name, (320, 640, 960))
        role[name] = (kind, product, evidence)
        assets.append({"sourceId": identifier(name), "sourceFilename": name, "family": family,
                       "variant": variant, "size": None, "status": "assigned", "transparent": transparent,
                       "alt": (f"Pastelerías 3L {variant} Pan de Muerto" if variant else "Pastelerías 3L Pan de Muerto assortment") + f" · photo {index + 1}",
                       "width": image.width, "height": image.height,
                       "originalBytes": path.stat().st_size, "derivatives": derivatives})
        assets[-1]["sourceFilename"] = source(name)
    products.append({"productId": product, "primarySourceId": ids[0], "gallerySourceIds": ids[1:]})
for index, name in enumerate(banner):
    sid = identifier(name).replace("official-pan-", "official-pan-banner-")
    image, transparent, derivatives, path = derive(name, (640, 960, 1536), whole=sid)
    assets.append({"sourceId": sid, "sourceFilename": name, "family": "pan-de-muerto-category",
                   "variant": "", "size": None, "status": "assigned", "transparent": transparent,
                   "alt": f"Pastelerías 3L Pan de Muerto assortment · banner {index + 1}",
                   "width": image.width, "height": image.height,
                   "originalBytes": path.stat().st_size, "derivatives": derivatives})
manifest = {"sourceArchive": "PAN DE MUERTO PACK.zip", "assets": assets, "products": products,
            "editorial": [{"category": "pan", "sourceIds": [identifier(n).replace("official-pan-", "official-pan-banner-") for n in banner]}]}
(repo / "src/brand/official-pan-media.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

# The full account: one line per source, including what is deliberately not shown.
shown_groups = {by_original[source(name)]["Related image group"] for name in role}
for name in [n for n in role if "#" in n]:  # fold a second framing into its original's row
    kind, target, reason = role.pop(name)
    first = role[source(name)]
    role[source(name)] = (first[0], first[1] + " + " + target, first[2])
for name in banner:
    role[name] = (role[name][0] + " + category banner", role[name][1], role[name][2])
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
            out.writerow([name, row["New organized filename"], transparent, "not used", "", "no", "", held[name]])
        else:
            assert transparent == "yes", name
            paired = row["Related image group"] in shown_groups
            out.writerow([name, row["New organized filename"], transparent, "cutout alternate", "", "no", "",
                          "Same composition as the published photo of this series" if paired
                          else "Cutout of a mixed board; the photographed boards are published instead"])
print(json.dumps({"sources": len(rows), "productPhotos": sum(len(a[3]) for a in assignments),
                  "notDisplayed": len(rows) - len(role),
                  "derivatives": sum(len(a["derivatives"]) for a in assets),
                  "optimizedBytes": sum(d["bytes"] for a in assets for d in a["derivatives"])}))
