# Paymennt LIVE — website compliance check

Status date: 22 September 2026.
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
| 6 | Business contact details visible | **PASS** | `/contact` lists three named, dialable contacts — Liza +971 52 168 3319, Sebastiano +971 50 675 7352, Golositalia store +971 55 640 6776 — plus the legal entity and full JLT address. All three also appear in the footer of every page as `tel:` links. |
| 7 | Visa logo visible in footer | **NEEDS BUSINESS INPUT** | Renders on every page at 52×20 with correct aspect ratio and `alt="Visa"`. The file is still a **locally reproduced placeholder, not official artwork**. Official source: <https://globalclient.visa.com/brand-mark> — a form requiring the merchant's identity plus Visa's Terms of Use. The Company field can now be completed: Golositalia FZCO. |
| 8 | Mastercard logo visible in footer | **NEEDS BUSINESS INPUT** | Renders at 41×26 with correct aspect ratio and `alt="Mastercard"`. Still a **locally reproduced placeholder**, symbol only. Official file: `mc_symbol_SVG.zip` from <https://www.mastercard.com/brandcenter/> → Download Artwork; the download accepts the Mastercard Artwork Download Agreement. |
| 9 | All footer links work | **PASS** | All five routes return 200 on every page including the home page, and are reachable from the mobile menu. |
| 10 | Desktop QA passed | **PASS** | 1440px and 1024px: no horizontal overflow, no overlap, no console errors. |
| 11 | Mobile QA passed | **PASS** | 768px and 390px: no horizontal overflow, policy text readable, one `h1` per page, contact numbers tappable as `tel:` links. |
| 12 | No placeholders / fake legal data | **PASS** | No customer-visible placeholder text on any policy page. Every remaining unknown is `null` and omitted; the build prints the outstanding facts on each run. |
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

**Blocks final sign-off**

1. **Official Visa and Mastercard artwork** (rows 7 and 8). Both downloads are
   legal acceptances on behalf of the business, so they must be completed by an
   authorised person at the merchant. Sources and handling rules are in
   `public/payments/README.md`. Until then the footer shows reproductions, which
   must not be represented to Paymennt as approved assets.

**Does not block Paymennt, but worth closing**

2. **Which number is the WhatsApp ordering line.** All three confirmed numbers
   are support numbers. `business.whatsapp` is deliberately still `null`, so
   every ORDER ON WHATSAPP button remains unconfigured and the ordering steps
   describe a WhatsApp flow the customer cannot yet start from the site.
   Note for confirmation, not action: Liza's number in international form is
   `971521683319`, which is the number hardcoded into the WhatsApp links of the
   `3l-dubai-web` reference prototype. That is a prototype, not authoritative
   configuration, so it has not been copied. One confirmation closes this.
3. **Customer-support email.** None exists in any authoritative project source,
   so none is published. Customers can reach the business by phone.
4. **Customer care hours** (`business.supportHours`).
5. **Deadline to report a damaged, incorrect or missing item**
   (`policyDecisions.issueReportWindow`). The page currently says "as soon as
   possible, ideally on the day of delivery" — accurate, but weaker than a rule.
6. **Order lead time, delivery days/hours, failed-delivery outcome**
   (`orderLeadTime`, `deliveryHours`, `failedDeliveryOutcome`). Pages omit these
   rather than promise anything.
7. **Trade licence number**, if it should be displayed alongside the entity.

## What was verified

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm test` — **179 passed, 0 failed**, including new tests that lock the legal
  entity, the address, the three contact numbers and their `tel:` links, the
  12-hour / 90% / 10% rule across both Terms and the Refund policy, the absence
  of any VAT or Corporate Tax wording, and that `business.whatsapp` stays unset.
- `npm run build` — succeeds; prerenders the 5 customer pages. Outstanding facts
  dropped from 12 to 7.
- `npm run scan:secrets` — 0 findings.
- Local production server: all five routes return 200; legal entity, address and
  all three numbers present in the built HTML of every page.
- Browser QA at 1440 / 1024 / 768 / 390 px: no overflow, no console errors, both
  card marks render, footer links resolve.

## Deployment

Not deployed. Paymennt LIVE remains disabled, no LIVE credentials were added,
and no payment runtime configuration was changed.

## Decision

**PAYMENNT WEBSITE BLOCKED — OFFICIAL VISA AND MASTERCARD BRAND ASSETS**

All six of Paymennt's content requirements are now satisfied: Terms with the
legal company name, Privacy, Refund/Cancellation, Delivery, business contact
details, and card marks present in the footer. The single remaining item is the
provenance of those card marks — the files in `public/payments/` are
reproductions, and replacing them requires a download that only the merchant can
authorise. Once those two SVGs are supplied, this becomes ready for review, and
deployment remains subject to Rodrigo's approval.
