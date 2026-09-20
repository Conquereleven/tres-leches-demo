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

`visa.svg` and `mastercard.svg` in this directory are **locally reproduced
placeholders, not official artwork**, and must be replaced before the site is
submitted to Paymennt for LIVE review. The Mastercard placeholder is also the
symbol only, with no wordmark.

Tracked as items 7 and 8 in `docs/paymennt/website-live-compliance.md`.

When the official files arrive, replace them in place — the filenames
`visa.svg` and `mastercard.svg` are referenced from
`src/brand/SiteChrome.tsx` (`PaymentMarks`) — then update this section, confirm
the rendered aspect ratios, and re-run the footer QA at desktop and mobile.
