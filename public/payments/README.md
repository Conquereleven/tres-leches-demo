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

### `visa.svg` — UNOFFICIAL PLACEHOLDER

**Still a locally reproduced placeholder, not official artwork.** It must be
replaced before the site is submitted to Paymennt for LIVE review, and must
never be described to Paymennt as approved.

The official Visa Brand Mark requires the form at
<https://globalclient.visa.com/brand-mark> (first name, last name, title,
company, business email, country) plus acceptance of Visa's Terms of Use, so it
must be completed by an authorised person at the merchant. The Company field is
**Golositalia FZCO**. Take the **SVG**, light-background Visa Blue Brand Mark.

Swapping it in requires no code or layout change: save the official file over
`public/payments/visa.svg`. The only thing to check afterwards is the intrinsic
`width`/`height` pair on the Visa `<img>` in `src/brand/SiteChrome.tsx`
(`PaymentMarks`), currently `52 × 20`. If the official artwork has a different
aspect ratio, update that pair to match its viewBox so the mark reserves the
right space and causes no layout shift; CSS sets height only and leaves width
`auto`, so the ratio is preserved either way.

Tracked as items 7 and 8 in `docs/paymennt/website-live-compliance.md`.
