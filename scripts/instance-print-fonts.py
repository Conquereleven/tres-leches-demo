import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
src, arab, out = sys.argv[1], sys.argv[2], sys.argv[3]
for w in (500, 600, 700, 800):
    f = instancer.instantiateVariableFont(TTFont(src), {"wght": w}, updateFontNames=False)
    names = {500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold"}
    for rec in f["name"].names:
        if rec.nameID in (2, 17): rec.string = names[w]
        if rec.nameID in (4,): rec.string = f"Montserrat {names[w]}"
        if rec.nameID in (6,): rec.string = f"Montserrat-{names[w]}"
    if "STAT" in f: del f["STAT"]
    f.flavor = None
    f.save(f"{out}/Montserrat-{names[w]}.ttf")
for w, n in ((400, "Regular"), (700, "Bold")):
    f = TTFont(f"{arab}/noto-sans-arabic-arabic-{w}-normal.woff2"); f.flavor = None
    f.save(f"{out}/NotoSansArabic-{n}.ttf")
