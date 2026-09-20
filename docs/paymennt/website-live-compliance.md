# Paymennt LIVE — website compliance check

Status date: 20 September 2026.
Scope: public customer website only. The Paymennt API integration, credentials,
webhook logic, order state machine, Meta/WhatsApp integration and AI agent logic
were **not** modified.

Public production URL under review:
`https://tres-leches-pasteleria-demo-production.up.railway.app/`

Legend: **PASS** = satisfied and verifiable · **BLOCKED** = cannot proceed until a
dependency clears · **NEEDS BUSINESS INPUT** = a fact only the owner can supply.

## Checklist

| # | Item | Status | Evidence / what is missing |
|---|---|---|---|
| 1 | Terms & Conditions published | **BLOCKED** | `/terms` is built and QA'd locally (12 sections: identity, scope, ordering, prices, acceptance, customer responsibilities, cancellation, refunds, delivery, custom orders, liability, contact). Not on production: the route returns 404 there until this change is deployed. |
| 2 | Legal company name visible | **NEEDS BUSINESS INPUT** | `business.legalName` is `null`. No registered entity exists anywhere in the repository. Terms and the footer currently degrade to the trading name "Pastelerías 3L". Paymennt requires the legal entity, so this alone blocks approval. |
| 3 | Privacy Policy published | **BLOCKED** | `/privacy` is built and QA'd locally. Describes only what the system actually processes (WhatsApp messages, order data, delivery location, payment reference, technical/security logs) and states that full card details are handled by Paymennt and never received or stored by 3L. Pending deployment. |
| 4 | Refund / Cancellation Policy published | **BLOCKED** | `/refund-policy` is built and QA'd locally and answers all three of Paymennt's questions. The three commercial rules behind it are still unset — see "Decisions required" below. Pending deployment. |
| 5 | Delivery Policy published | **BLOCKED** | `/delivery-policy` is built and QA'd locally from the real zone engine: 7 minimum-order bands plus the free-delivery band, transcribed from `docs/sources/delivery-minimums.jpeg` and kept identical to `server/domain/zones.ts`. Pending deployment. |
| 6 | Business contact details visible | **NEEDS BUSINESS INPUT** | **Hardest blocker.** `phone`, `email`, `whatsapp`, `address` and `supportHours` are all `null`, so `/contact` renders with no reachable channel at all — only "Pastelerías 3L · Dubai, United Arab Emirates". A customer cannot currently answer "who do I contact if there is a problem with my order?", which is exactly Paymennt's requirement. |
| 7 | Visa logo visible in footer | **NEEDS BUSINESS INPUT** | Renders in the footer on every page at 52×20, correct aspect ratio, `alt="Visa"`. The asset is a locally hosted reproduction, not a file obtained from the Visa brand centre or from Paymennt. Confirm the approved asset before review. |
| 8 | Mastercard logo visible in footer | **NEEDS BUSINESS INPUT** | Renders at 41×26, correct aspect ratio, `alt="Mastercard"`. Two points to confirm: the asset is a reproduction rather than an approved file, and it is the symbol only (interlocking circles) without the wordmark. Mastercard acceptance marks normally carry the wordmark. |
| 9 | All footer links work | **PASS** | All five links (`/terms`, `/privacy`, `/refund-policy`, `/delivery-policy`, `/contact`) resolve 200 on every page, including the home page, and are reachable from the mobile menu. |
| 10 | Desktop QA passed | **PASS** | Verified at 1440px and 1024px. No horizontal overflow, no overlap, no console errors. Footer and policy pages render in the 3L design system. |
| 11 | Mobile QA passed | **PASS** | Verified at 768px and 390px. No horizontal overflow, no overlapping content, policy text readable, one `h1` per page, no heading-level skips. |
| 12 | No placeholders / fake legal data | **PASS** | No "TBD", "Lorem ipsum", invented entity, address, phone, email, fee, delivery time or cancellation window anywhere. Every unknown fact is `null` and the page omits it or uses conservative accurate wording. The build prints the outstanding facts on every run. |
| 13 | Production public URL reachable | **PASS (site) / BLOCKED (new routes)** | The storefront returns 200. All five new routes return 404 on production until this change is deployed. |

## Decisions required from Lisa

These are commercial decisions, not code. Each is a `null` in
`src/brand/business.ts`; filling it in is the only change needed to complete the
corresponding page.

**Merchant identity (blocks requirement 1 and 2)**

1. Registered legal entity, exactly as written on the trade licence.
2. Trade licence number and issuing authority — only if it should be displayed.
3. Registered or business address in the UAE.

**Contact (blocks requirement 5)**

4. Customer-service WhatsApp number (this also unblocks every ORDER button on the site).
5. Customer-service phone number, if different.
6. Customer-service email address.
7. Customer care hours, e.g. "Daily, 9:00 am – 9:00 pm (GST)".

**Refund and cancellation (Paymennt's three explicit questions)**

8. Can a paid order be cancelled, and up to when? e.g. "up to 24 hours before the agreed delivery time". Without this the page says each request is reviewed individually and that preparation may prevent cancellation — accurate, but weaker than a stated rule.
9. What refund does an approved cancellation within that window receive? e.g. "a full refund".
10. Deadline to report a damaged, incorrect or missing item, e.g. "within 2 hours of delivery".

**Delivery**

11. Delivery days and hours.
12. Minimum notice for standard orders and for custom cakes.
13. What happens after a failed delivery — redelivery charge, refund, or neither.

**Payment branding (blocks requirement 7 and 8)**

14. Approved Visa and Mastercard acceptance assets, ideally supplied by Paymennt
    or downloaded from the brand centres, plus confirmation of permitted use.

## What was verified

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm test` — 169 passed, 0 failed.
- `npm run build` — succeeds; prerenders the 5 customer pages and prints the
  outstanding business facts as a build warning.
- Local run of the production server: all 5 routes and both logo assets return 200.
- Browser QA at 1440 / 1024 / 768 / 390 px: no overflow, no console errors,
  correct logo aspect ratios, footer links resolve, storefront unchanged.

## Deployment

Not deployed. Rodrigo's explicit approval is required before production
deployment, and requirements 2 and 6 should be filled in first — deploying now
would publish a Terms page without a legal entity and a Contact page with no
contact channel, which is what Paymennt asked to have fixed.

Paymennt LIVE remains disabled. No LIVE credentials were added and no payment
runtime configuration was changed.

## Decision

**PAYMENNT WEBSITE BLOCKED — BUSINESS INPUT REQUIRED**

The website work is complete and production-quality. Approval is blocked on the
legal entity name and at least one working customer contact channel, neither of
which exists in any authoritative project source and neither of which may be
invented.
