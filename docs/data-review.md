# Delivery table transcription and data review

Source: user-supplied “MINIMUM ORDER FOR DELIVERY” screenshot, retrieved from Integración WhatsApp pagos, 2026-09-07. Original stored in `sources/delivery-minimums.jpeg`; meeting requirements in `sources/meeting-notes.png`.

All named cells are transcribed into `zoneSeed` in `server/domain/zones.ts`. JLT O–Y are expanded to one rule per visible cluster. “ONE JLT”, “MAZAYA” and “TAJ RESIDENCE” retain the 30 AED band. Palm Jumeirah Shoreline/Golden Mile (100) and West/East Crescent (150) remain distinct; generic Palm Jumeirah is ambiguous and is not assigned an invented minimum. Longest-name matching distinguishes Jebel Ali (150), Jebel Ali 2/Village (50) and Jebel Ali Downtown (300).

Only these small review groups remain:

1. **Delivery fees**: not present in the screenshot. Non-free zones use `deliveryFeeAed: null`; order payment is blocked until an admin supplies a fee. Zero is accepted only as an explicit admin decision.
2. **JLT B/C/D**: FREE DELIVERY is explicit. Each rule has `freeDelivery: true`, fee 0, but minimum null pending confirmation whether the 30 AED header also applies below the free-delivery label.
3. **Source spelling / coverage specificity**: “REMRAN” remains as written (300). Confirm intended name before adding an alias. MAZAYA and TAJ RESIDENCE remain the source labels; confirm exact buildings before attaching geography. No inferred boundary is seeded.

Known conventional aliases (e.g. JVC / Jumeirah Village Circle) are matching aids, not new business zones or rates. All unspecified geography stays unset. The GPS mock recognizes exactly one documented fixture: (25.0657,55.2089) → JVC. Any other coordinate without an admin polygon is outside known coverage. It must not be used as a Dubai geocoder.
