# Paymennt LIVE — website compliance check

Status date: 22 September 2026 (final storefront cleanup complete).
Scope: public customer website only. The Paymennt API integration, credentials,
webhook logic, order state machine, Meta/WhatsApp integration and AI agent logic
were **not** modified.

Public production URL under review:
`https://tres-leches-pasteleria-demo-production.up.railway.app/`

Legend: **PASS** = content complete and verified locally · **BLOCKED** = cannot
proceed until a dependency clears · **NEEDS BUSINESS INPUT** = a fact only the
owner can supply. Rows 1–12 assess the work itself; row 13 separately tracks
production deployment, which is still pending Rodrigo's approval.

## Checklist

| # | Item | Status | Evidence / what is missing |
|---|---|---|---|
| 1 | Terms & Conditions published | **PASS** | `/terms` renders 12 sections and names **Golositalia FZCO** as the operating legal entity and **Pastelerías 3L** as the customer-facing brand, with the JLT business address. Section 10 states the cancellation and refund rule in full. |
| 2 | Legal company name visible | **PASS** | `business.legalName = "Golositalia FZCO"`. Renders on all five customer pages and in the footer of every page, as "Golositalia FZCO, trading as Pastelerías 3L". Verified in the built HTML. |
| 3 | Privacy Policy published | **PASS** | `/privacy` unchanged and still technically accurate: describes only what the system processes, and states that full card details are handled by Paymennt and never received or stored by 3L. |
| 4 | Refund / Cancellation Policy published | **PASS** | `/refund-policy` states the 12-hour cut-off, the 90% refund, the 10% cancellation and administrative fee, the non-refundable rule inside 12 hours, and the four circumstances in which a refund is issued. The fee is never described as VAT or Corporate Tax — enforced by a test. |
| 5 | Delivery Policy published | **PASS** | `/delivery-policy` built from the authoritative zone engine: 7 minimum-order bands plus the free-delivery band, transcribed from `docs/sources/delivery-minimums.jpeg` and kept identical to `server/domain/zones.ts`, enforced by a test. No invented fees, times or coverage. |
| 6 | Business contact details visible | **PASS** | `/contact` lists the WhatsApp ordering line plus three named, dialable contacts — Liza +971 52 168 3319, Sebastiano +971 50 675 7352, Golositalia store +971 55 640 6776 — with the legal entity and full JLT address. All three also appear in the footer of every page as `tel:` links. |
| 6b | Primary WhatsApp ordering number | **PASS** | `destinations.whatsapp = "+971521683319"` (Liza), confirmed by Rodrigo. Every ORDER ON WHATSAPP, ORDER NOW, mobile CTA, floating CTA and contact action derives from that single value through the `WhatsAppCTA` primitive; 10 links render and all resolve to `https://wa.me/971521683319`. A test forbids any component building a wa.me link or embedding the number itself. |
| 7 | Visa logo visible in footer | **PASS** | **Official artwork.** `VBM_bluRGB_2025.svg` from the **Visa Brand Mark DIGITAL 2025** package, global DIGITAL blue RGB variant (Visa Blue `#1434cb`, the light-background mark), stored byte-for-byte (1560 bytes, `viewBox="0 0 278.075 169.374"`). No redraw, recolour, geometry or viewBox change. Renders 53×32 on the white tile, aspect ratio within 0.002 of the source. Provenance in `public/payments/README.md`. |
| 8 | Mastercard logo visible in footer | **PASS** | **Official artwork.** `Mastercard Symbol - SVG/Artwork/ma_symbol.svg` from `mc_symbol_SVG.zip`, downloaded 22 September 2026 from the Mastercard Brand Center and stored byte-for-byte (981 bytes, `viewBox="0 0 152.4 108"`, colours `#FF5F00` / `#EB001B` / `#F79E1B`). No redraw, recolour, geometry or viewBox change. Renders 45×32 on the white tile, correct aspect ratio, `alt="Mastercard"`. The unofficial reproduction has been replaced. Provenance in `public/payments/README.md`. |
| 9 | All footer links work | **PASS** | All five routes return 200 on every page including the home page, and are reachable from the mobile menu. |
| 10 | Desktop QA passed | **PASS** | 1440px and 1024px: no horizontal overflow, no overlap, no console errors. |
| 11 | Mobile QA passed | **PASS** | 768px and 390px: no horizontal overflow, policy text readable, one `h1` per page, contact numbers tappable as `tel:` links. |
| 12 | No placeholders / fake legal data | **PASS** | No customer-visible placeholder text on any policy page, and the hero development string "HERO FILM · ORIGINAL ASSET PENDING" now appears **0 times** in the rendered HTML of all six pages. Every remaining unknown is `null` and omitted; the build prints the outstanding facts on each run. |
| 12b | Hero without the approved film | **PASS** | The hero media slot renders a brand-system CSS panel (cream ground, blush and lavender light, gold ring motif). No network asset, no animation, no preloader of its own. `b-hero-media` is unchanged, so dropping the approved film into `assets.hero`/`assets.poster` restores the video path with no redesign. |
| 12c | No artificial load delay | **PASS** | The ~3s intro preloader is removed: markup, CSS, keyframes, session flag and the `noscript` rule all gone. Content and the WhatsApp CTA are available at first paint. Section reveal motion and the reduced-motion work are untouched. |
| 13 | Production deployment | **BLOCKED** | Not deployed. All five routes still return 404 on production. Awaiting Rodrigo's explicit approval. |

