"""Offline synthetic PDF verification; requires PyMuPDF (existing preview .venv).
Usage: python -I scripts/verify-print-pdfs.py EVIDENCE_DIR
Never reads a database, environment file or provider configuration.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile
import unicodedata
import fitz

root = Path(sys.argv[1]).resolve()
pdfs = root / "pdf"
png = root / "png"
png.mkdir(exist_ok=True)
manifest = json.loads((pdfs / "manifest.json").read_text())
report = []

def verify(data, name, layout, expected=None, raster=False):
    doc = fitz.open(stream=data, filetype="pdf")
    assert len(doc) > 0, name
    if expected is not None:
        assert len(doc) == expected, (name, len(doc), expected)
    texts = []
    bodies = []
    numeric_groups = []
    for n, page in enumerate(doc):
        w, h = page.rect.width, page.rect.height
        size = (round(w), round(h))
        assert size == ({"a4": (595, 842), "a5": (420, 595), "a5-two-up": (842, 595)}[layout]), (name, size)
        text = page.get_text()
        texts.append(text)
        scale = 1 if layout == "a4" else 148 / 210
        offsets = [0, 149 * 72 / 25.4] if layout == "a5-two-up" else [0]
        for offset in offsets:
            footer_starts = [s["bbox"][1] for b in page.get_text("dict")["blocks"] for l in b.get("lines", []) for s in l["spans"]
                             if s["text"].startswith("Generated ") and offset <= s["bbox"][0] < offset + 210 * 72 / 25.4 * scale]
            bottom = min(footer_starts) - 2 if footer_starts else 283 * 72 / 25.4 * scale
            bodies.append(page.get_text(clip=fitz.Rect(offset, 16 * 72 / 25.4 * scale, offset + 210 * 72 / 25.4 * scale, bottom)))
        assert "3L Pastelerías" in text and re.search(r"Page \d+ of \d+", text), (name, n, "running identifiers")
        assert len(text.strip()) > 140, (name, n, "blank page")
        for font in page.get_fonts(full=True):
            xref, ext, typ, base = font[:4]
            assert typ != "Type3" and ("Montserrat" in base or "NotoSansArabic" in base), (name, font)
            assert doc.extract_font(xref)[3], (name, "unembedded", font)
        # Text must be within its logical sheet and its half (two-up uses 1mm gutter).
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    x0, y0, x1, y1 = span["bbox"]
                    assert x0 >= 10 and y0 >= 5 and x1 <= w - 10 and y1 <= h - 7, (name, n, span)
                    if layout == "a5-two-up":
                        middle = w / 2
                        assert x1 <= middle - 7 or x0 >= middle + 7, (name, n, "crossed cut", span)
        # Respect the authored 13mm panel margins, not just the sheet edge.
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    x0, y0, x1, y1 = span["bbox"]
                    offset = (149 * 72 / 25.4) if layout == "a5-two-up" and x0 > w / 2 else 0
                    assert x0 >= offset + 13 * 72 / 25.4 * scale - 1.2, (name, n, "left authored margin", span)
                    assert x1 <= offset + 197 * 72 / 25.4 * scale + 1.2, (name, n, "right authored margin", span)
                    footer = span["text"].startswith(("Generated ", "SYNTHETIC", "Not an invoice", "Page "))
                    if not footer:
                        assert y1 <= 282 * 72 / 25.4 * scale + 1.5, (name, n, "body bottom", span)
        if "Numeric_Arabic" in name:
            # Check actual drawn glyph positions. Extraction order can be RTL
            # or use Noto's aliased codepoint for Persian ۱; normalize values,
            # then sort each numeric cluster left-to-right on the page.
            rows = {}
            for block in page.get_text("rawdict")["blocks"]:
                for line in block.get("lines", []):
                    for span in line["spans"]:
                        for ch in span["chars"]:
                            if ch["c"] in "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹":
                                rows.setdefault(round(ch["origin"][1], 2), []).append(ch)
            for chars in rows.values():
                current = []; previous = None
                for ch in sorted(chars, key=lambda c: c["origin"][0]):
                    if previous and ch["origin"][0] - previous["origin"][0] > 1.7 * (previous["bbox"][2] - previous["bbox"][0]):
                        numeric_groups.append("".join(str(unicodedata.digit(c["c"])) for c in current)); current = []
                    current.append(ch); previous = ch
                if current: numeric_groups.append("".join(str(unicodedata.digit(c["c"])) for c in current))
        if raster:
            page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4)).save(png / f"{Path(name).stem}_p{n+1}.png")
    if name == "P3_Numeric_Arabic_A4.pdf":
        doc[0].get_pixmap(matrix=fitz.Matrix(3, 3), clip=fitz.Rect(315, 185, 560, 395)).save(png / "P3_Numeric_Arabic_A4_numeric-detail.png")
    joined = "\n".join(texts)
    if "Overflow" in name or "Mixed_TwoUp" in name or "TL-DEMO-OVERFLOW" in name:
        for prefix, count in [("ROW", 160), ("NOTE", 180)]:
            for i in range(count):
                assert f"{prefix}{i:03}" in joined, (name, "lost token", prefix, i)
        assert "END-OF-INSTRUCTIONS" in joined
        assert "CONTINUOUS" * 80 in re.sub(r"\s", "", "".join(bodies)), (name, "continuous text lost")
    if "Numeric_Arabic" in name:
        assert len(numeric_groups) >= 8 and set(numeric_groups) == {"12", "1204"}, (name, "wrong drawn numeral order", numeric_groups)
    if "Oversized_Group" in name:
        assert "REVIEW OVERSIZED GROUP" in joined and "REVIEW OVERSIZED GROUP (CONTINUED)" in joined
    if "Oversized_Group" in name or "Oversized_Contents" in name:
        for i in range(420): assert f"GROUPROW{i:03}" in joined, (name, "missing group row token", i)
    if "Long_Legacy" in name:
        for prefix in ["NAME", "LEGACY"]:
            for i in range(40): assert f"{prefix}{i:03}" in joined, (name, "lost legacy token", prefix, i)
        assert "LEGACY-ADDRESS-END" in joined and "LONG-ADDRESS-NOTES-END" in joined
    report.append({"file": name, "pages": len(doc), "layout": layout, "sha256": hashlib.sha256(data).hexdigest()})
    return joined

for entry in manifest:
    data = (pdfs / entry["name"]).read_bytes()
    verify(data, entry["name"], entry["layout"], entry["pages"], "Bulk60" not in entry["name"])

expected_pngs = {f"{Path(entry['name']).stem}_p{n+1}.png" for entry in manifest if "Bulk60" not in entry['name'] for n in range(entry['pages'])}
actual_pngs = {p.name for p in png.glob("*_p[0-9]*.png")}
assert actual_pngs == expected_pngs, ("stale/missing page previews", sorted(actual_pngs ^ expected_pngs))

for archive in sorted(pdfs.glob("*.zip")):
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        expected = 60 if "60_Orders" in archive.name else 4
        assert len(z.infolist()) == expected
        assert len(set(z.namelist())) == expected
        for i, entry in enumerate(z.infolist()):
            assert Path(entry.filename).name == entry.filename and entry.filename.startswith(f"{i+1:03}-")
            layout = "a4" if expected == 60 else "a5"
            text = verify(z.read(entry), archive.name + "/" + entry.filename, layout)
            if expected == 60:
                refs = set(re.findall(r"TL-BULK\d{3}", text))
                assert refs == {f"TL-BULK{i:03}"}, (entry.filename, refs)
            else:
                refs = set(re.findall(r"TL-DEMO-(?:AR|P2|OVERFLOW|PICKUP)", text))
                assert len(refs) == 1, (entry.filename, refs)
(root / "pdf-verification.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"PASS: {len(manifest)} candidate PDFs, 64 extracted ZIP PDFs; {sum(r['pages'] for r in report)} pages; fonts, text bounds, cut separation, overflow tokens, CRC, order isolation.")
