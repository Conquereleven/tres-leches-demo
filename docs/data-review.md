# Delivery table transcription and data review

Source: user-supplied “MINIMUM ORDER FOR DELIVERY” screenshot, retrieved from Integración WhatsApp pagos, 2026-09-07. Original stored in `sources/delivery-minimums.jpeg`; meeting requirements in `sources/meeting-notes.png`.

All named cells are transcribed into `zoneSeed` in `server/domain/zones.ts`. JLT O–Y are expanded to one rule per visible cluster. “ONE JLT”, “MAZAYA” and “TAJ RESIDENCE” retain the 30 AED band. Palm Jumeirah Shoreline/Golden Mile (100) and West/East Crescent (150) remain distinct; generic Palm Jumeirah is ambiguous and is not assigned an invented minimum. Longest-name matching distinguishes Jebel Ali (150), Jebel Ali 2/Village (50) and Jebel Ali Downtown (300).

Only these small review groups remain:

1. **Delivery fees**: not present in the screenshot. Non-free zones use `deliveryFeeAed: null`; order payment is blocked until an admin supplies a fee. Zero is accepted only as an explicit admin decision.
2. **JLT B/C/D — RESOLVED (TL-25)**: confirmed minimum 30 AED for each; existing FREE DELIVERY and zero fee are preserved. Existing databases receive a one-time audited migration marker without replacing other rules.
3. **Source spelling / coverage specificity**: **REMRAN/Remraam — RESOLVED (TL-25)**: canonical name Remraam, minimum 300 AED, legacy REMRAN alias retained; stable `remran` ID preserves existing references. Its delivery fee remains unknown. MAZAYA and TAJ RESIDENCE remain the source labels; confirm exact buildings before attaching geography. No inferred boundary is seeded.

Known conventional aliases (e.g. JVC / Jumeirah Village Circle) are matching aids, not new business zones or rates. All unspecified geography stays unset. Test-only GPS fixtures under `tests/` recognize: (25.0657,55.2089) → JVC. Any other coordinate without an admin polygon is outside known coverage. Runtime contains no mock fallback; configure Mapbox or reviewed admin mappings.
