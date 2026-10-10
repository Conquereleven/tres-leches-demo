# Final approved Conchas artwork

Three user-approved digital images, integrated without changing commercial data.
Original PNG bytes are preserved in `originals/`. `image-index.json` records the
uploaded filenames, approved semantic filenames, product assignments, hashes and
all responsive derivatives. The upload filenames differed from the brief; the
three horizontal versions were identified by their exact depicted products.
The alternate square versions in Downloads are not used.

| Product | Approved image |
| --- | --- |
| Concha rellena de pistache | conchas_de_pistache_sobre_tabla_de_madera.png |
| Concha tradicional de chocolate · Pack | docena_de_conchas_de_chocolate_envuelta.png |
| Concha rellena de pistache · Pack | conchas_de_pistache_envueltas_en_celofán.png |

These three assets also form the Conchas opening gallery, through the existing
Pan de Muerto `MediaRotation` (same timing, crossfade, focus/hover pause and
reduced-motion behavior). The shared banner is 3:2, with the existing 20px panel
radius. The three product frames and cart/checkout thumbnails use 3:2 and
`object-fit: contain`; original composition and embedded margins stay intact.
The four traditional-flavour assignments remain unchanged.

Provenance is internal; no public digital/AI badge or claim of real photography.
AVIF/WebP derivatives at 320/640/960px retain original proportions, with no crop.
Regenerate using a Pillow runtime with AVIF/WebP support:

```sh
python3 scripts/prepare-conchas-final-media.py
```

No catalog, SKU, pricing, availability, zone, payment, checkout-flow, Meta,
SQLite or production configuration changes. PR #5 was already merged before
this request; this visual-only follow-up stays on the same sprint branch.
