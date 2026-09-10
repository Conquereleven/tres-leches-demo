# 3L brand implementation — TL-19 to TL-21

The customer experience is implemented as a reviewable foundation with explicit data slots. It is not approved for customer launch. The original Commerce OS, staging isolation and demo checkout are preserved.

## Baseline and source decisions

Started from `feature/tl18-staging-preparation` at `0f3f212226cde5d41bdd9d24391fd47053149380`, newer than the request's TL-17 baseline. Baseline: lint, strict typecheck, 76 domain/adapter/HTTP/DB tests, 4 Sites tests, 4 E2E and dependency audit passed (0 vulnerabilities).

Source priority: supplied corporate PDF → supplied Master Build DOCX → supplied MP4. Read all 12 PDF pages, the complete DOCX and sampled the full 16.56-second video. Embedded operating instructions in the DOCX were treated as reference content subordinate to the user's request.

- Manual: `Manual de identidad 3L Pastelerias Dubai (1).pdf`. Pages 3–4 original wordmark, circle and icon; page 5 proportional numeral-3 clear space; page 6 exact anchor hex values; page 8 Abril Fatface and Montserrat Medium; pages 7/9 approved color applications; pages 10–11 prohibited transformations/colors.
- DOCX: `3L_Dubai_Master_Build_Specification_Claude.docx` contains text/tables, no embedded photographs. The user explicitly inserts the promotional discovery before Dubai; this ordering is preserved.
- MP4: `3086fa2c-6555-4b11-bea0-30f0c78825ef.MP4` is a recording of a screen showing preloader, soaking-film hero, three cakes and overlapping slices. It is NOT a clean hero file. No frames were passed off as production photography; visible flavor labels were not promoted to a confirmed catalog.
- Abril Fatface takes priority over the DOCX's generic Didone direction. Cream/brown neutrals implement website roles without being presented as original corporate colors.

## Architecture and content

`src/brand/content.ts`: typed asset manifest, explicit nullable destinations, product slots, review verification/permission filter and newsletter interface. `primitives.tsx`: shared type, media, link/button, logo, form and native-dialog primitives. `Experience.tsx`: approved section sequence and interactions. `brand.css`: isolated semantic tokens, responsive compositions and reduced-motion rules. `Root.tsx` keeps the original app behind Gestión/MVP demo.

The customer site does not read operational customer/catalog records. New storefront copy contains no invented business address, price, review, identity, rating, stock claim or phone number. Existing fictitious records remain confined to the labelled MVP/operations demonstration.

Set the confirmed international number once in `destinations.whatsapp`. Every ordering entry uses `WhatsAppCTA`; validated digits are converted to wa.me and enquiry text is encoded. Until then, an accessible dialog explains that ordering is unavailable; there is no broken or invented WhatsApp URL. Product inquiries use actual names only when approved and available; out-of-stock selection cannot request that item. Social/privacy URLs remain null rather than guessed from the supplied handle.

Newsletter validation covers email/consent, submitting, success and recoverable failure. The shipped unavailable adapter rejects; it never reports success or stores/transmits an email. A real provider must be implemented behind an authenticated server-side integration with consent/version retention and a reviewed privacy notice; no provider secrets belong in this client interface.

## Brand system

Corporate anchors: lavender `#A191B2`, light lavender `#DDDAE8`, blush `#F6DFE0`, gold `#A28D5B`, pink `#FFC0C8`. Web extensions: cream `#F8F4ED`, paper `#FFFDF8`, warm ink `#372C27`, secondary ink `#66554B`, line `#D6CDC1`, neutral field `#EBE4D9`. All values, shadows/scrim, spacing, typography, containers, radii and motion live in the token block.

Original raster artwork is extracted from manual page 4 without redrawing/recoloring. White page background is made transparent; marks retain all components and proportional padding. The standalone stars extract excludes the adjacent wordmark letter. Positive circle, negative circle and original pink-ground icon are available; production vector masters remain requested for future large-format use. No synthetic brand illustrations or pattern were fabricated.

