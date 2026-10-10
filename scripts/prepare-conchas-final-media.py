"""Rebuild the approved final Conchas batch without cropping or altering originals.
Run with a Pillow runtime supporting AVIF/WebP. Sources and hashes are kept in docs.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image

repo = Path(__file__).resolve().parent.parent
folder = repo / 'docs/brand/conchas-final-approved'
manifest_file = repo / 'src/brand/category-media.json'
manifest = json.loads(manifest_file.read_text())
index = json.loads((folder / 'image-index.json').read_text())
for item in index:
    original = folder / 'originals' / item['source']
    assert hashlib.sha256(original.read_bytes()).hexdigest() == item['sha256']
    asset = next(a for a in manifest['assets'] if a['sourceId'] == item['sourceId'])
    image = Image.open(original).convert('RGB')
    asset.update(width=image.width, height=image.height, originalBytes=original.stat().st_size)
    item['derivatives'] = []
    for width in (320, 640, 960):
        thumb = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
        for fmt in ('avif', 'webp'):
            src = f"/brand/approved/{original.stem}-{width}.{fmt}"
            target = repo / 'public' / src.lstrip('/')
            thumb.save(target, quality=65 if fmt == 'avif' else 82)
            data = dict(src=src, width=width, height=thumb.height, bytes=target.stat().st_size, format=fmt)
            item['derivatives'].append(dict(**data, sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    asset['derivatives'] = [{k:v for k,v in d.items() if k != 'sha256'} for d in item['derivatives']]
manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
(folder / 'image-index.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
