# Customer email visual UX (review candidate)

## Purpose and scope

Customer-facing transactional messages now carry responsive, table-based branded HTML plus the a readable plain-text fallback retaining the existing status information. The rendered HTML is frozen in the durable notification row at the same time as the customer event. No new event, payment confirmation, recipient, sender, or automatic notification was introduced.

Each email now includes an order reminder derived only from the accepted, frozen order lines and catalog. Products are listed by quantity and name. Valid frozen pack snapshots list components **per box**, capacities and total piece counts, including distinct mixtures for boxes with the same SKU. Where historical composition is missing or fails validation, the message clearly says that it is unavailable rather than rebuilding it from current inventory. Tricolor single-piece color is shown only when frozen and valid. Price claims are intentionally excluded from status notifications.

The three existing events are:
- `ORDER_PRODUCTION_STARTED`: order preparation, including scheduled delivery/pickup window.
- `ORDER_READY_FOR_PICKUP`: pickup readiness with the existing verified 3L store location.
- `ORDER_OUT_FOR_DELIVERY`: on the way, showing only the delivery **area** where available.

No customer payment-confirmation email is sent by the current application. That is **not** part of this change and would require a separately approved event and checkout/reconciliation tests.

## Design

- Uses approved public Visual Identity V2: `#F6DFE0` blush, `#A28D5B` gold, `#27242D` ink and `#A93C68` raspberry on readable cream/white surfaces.
- Text-based 3L wordmark; no invented photographic assets or unverified external-logo URL.
- Mobile-first fluid 600px maximum-width email-safe tables and inline styles, with responsive adjustments.
- Clear event status, greeting, reference, schedule (including the out-for-delivery email), verified pickup address or delivery area, frozen order contents, and brand footer.
- No unapproved track-order URL, reply-to, customer-service email, promotional CTA, street/building, private phone, surname, payment identifiers or price claims.
- No images, remote assets, external fonts or scripts.
- Escapes all customer and delivery-area HTML-sensitive input; long unbroken strings wrap.

## Technical changes

- `renderCustomerEmail` retains the subject and existing status copy; it additionally returns `html` and appends the frozen order contents to the plain-text fallback.
- Customer notification rows gain backward-compatible optional `html`, persisted with existing idempotency/event keys.
- Dispatcher sends `html` when present for *either* customer or internal notifications, plus the previously frozen `text`. Historical rows without HTML continue sending plain text only.
- Independent recipient configurations, `CUSTOMER_EMAIL_ENABLED`, `OPERATIONS_EMAIL_ENABLED`, `OPERATIONS_EMAIL_TO`, sender identities, Resend keys and provider fail/expiry policy are unchanged.
- Manual `scripts/send-test-email.ts` now includes the actual customer HTML plus a visible *TEST ONLY* watermark. It has no DB access, but only run it with separately authorized recipient/configuration.
- Internal kitchen notifications, including the separate compact-email rollout for three authorized recipients, are not modified by this change.

## Validation and release requirements

**No Production changes or live emails are authorized by this PR.** Before deploying:
1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run scan:secrets`.
2. `npx playwright test --config=playwright.email.config.ts` (Chromium and WebKit; 320/390/1024 mobile/desktop cases). Run alongside the existing kitchen email regressions.
3. Review accessible contrast, long input, XSS escaping, no network requests, event-specific details, and preservation of historical messages.
4. With an explicit separate approval, send three **synthetic** sample emails to one authorized internal test mailbox through the configured customer sender. Inspect iPhone Gmail, Gmail desktop and Apple Mail or Outlook before deployment.
5. After explicit Production approval and controlled release, inspect only the next naturally occurring customer transition. Do not manufacture a payment or send to actual customers to test.
6. For rollback, revert the code release without rewriting or deleting outbox state, provider IDs or historical orders. Existing frozen rows must retain original content and expiry policy.

## Known limits

Browser rendering and axe checks are not an exact simulation of proprietary Gmail/Outlook mail engines. The customer-facing logo remains a branded typographic wordmark until an official verified email-safe asset is approved. Reply routing is not introduced because no approved support mailbox has been confirmed.