## Business data now confirmed (22 September 2026)

| Field | Value |
|---|---|
| `business.legalName` | Golositalia FZCO |
| `business.tradingName` | Pastelerías 3L |
| `business.address` | Golositalia JLT, Jumeirah Lakes Towers, Cluster C, Retail Shop C6/A, Dubai, United Arab Emirates |
| `business.supportContacts` | Liza +971 52 168 3319 · Sebastiano +971 50 675 7352 · Golositalia store +971 55 640 6776 |
| `policyDecisions.paidCancellationWindow` | up to 12 hours before the scheduled delivery time |
| `policyDecisions.paidCancellationRefund` | 90% of the amount paid, 10% retained as a cancellation and administrative fee |

UAE numbers are stored in international display form (`+971 5X XXX XXXX`) and
converted to dialable E.164 for `tel:` links by `phoneHref`.

## Still outstanding

**Blocks Paymennt review**

Nothing. Both card marks are official, all six content requirements are met and
no customer-visible development placeholder remains.

**Does not block Paymennt, but worth closing**

1. **Customer-support email.** None exists in any authoritative project source,
   so none is published. Customers can reach the business by phone.
2. **Customer care hours** (`business.supportHours`).
3. **Deadline to report a damaged, incorrect or missing item**
   (`policyDecisions.issueReportWindow`). The page currently says "as soon as
   possible, ideally on the day of delivery" — accurate, but weaker than a rule.
4. **Order lead time, delivery days/hours, failed-delivery outcome**
   (`orderLeadTime`, `deliveryHours`, `failedDeliveryOutcome`). Pages omit these
   rather than promise anything.
5. **Trade licence number**, if it should be displayed alongside the entity.

## What was verified

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm test` — **185 passed, 0 failed**, including tests that lock the legal
  entity, the address, the contact numbers and their `tel:` links, the
  12-hour / 90% / 10% rule across both Terms and the Refund policy, the absence
  of any VAT or Corporate Tax wording, the configured WhatsApp number and that
  no component builds a wa.me link itself, the absence of the hero placeholder,
  the official Visa and Mastercard artwork (viewBox, colours, byte size), that
  the payment marks are never reveal-gated, that no customer-visible
  development placeholder reaches any rendered page, and that the preloader
  stays removed.
- `npm run build` — succeeds; prerenders the 5 customer pages. Outstanding facts
  dropped from 12 to 6.
- `npm run scan:secrets` — 0 findings.
- Local production server: all five routes return 200; legal entity, address and
  all three numbers present in the built HTML of every page.
- Dev-string scan of the built HTML for all six customer pages:
  **0 customer-visible development-placeholder occurrences**.
- Browser QA at 1440 / 1024 / 768 / 390 px: no overflow, no console errors,
  CLS 0.001 desktop / 0 mobile, 0 broken images, no preloader, both official
  card marks rendering at correct aspect ratio (Visa 53×32, Mastercard 45×32,
  ratio delta < 0.0025), 11 WhatsApp links all resolving to
  wa.me/971521683319, and footer links resolving.

## Deployment

Not deployed. Paymennt LIVE remains disabled, no LIVE credentials were added,
and no payment runtime configuration was changed.

## Decision

**PAYMENNT WEBSITE READY FOR REVIEW**

Every requirement Paymennt raised is satisfied: Terms & Conditions naming
Golositalia FZCO as the legal entity, Privacy Policy, Refund & Cancellation
Policy with the 12-hour rule and the 90/10 split, Delivery Policy from the real
zone data, business address and contact details, the confirmed WhatsApp
ordering line, working footer policy links, and official Visa and Mastercard
artwork in the footer. No customer-visible development placeholder remains and
nothing artificially delays first paint.

Not deployed. Production still returns 404 on the five customer routes, and
publishing is subject to Rodrigo's explicit approval. Paymennt LIVE remains
disabled; no LIVE credentials were added and no payment runtime configuration
was changed.
