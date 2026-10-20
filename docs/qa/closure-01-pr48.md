# Closure 01 — PR #48

Baseline main: `589a78387c9efb5f4abd6e495d3746435c00dde5`. Initial PR head: `34ab2ba7c63a4141c433b3685ec7eeeff37fddfe`.

Only the withdrawn horizontal opening-gallery assignment is removed. The other two approved editorial frames and all approved product photo assignments/assets are preserved. No catalog, price or payment changes.

The previously green CI omitted the full Conchas visual suite. Running it produced 10 failures; the identical 10 also reproduce on main: outdated seven-product counts and expectations of a Tricolor photograph superseded by the approved neutral placeholder. Tests now assert eight exact product identities, mandatory Tricolor color choice, placeholder identity and all existing geometry/journey checks. This exposed two genuine pre-existing visual inconsistencies: neutral Conchas cards lacked the shared Pan frame, and Conchas cart thumbnails used cover. Both reuse existing presentation components; other families are unchanged.

Local: typecheck/lint/build; commerce 668 tests; secrets/audit; Chromium and WebKit Conchas 52/52 at 390/768/1440. New scoped CI runs this entire suite and uploads screenshots/geometry. Final GitHub results are recorded on the PR.

Evidence: `docs/brand/brand02/conchas/eight-cards-{390,768,1440}.png`, corresponding eight-cart/eight-checkout images and geometry-{chromium,webkit}-{width}.json. All fixtures synthetic. Production was not accessed or modified. Review only; no merge/deploy authorization in this sprint.
