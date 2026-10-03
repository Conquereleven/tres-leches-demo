"""Asset-only patch helper. Usage: python optimize-approved-media.py /private/originals.
Pillow requires AVIF and WebP support. Originals are named <sourceId>.jpg.
Add reviewed assignments to media-manifest.json first; never infer products here.
"""
import json, sys
from pathlib import Path
from PIL import Image, ImageOps
repo = Path(__file__).resolve().parent.parent
manifest_path = repo / 'src/brand/media-manifest.json'
manifest = json.loads(manifest_path.read_text())
for asset in manifest['assets']:
    if asset['status'] != 'assigned': continue
    original = Path(sys.argv[1]) / (asset['sourceId'] + '.jpg')
    if not original.exists(): continue
    image = ImageOps.exif_transpose(Image.open(original)).convert('RGB')
    asset.update(width=image.width, height=image.height, originalBytes=original.stat().st_size)
    for derivative in asset['derivatives']:
        width = derivative['width']
        thumb = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
        target = repo / 'public' / derivative['src'].lstrip('/')
        target.parent.mkdir(parents=True, exist_ok=True)
        thumb.save(target, quality=65 if derivative['format'] == 'avif' else 82)
        derivative.update(height=thumb.height, bytes=target.stat().st_size)
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