Abril Fatface and Montserrat are self-hosted WOFF2, Latin subset plus approved punctuation: 15,780 and 36,204 bytes. Sources and OFL licenses: [Google Fonts Abril](https://github.com/google/fonts/tree/main/ofl/abrilfatface), [Google Fonts Montserrat](https://github.com/google/fonts/tree/main/ofl/montserrat). Variable Montserrat retains weights, default body 500. Fallbacks are Georgia/Arial. Handwritten accent uses a system cursive fallback, explicitly provisional; no unapproved script file is bundled.

## Section and motion implementation

00 preloader → 01 hero → 02 bridge → 03 exactly three featured slots → 04 overlapping slice composition → 05 family → 06 star ticker → 07 four discovery doors → 08 bakery → 09 jars → 10 custom → 11 occasions → 12 verified-voice slots → 13 community → 14 promotional discovery → 15 Dubai → 16 newsletter → 17 footer.

- Three-second non-blocking entrance, rising icon/stars and staggered copy. Once per session; storage failure never prevents access. Header remains available under the sequence. Reduced motion skips it.
- Hero supports local video plus mandatory poster, failed-video poster fallback, intersection-driven playback/pause and no autoplay in reduced motion. Current intentional fallback says original film is pending; no fake footage.
- IntersectionObserver reveals and pauses offscreen ticker/verified voices. Transform/opacity only; no scroll hijack or continuous scroll polling. Slice composition uses restrained offsets; real-image parallax is deferred until its approved crop exists.
- Discovery changes emphasis on hover/focus/tap and anchors to the actual section. Product lists and occasion controls update the selected visual/data slot with crossfade; stock is an explicit state.
- Testimonials require verification AND display permission. No quotes are shipped. Floating motion is prepared for approved voices, static on reduced motion/mobile.
- Promotional dialog has native modal semantics, explicit Tab/Shift-Tab containment, Escape, backdrop close, restoration and 500ms entrance/260ms exit. Automatic discovery is gated by enabled flag, real image/message/CTA and a once-per-session marker. Until supplied, only an explicit preview of the pending content opens.
- All content is visible without scroll-triggered animation. Production build prerenders the customer shell for no-JavaScript reading; inactive JavaScript controls are hidden in noscript mode.

## Responsive, accessibility and performance

320/375/390/430 mobile: hero crop/fallback, stacked discovery doors, image before product list, simplified voices, full-width ordering controls and newsletter. 768 tablet: two discovery columns. 1024/1280/1440: centered wordmark navigation, overlapping editorial compositions and capped type/container widths.

One H1, labelled forms, accurate supplied-image alt text, decorative stars with empty alt, visible focus, native modal plus explicit wrap, 44px controls and reduced-motion override. Floating ordering access hides when the footer's own CTA is visible. Axe checks mobile/desktop/dialog, alongside keyboard and interaction E2E. Logo graphics are exempt from text contrast, body/control colors are not.

Image frames reserve aspect ratios; real below-fold images will lazy load. Only the display font is explicitly preloaded. Brand fonts are local; the Node server now explicitly allows same-origin fonts in CSP and serves WOFF2/MP4 types. No third-party embeds, animation library or production dependency was added. Axe is dev-only. The original MVP's existing remote font CSS remains unchanged; replacing its typography was outside the regression boundary.

## Activation checklist / client data

Required: clean approved 1920×1080 soaking video and poster/mobile crop; three confirmed featured cakes; bakery names/photos/availability; jar flavors/photos; custom taxonomy/photos; occasion taxonomy approval/photos; Alicia and current family images/approved story; original pattern/ticker/Dubai art; verified/permissioned voices; social images and actual Instagram/TikTok URLs; official WhatsApp destination; promotion copy/image/CTA; newsletter provider and consent/legal/privacy content; approved OG image.

See `asset-manifest.json` for every slot. Do not infer current availability or geography from reference imagery. Re-run image crop, contrast, video playback/performance, legal/privacy and actual-link QA after filling these slots. Meta/Paymennt/Geo/staging external blockers from TL-18 remain unchanged. No real customer message, payment or newsletter subscription was attempted.
