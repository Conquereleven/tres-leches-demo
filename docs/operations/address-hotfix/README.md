# Paid-order address and internal email hotfix

Order cards show the stored full address, street/address, building/villa, apartment/unit, date, time, customer instructions and delivery notes. The community is supplementary. Missing required street/building fields trigger an incomplete-address alert; a complete legacy/manual address remains checkout-eligible and is clearly unverified. Pickup does not require a delivery address.

Checkout retains its current zones, minimums, scheduling and pickup rules. Both the address validation endpoint and final delivery checkout trim and validate required street/building fields; whitespace and punctuation-only placeholders are rejected. Unit remains optional because standalone villas may have none. This patch does not infer or rewrite a customer's address or any accepted order.

## Prospective internal paid-order email

Uses the existing Resend adapter and durable dispatcher with a separate `operationsEmailNotifications` outbox. Rows are created only in the existing authoritative paid transition, one per configured recipient, and freeze snapshot product names/prices, quantities, total paid, full address, zone, date/time, verification, original instructions and Operations link. Email rendering does not use mutable catalog prices. Unknown descriptions/absent snapshots are clearly flagged.

Configuration, supplied privately to the application environment:

- `OPERATIONS_EMAIL_ENABLED=true`
- `OPERATIONS_EMAIL_TO`: comma-separated approved internal recipients
- `RESEND_API_KEY`: existing private Resend key
- `OPERATIONS_EMAIL_FROM`: approved verified sender, or reuse `CUSTOMER_EMAIL_FROM`
- `APP_ORIGIN`: existing canonical origin for the direct Operations link

Customer email enablement remains independent. Incomplete explicitly enabled configuration fails closed. No recipients are invented or taken from customer details. No real recipients or credentials are committed. Workspace exposes status/attempts only, not internal recipients or email bodies.

No backfill: disabled internal alerts create no email rows; re-reconciliation of an already paid order cannot create one. Pending events expire after two hours; interrupted/ambiguous sends are failed for manual review, never blindly resent. Claim-before-send plus the outbox ID as Resend idempotency key protects concurrent/repeated dispatch. Sent rows retain provider message ID and timestamps; failures retain a generic error without provider response or PII logs.

The Production inspection was strictly read-only. The running container reported no Resend key, sender or customer email enable flag, and no internal email configuration. Resend account read-only inspection also reports `mail.3ldubai.ae` as `failed` with failed DKIM/SPF verification. This patch prepares the feature; activation requires approved deployment and private configuration. It sends no historical alert, including the reported order, and makes no Production changes.

## Evidence

All QA uses synthetic customers, fake email/payment providers and disposable databases. Screenshots:

- [Chromium mobile](screenshots/chromium-address-390.png)
- [Chromium desktop](screenshots/chromium-address-1440.png)
- [WebKit mobile](screenshots/webkit-address-390.png)
- [WebKit desktop](screenshots/webkit-address-1440.png)

Tests cover complete/unverified/missing addresses, pickup, stored domicile and notes, confirmed email, duplicate callbacks and concurrent dispatch, no historic backfill, expired/interrupted events, configuration gates, zones and checkout regressions. No provider calls or live transactions are used.

Final QA: typecheck, lint, build passed; 536/536 commercial/unit/integration tests; 54/54 Operations Chromium/WebKit; checkout Chromium 19/19 and WebKit 19/19; focused email/config tests 29/29; Sites 4/4; secret scan zero findings; npm audit zero vulnerabilities. Browser fixtures cover both 390px and 1440px; no horizontal overflow or page errors.
