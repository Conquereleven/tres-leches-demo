"""P3 physical-point and protected P1/P2 regression checks. Existing PyMuPDF only.
Usage: python -I scripts/verify-delivery-typography.py EVIDENCE/p3-visual-polish
Before must have been captured before any renderer edit. No database/env access.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile
import fitz

root = Path(sys.argv[1]).resolve()

def capture(folder):
    rows = []
    def collect(data, name):
        doc = fitz.open(stream=data, filetype="pdf")
        pages = []
        for page in doc:
            spans = [{k: s[k] for k in ["text", "size", "font", "color", "bbox"]}
                     for block in page.get_text("dict")["blocks"] for line in block.get("lines", []) for s in line["spans"]]
            pages.append({"size": list(page.rect), "spans": spans})
        rows.append({"file": name, "sha256": hashlib.sha256(data).hexdigest(), "pages": pages})
    for path in sorted((folder / "pdf").glob("*.pdf")):
        collect(path.read_bytes(), path.name)
    with zipfile.ZipFile(folder / "pdf/SYNTHETIC_60_Orders.zip") as archive:
        for name in archive.namelist(): collect(archive.read(name), "SYNTHETIC_60_Orders.zip/" + name)
    return {r["file"]: r for r in rows}

before = capture(root / "before")
after = capture(root / "after")
(root / "after/typography-metrics.json").write_text(json.dumps(list(after.values()), indent=2, ensure_ascii=False) + "\n")
protected = []
for name, prior in before.items():
    if name.startswith(("P1", "P2", "SYNTHETIC_60_Orders.zip/")):
        current = after[name]
        assert prior == current, ("P1/P2 bytes or geometry/text/font changed", name)
        protected.append({"file": name, "sha256": prior["sha256"], "identical": True, "geometry_text_font_identical": True})
assert len(protected) == 69
(root / "p1-p2-byte-identity.json").write_text(json.dumps(protected, indent=2) + "\n")

patterns = {
    "item": (r"^(Tres Leches Cake|Pan de Muerto|Traditional Conchas|Velas de cumpleaños)$", 10),
    "pack_detail": (r"^(Each box|2 × Chocolate|2 × Diplomat|2 × Pistachio|Classic ·)", 9),
    "body": (r"^(All packages handed over|Sealed and undamaged|Gate 12|Bags / boxes:)", 10),
    "recipient": (r"^Numeric Arabic Fixture$", 13),
    "address": (r"^(Fixture Tower|1 Fictional Street|Fixture Area)$", 10),
    "footer": (r"^(Generated |SYNTHETIC ·|Not an invoice|Page \d)", 7),
    "label": (r"^(DELIVER TO|QTY|ITEM|HANDED OVER BY|SIGNATURE|TIME)$", 7),
}
comparison = []
coverage = set()
native = root / "after/native-72dpi"
native.mkdir(exist_ok=True)
for name, current in after.items():
    if not name.startswith("P3"): continue
    spans = [s for page in current["pages"] for s in page["spans"] if s["text"].strip()]
    assert min(s["size"] for s in spans) >= 6.99, (name, "secondary below 7 physical pt")
    categories = {}
    old_spans = [s for page in before.get(name, {}).get("pages", []) for s in page["spans"]]
    for category, (pattern, target) in patterns.items():
        matches = [s for s in spans if re.search(pattern, s["text"])]
        if not matches: continue
        coverage.add(category)
        prior = [s["size"] for s in old_spans if re.search(pattern, s["text"])]
        now = min(s["size"] for s in matches)
        assert now >= target - .01, (name, category, now, target)
        assert all(s["color"] == 0x27242D for s in matches), (name, category, "text must use ink")
        categories[category] = {"before_min_pt": min(prior) if prior else None, "after_min_pt": now, "target_pt": target}
    comparison.append({"file": name, "before_pages": len(before[name]["pages"]) if name in before else None,
                       "after_pages": len(current["pages"]), "minimum_physical_pt": min(s["size"] for s in spans), "categories": categories})
    doc = fitz.open(root / "after/pdf" / name)
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(1, 1))
        pix.set_dpi(72, 72)
        pix.save(native / f"{Path(name).stem}_p{i+1}_100pct.png")
    if name in ["P3_Numeric_Arabic_A5.pdf", "P3_A5_Candidate.pdf", "P3_Pickup_A5.pdf"]:
        page = doc[0]
        clip = fitz.Rect(0, 95, page.rect.width, min(page.rect.height, 410))
        page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip).save(native / f"{Path(name).stem}_detail_216dpi.png")
assert coverage == set(patterns), coverage
(root / "typography-comparison.json").write_text(json.dumps(comparison, indent=2) + "\n")
print(f"PASS: {len(protected)} P1/P2 PDFs identical in bytes/geometry/text/fonts; {len(comparison)} P3 PDFs meet measured physical size/ink targets; native 72dpi page previews written.")
