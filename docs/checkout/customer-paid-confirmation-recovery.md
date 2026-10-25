# Customer paid confirmation and safe checkout return

Development only. Founder review is required before merge, deployment or activation.
Baseline: `main` / `d0a94663404930ad0b90595cecad409256eb3f2c` (includes merged PR #61).
The canonical checkout was on the separate `fix/3l-paymennt-new-only-gated` branch at `4bd4cbe`; it was inspected and left unchanged. This PR targets current main, without importing or reverting that branch's independent work. Reconcile any concurrent changes before release.

## Incident and scope

Order #026 was reportedly already paid when a customer returned later and saw “We couldn't load your payment”. `CheckoutReturn` threw before calling `/api/checkout/reconcile` when the sessionStorage capability was missing. Missing storage is not evidence of a lost order or failed payment. The reason storage disappeared is unproven: sessionStorage has no fixed eight-hour expiry. A different tab/browser, closed browsing context, storage restrictions or clearing are possibilities, not established causes.

No inspection, reconciliation, resend or mutation of historical order #026 was performed. All orders and addresses used in tests are synthetic.

## Server-triggered email

`CommerceService.applyCheckout` already validates provider checkout identity, order identity, request ID, currency and amount against its payment record. In its existing first paid transition, after Paid → Confirmed and public-number allocation, it now calls `recordPaidCustomerConfirmation` **inside the same Store.write transaction**. Internal team notifications stay in that transaction and retain their original templates/recipients.

The customer event uses `customer-event:ORDER_PAID:<internal-order-id>` as durable uniqueness marker. Its generated outbox ID is persisted once and reused as Resend's Idempotency-Key. The rendered HTML, text, recipient, total and accepted items/compositions are frozen in the outbox row. It never consults current catalog prices to describe a paid order.

Conditions: explicit activation epoch; order's original first audit timestamp, payment creation and first paid timestamp at or after that cutoff; canonical order/payment relationship; reconciled paid payment; successfully Confirmed order. Missing recipient means no email. Manual state changes cannot generate this event. Pending, failed, cancelled, expired, late payments held for review and already-paid historical orders do not generate it. No startup scan backfills missing events.

The existing background worker dispatches without an Operations visit or customer return. No webhook payload or client navigation is payment authority. The HTTP worker test proves this using a fake Paymennt and fake email provider.

## Delivery semantics

Legacy persisted statuses remain compatible. For new customer ORDER_PAID rows:

| Stored state | Meaning shown to staff |
|---|---|
| pending | Confirmation queued; feature/provider may be disabled |
| sending | A dispatcher claimed this event |
| sent + deliveryOutcome accepted + provider ID | Provider accepted; delivery unverified |
| failed + deliveryOutcome failed | Rejected or deliberately retired before send |
| failed + deliveryOutcome unknown | Outcome uncertain; review required, never blindly resent |

Resend acceptance is **not** delivery. No verified Resend delivery webhook is added in this PR, so no delivered claim is made. Rejection uses the status-only ProviderFailure contract; provider bodies/recipient data are not logged. Timeouts, 5xx, invalid acceptance responses and interrupted sends are treated as uncertain for paid confirmations. Existing internal/progress failure behavior and error message contracts remain compatible.

Each event has at most one automatic send attempt. Pending events older than the existing two-hour delivery window expire. Claims are transactional across Store handles. The 10-second Resend transport timeout remains. Failed/unknown rows are not automatically retried, even beyond a provider's idempotency retention window. Safe manual resend is deliberately not added. Staff must investigate uncertain outcomes through an authorized process before any separately approved send.

Each paid row freezes its activation epoch. A different current epoch suppresses old pending rows; a disabled feature does not dispatch them. Reactivating must use a fresh cutoff. No historical failed/missing emails are replayed.

Operations order detail shows queued/accepted/failed/unknown, last attempt and safe provider message reference. Existing workspace auth continues to gate access. Kitchen/Inbox customer notification labels distinguish provider acceptance too. No tokens, credentials or checkout keys appear there.

## Missing-session fallback and recovery boundary

The client safely reads only the existing UUID capability. Missing, malformed or inaccessible storage displays “Check your order”, states that this does not mean payment failure, discourages paying again and offers support. No order number, phone, email or URL success flag is used to look up private orders. The fallback does not clear the cart, create an order or create a payment. A malformed or rejected capability (400/401/403/404/410) gets the same data-minimizing path.

Existing valid capabilities retain normal server-authoritative reconciliation and payment states. Network/server failures remain recoverable through the existing check-again flow. EN/ES/AR resources cover the new fallback, with existing RTL layout preserved.

**Automatic cross-session recovery is deferred.** The existing capability authorizes checkout operations and has no new expiry/revocation/email-link contract here. Putting it in an email, query string or permanent localStorage would broaden its exposure. A safe follow-up needs a separate random read-only token, hash-only persistence, short explicit expiry, revocation/rotation, rate limiting, anti-enumeration responses, URL/referrer/log minimization and a reviewed email-link exchange flow. It must not authorize payment creation or resend. No such endpoint or token is issued by this PR; 410 is a mocked future rejection case, not evidence that the current capability has a new TTL.

## Activation plan — separate approval required

1. Review this Draft PR and local evidence. Complete native iPhone Safari UAT; WebKit iPhone emulation is not hardware Safari certification.
2. Review integration with any newer main/Production release, especially concurrent service/http changes. Do not deploy an older checkout branch over newer changes.
3. Deploy only after explicit founder authorization, initially with `CUSTOMER_ORDER_PAID_EMAIL_ENABLED=false`.
4. Confirm existing `CUSTOMER_EMAIL_ENABLED`, `RESEND_API_KEY` and `CUSTOMER_EMAIL_FROM` configuration is valid through the normal private configuration channel. Never paste values into logs or docs. No internal recipient changes are required.
5. With separate activation approval, set `CUSTOMER_ORDER_PAID_EMAIL_SINCE` to the agreed fresh ISO UTC/offset instant and `CUSTOMER_ORDER_PAID_EMAIL_ENABLED=true`. Invalid/incomplete configuration fails closed. Do not choose a historical cutoff to backfill.
6. Perform a separately authorized controlled UAT; this PR performs no real payment or customer send. Confirm one newly reconciled order creates one customer event and unchanged internal events; inspect accepted provider reference, not an assumed delivery status.
7. Monitor pending/unknown/failed rows and existing payment/fulfillment behavior. Do not resend #026 or any historical row automatically.

## Rollback

Disable only `CUSTOMER_ORDER_PAID_EMAIL_ENABLED`; keep existing progress/internal email configuration intact. New paid-confirmation creation/dispatch stops while the safe return-page fallback remains useful. Preserve outbox/event markers and provider references. Never restore a Production SQLite backup to undo email code, delete event identities or replay payments. If a binary rollback to code predating this feature is necessary, that old dispatcher does not understand the new paid-event flag. Before downgrading, separately authorize temporarily setting CUSTOMER_EMAIL_ENABLED=false so old code cannot drain new paid rows; this also pauses customer progress emails. Keep OPERATIONS_EMAIL_ENABLED and internal recipients unchanged. Retain all rows, upgrade again to code with event-aware dispatch, then review the pending epochs before re-enabling customer delivery. Use a new activation epoch when reactivating to exclude previous pending rows.

## Production acceptance checklist

- Founder approves exact PR head and target integration.
- Native iPhone Safari missing-session, hosted return and existing paid status checked without a duplicate payment.
- Approved fresh cutoff and customer-email enablement configured privately.
- One newly verified paid order, one frozen customer event, one provider acceptance; no duplicate on signed webhook/reconciliation/refresh/restart.
- Delivery/pickup instructions, AED paid total and pack compositions match accepted snapshots.
- Operations shows acceptance/uncertainty accurately; real delivery is claimed only with verifiable evidence.
- Historical order #026 and existing outboxes remain unchanged.
- Recovery through emailed token remains a separately designed follow-up.

## Visual previews (synthetic data)

- [Pickup email at 390px](customer-paid-previews/email-pickup-390.png)
- [Delivery email at 1440px](customer-paid-previews/email-delivery-1440.png)
- [Missing session at 390px](customer-paid-previews/missing-session-390.png)
- [Missing session at 1440px](customer-paid-previews/missing-session-1440.png)

Browser renders are not screenshots from native Gmail, Apple Mail or an iPhone. New Tagalog Operations labels remain explicit English pending native review; no existing translations are changed.
