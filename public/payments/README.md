# Card acceptance marks — provenance

These files are displayed in the site footer on every page. They are trademarks
owned by Visa and Mastercard. Only artwork obtained from the official brand
centres (or supplied by our acquirer) may be used here.

## Rules

- Source only from the official brand centres listed below, or from Paymennt.
  Never from an image search, an icon set, or a third-party logo repository.
- Never recreate, trace or redraw either mark.
- Never modify the artwork: no recolouring (especially the Mastercard Symbol),
  no distortion, no cropping, no added effects.
- Preserve the original aspect ratio. Set one dimension in CSS and leave the
  other `auto`.
- Use the variant that matches the background the mark sits on. **In this
  footer both marks sit on a white tile** (`.b-payments li`, `background: #fff`),
  so the **light-background** variant is correct for both, regardless of the
  cream footer colour behind the tile.
- Keep the marks locally hosted. Never reference a brand centre CDN URL from
  production.
- Optimisation (whitespace, metadata, precision) is allowed only where it leaves
  the rendered artwork identical. Never hand-edit path geometry or colours.
- Always provide accessible `alt` text ("Visa", "Mastercard").

## Where the official files come from

**Visa** — <https://corporate.visa.com/en/about-visa/brand.html> → Brand
essentials tab → "Download Visa Brand Mark" → <https://globalclient.visa.com/brand-mark>.
Gated behind a form (first name, last name, title, company, business email,
country) plus Visa's Terms of Use. It must be completed by an authorised person
at the merchant, using the registered legal entity in the Company field.
Offered in SVG, PNG, EPS and AI. Take the **SVG**.

**Mastercard** — <https://www.mastercard.com/brandcenter/> → Download Artwork →
"WEBSITES & APPS · Mastercard Symbol" → `mc_symbol_SVG.zip`. Downloading it
accepts the Mastercard Artwork Download Agreement, so it must be done by an
authorised person at the merchant. Note that the light-background and
dark-background entries link to the same file: the Symbol artwork does not vary
by background. Branding requirements (minimum size, minimum clear space,
background contrast) are at
<https://www.mastercard.com/brandcenter/us/en/brand-requirements/mastercard.html>
and are also included in the ZIP.

## Current status

### `mastercard.svg` — OFFICIAL

Official Mastercard Symbol artwork, unmodified.

- Source: <https://www.mastercard.com/brandcenter/us/en/download-artwork.html>,
  "WEBSITES & APPS · Mastercard Symbol · Download SVG".
- Download URL:
  <https://www.mastercard.com/content/dam/brandcenter/assets/downloads/mc_symbol_SVG.zip>
- Retrieved: 22 September 2026, at the merchant's explicit request. The
  download accepts the Mastercard Artwork Download Agreement.
- File taken from the ZIP: `Mastercard Symbol - SVG/Artwork/ma_symbol.svg`,
  981 bytes, stored here byte-for-byte with no edits.
- `viewBox="0 0 152.4 108"` (ratio 1.411), official colours `#FF5F00`,
  `#EB001B`, `#F79E1B`. Geometry, colours and viewBox are unaltered.
- The ZIP also contains Mastercard's README and the web-artwork quick reference
  guide; those are reference documents and are not stored in the repository.
- The artboard includes Mastercard's required clear space, so the visible
  symbol is smaller than its box. It is therefore rendered at 32px tall against
  Visa's 20px so the two marks match optically.
- The unofficial reproduction previously at this path has been replaced.

### `visa.svg` — OFFICIAL

Official Visa Brand Mark artwork, unmodified.

- Package: **Visa Brand Mark DIGITAL 2025**
  (`visa-brand-mark-digital-2025.zip`), downloaded by the merchant from the
  Visa Brand Center after completing Visa's form and accepting its Terms of Use.
- Source: <https://corporate.visa.com/en/about-visa/brand.html> → Brand
  essentials → Download Visa Brand Mark → <https://globalclient.visa.com/brand-mark>
- Variant selected: global (non-Canada) **DIGITAL**, **blue RGB** — the Visa
  Blue Brand Mark for light backgrounds, which is what the white payment tile
  requires.
- Original filename:
  `Visa Brand Mark DIGITAL/VBM_digital_2025/blue/VBM_bluRGB_2025.svg`
- Integrated: 22 September 2026, stored byte-for-byte (1560 bytes, SHA-256
  `733ef827287b926d3bd37907787859f810ef44ad9fc09f0252661d58c44e22c1`).
- `viewBox="0 0 278.075 169.374"` (ratio 1.642), Visa Blue `#1434cb`.
  Paths, colours, viewBox and proportions are unaltered.
- The package also contains black and white variants, Canada-specific marks,
  `.ai` and `.png` versions and Visa's ReadMe. Only the file above is stored in
  the repository; the rest stay in the downloaded package.
- Like Mastercard's, the artboard carries Visa's required clear space, so the
  box is larger than the visible wordmark. Both marks use a 32px box, which
  lands their visible artwork at a matching optical size.
- The unofficial reproduction previously at this path has been replaced.

Both marks are now official artwork. Tracked as items 7 and 8 in
`docs/paymennt/website-live-compliance.md`.
