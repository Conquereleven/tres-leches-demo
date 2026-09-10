# 3L customer brand QA — TL-19–TL-21

## Sources and comparison evidence

Corporate source: `/Users/rodrigom./Downloads/Manual de identidad 3L Pastelerias Dubai (1).pdf` (12 pages). Experience source: `/Users/rodrigom./Downloads/3L_Dubai_Master_Build_Specification_Claude.docx`. Atmosphere source: `/Users/rodrigom./Downloads/3086fa2c-6555-4b11-bea0-30f0c78825ef.MP4`.

Combined source/implementation comparison: `work/qa/brand/source-comparison.jpg`. Source frame: `work/brand/video-0.png`, 832×464. Implementation: `work/qa/brand/1440-hero-with-header.png`, 1440×900 CSS/pixels, DPR 1. Both are fitted into 710px comparison columns without stretching. The source is a perspective recording of a monitor, not a pixel-exact viewport; its browser chrome is retained to make that limitation clear. The written specification and manual take precedence.

Focused comparison: original manual page 4 rendered at 1200×1200 against the 390×900 header/hero screenshot in the same combined image. Header wordmark, circle proportions, three-star motif and clear-space padding inspected. Source stars were isolated as original artwork, excluding the neighboring wordmark letter.

Full section evidence: `work/qa/brand/{width}-{section}.png` and `matrix-{width}.jpg` at 320/375/390/430/768/1024/1280/1440; 15 main sections plus footer per width. Header+hero screenshots separately included. State: approved-copy foundation, missing client media explicitly identified, reduced motion for deterministic section captures. Normal-motion preloader/dialog and no-JavaScript reading are tested separately.

## Pass 1 — Design

**Remaining P1, external:** the production soaking film, cake/family/social imagery and original Dubai/pattern/ticker art are missing. The comparison clearly differs in photography and appetite; data slots are intentionally not substitutes for approved media. Customer-ready visual sign-off is blocked until those files arrive. No generated product imagery or screen-recorded frames were presented as real assets.

- Typography: actual self-hosted Abril Fatface and Montserrat. Brand manual overrides the reference's generic serif treatment. 1982 and exact approved copy retained. System cursive accent is provisional.
- Layout: centered wordmark header; immersive hero reservation; spacious bridge; exactly three products; overlapping slice/family compositions; distinct discovery doors; selected product surfaces; layered voice slots; general Dubai section; editorial footer. Mobile rearranges image/list and navigation rather than shrinking desktop.
- Tokens: corporate lavender/blush/gold anchors, cream/brown web extension explicitly documented. Body and controls pass axe contrast. Original logo coloration retained.
- Images: original marks extracted from the manual; all missing photography/art is named in the manifest. Production crop/video-quality verification remains external.
- Copy: no fabricated customer content. Reference flavor labels were not treated as a verified catalog. The legacy demo remains separately labelled and reachable.

## Comparison/fix history

1. P2 mobile fallback emblem overlapped hero controls. Corrected its flex alignment; verified 320–430 hero captures.
2. P1 production CSP blocked local official fonts. Allowed same-origin fonts, added WOFF2 MIME and compressed fonts. Verified font loading and zero browser console errors in compiled runtime.
3. P2 native dialog could cycle Tab into browser chrome. Added explicit first/last focus wrap, Escape and restoration; keyboard E2E passes.
4. P2 floating CTA overlapped final demo navigation. It now hides when the footer's own order control is visible; original checkout regression passes.
5. P1 inherited legacy footer height/color clipped the desktop footer and reduced contrast. Added scoped resets; all eight footer captures, overflow guard and mobile/desktop/modal axe pass.
6. P2 standalone star extraction included an adjacent letter. Removed that unrelated connected component while retaining original star pixels; focused source comparison verifies three stars only.
7. P2 incomplete isolation made the floating CTA and footer WhatsApp text inherit white on cream. Fixed scoped text colors and reran axe successfully.

## Pass 2 — Product

SEE → CRAVE → EXPLORE → DISCOVER → DESIRE → ORDER is structurally present, with working navigation/selection/dialogs. CRAVE/DESIRE remain limited by absent real imagery. ORDER reaches an explicit unavailable-contact state, because no official WhatsApp destination was supplied. Newsletter truthfully rejects until its provider exists. Promotion auto-display stays gated off without approved content. These are disclosed client/integration blockers, not successful live conversion claims.

## Pass 3 — Engineering

Lint/typecheck/build pass. 80 unit/domain/adapter/HTTP/DB/content tests, 4 Sites tests and 10 E2E pass. Eight responsive widths have zero measured overflow. Axe WCAG 2 A/AA and 2.1 AA: zero violations on mobile, desktop and dialog. Normal/reduced-motion, keyboard, selections, newsletter validation/error and no-JavaScript reading pass. Browser console: zero unexpected authored warnings/errors. Local initial CLS: 0; real-media performance must be measured after asset integration. Dependency audit: zero vulnerabilities.

Commerce WA2 → location → minimum → payment → fulfillment, source-number safeguards, out-of-coverage behavior, original checkout and HTTPS staging RBAC/readiness regressions all pass. No real external send or payment was performed.

## Remaining implementation checklist

1. Obtain and map the approved production media and final content in `src/brand/content.ts`.
2. Confirm official WhatsApp/social/legal URLs and newsletter backend.
3. Repeat real-media crop/contrast/playback/performance QA and actual-link UAT.
4. Obtain customer-facing design/content review before release.

The code foundation is reviewable; the full customer-ready design is not signed off because of the explicit P1 media/content dependencies.

final result: blocked
