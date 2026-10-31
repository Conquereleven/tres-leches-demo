# English catalog names — 31 October 2026 hotfix

## Root cause

A combination of a code defect and source data.

1. **Data.** English is the storefront's source language, but some catalog sources are authored in Spanish: product titles (`shared/storefront-products.json`), flavours and sizes (`src/brand/menu-data.json`) and SKU catalog names (`State.catalog`, shown on cart lines). The Product Hub Foundation was bootstrapped from those sources, so its published `translations.en` repeats the Spanish wording.
2. **Code.** The English locale never translated anything:
   - `localizedSource()` returned the source unchanged for `en`. The few reviewed English values that already existed in `locales/en` (Tricolor and Concha names) were never shown.
   - `liveCopy()` returned `null` for `en`, so published English corrections of flavour labels, size labels and cart names were ignored. Only product titles read `content.en.name`.

## Fix

- `src/brand/locales/engine.ts`: English shows the reviewed EN resource value when one exists. Otherwise it shows the source exactly as authored, never a "pending" marker.
- `src/brand/live-catalog.ts`: published English wording takes priority when it **differs** from the source. A manual Product Hub correction, such as the founder's Pistachio fix, therefore always wins.
- `src/brand/discovery.ts`: search also matches the English wording customers see ("sugar", "sesame").
- `src/brand/locales/en/{product,menu}.json`: 187 reviewed English values. The full list, with original and revised text, is in `reviewed-english.json`.

Spanish and Arabic resources are unchanged.

Not changed: SKUs, product IDs, slugs/URLs, prices, availability, photography, packs, Operations names (`src/commerce/ops-product-names.json`), order snapshots and emails.

## Wording rules

- The wording follows the reviewed Operations dictionary (`src/commerce/ops-product-names.json`): Traditional/Filled Pan de Muerto, Sugar, Sesame, Vanilla diplomat cream, Mascarpone and cajeta, Mascarpone and strawberries, individual pieces, each, people, pieces, Single portion, Whole wheat, Fruit jelly, Pack of 3.
- These terms are kept unchanged: Pan de Muerto, Concha(s), Cajeta, Orejas, Bisquets, Cubilete, Rosca de Reyes, Dulce de Leche.
- The storefront keeps "3 Leches", unlike Operations, which uses "Tres Leches".
- No descriptions were invented. Published descriptions are null or equal to the SKU name.

## Held, not changed

These Pistachio strings are held because the founder already corrected Pistachio naming in Product Hub. Whatever is published there is shown verbatim.

- Pistachio Pan de Muerto relleno
- Pistachio · Chocolate covering Pan de Muerto relleno
- Pan de Muerto relleno · Pistachio · Mini / Individual
- Pan de Muerto relleno · Pistachio · Chocolate covering · Mini / Individual
- Concha rellena de pistache · Pack · 6 / 12 individuales

The pistachio words elsewhere ("Pistache" in Traditional Conchas, "Pistacchio" in croissants) are kept exactly as published; only their Spanish parts were translated.

## Product Hub

**No publication is required.** The revision live today publishes English equal to the Spanish source, and the build now supplies the reviewed English for those strings. A future Product Hub edit with different English wins automatically. It is optional to later align the published `translations.en` with this wording, so the Product Hub editor shows the same names. That would be an ordinary draft → review → admin publication; it is not prepared here.

A Foundation bootstrapped from scratch, which only happens in new or test environments, now gets the reviewed English. The Production audit compares the commercial catalog fingerprint only, so it is unaffected.

## Evidence

`after-cart-{en,es,ar}.png`: the same two cart lines in each language (390 px, disposable fixture server).
