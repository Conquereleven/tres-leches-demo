> BRAND-02, 12 October 2026: historical/interim source provenance only. These images are **AWAITING FOUNDER-APPROVED REPLACEMENT**, not final media. The folder name is retained for existing tooling; current instructions are in `../brand02/replacement-manifest.json`.

# Final approved Conchas artwork

Three user-approved digital images, integrated without changing commercial data.
Original PNG bytes are preserved in `originals/`. `image-index.json` records the
uploaded filenames, approved semantic filenames, product assignments, hashes and
all responsive derivatives. Joel supplied the exact three square replacements (05_41_25, 05_41_27,
05_41_29). These are now authoritative. Earlier horizontal originals are preserved
in `superseded-horizontal-originals/` with their hashes in the index.

| Product | Approved image |
| --- | --- |
| Concha rellena de pistache | conchas_de_pistache_sobre_tabla_de_madera.png |
| Concha tradicional de chocolate · Pack | docena_de_conchas_de_chocolate_envuelta.png |
| Concha rellena de pistache · Pack | conchas_de_pistache_envueltas_en_celofán.png |

The earlier three horizontal assets remain in the Conchas opening gallery, through the existing
Pan de Muerto `MediaRotation` (same timing, crossfade, focus/hover pause and
reduced-motion behavior). The shared banner is 3:2, with the existing 20px panel
radius. All seven Conchas product frames use the same square Pan de Muerto
presentation, with contain fit; cart/checkout retain the shared square thumbnails.
The square sources fill each product frame like Tricolor, with no baked-in letterbox margins.
Original composition remains intact. Product/source identifiers remain unchanged; the opening gallery uses separate editorial identifiers. No category-specific frame system is used.

Provenance is internal; no public digital/AI badge or claim of real photography.
AVIF/WebP derivatives at 320/640/960px retain original proportions, with no crop.
Regenerate using a Pillow runtime with AVIF/WebP support:

```sh
python3 scripts/prepare-conchas-final-media.py
```

No catalog, SKU, pricing, availability, zone, payment, checkout-flow, Meta,
SQLite or production configuration changes. PR #5 was already merged before
this request; this visual-only follow-up stays on the same sprint branch.
