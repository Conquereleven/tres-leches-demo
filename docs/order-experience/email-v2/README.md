# Customer email flow V2 — two automatic emails

Founder decision, 31 October 2026: each newly paid order receives exactly two automatic customer emails, triggered by time slot. No kitchen or operator step is involved.

**Status: implemented behind a flag, not activated.** No real email, provider change, merge or deploy.

## The two emails

| | Email 1 · Order confirmed | Email 2 · Scheduled window started |
|---|---|---|
| Event | `ORDER_PAID` (`flow: "v2"`) | `ORDER_SCHEDULED_WINDOW_STARTED` |
| Recorded | In the authoritative paid+confirmed reconciliation transaction | The same transaction, with a durable `dueAt` |
| Sent | As soon as the dispatcher runs | At `dueAt`: the start of the accepted slot, Asia/Dubai |
| Pickup copy | Order confirmed; pickup date/window and location | "Ready for pickup": the window has started and the order is ready for collection |
| Delivery copy | Order confirmed; delivery date/window and area | "Your delivery window has started": please be available. Never claims courier dispatch |
| Contents | Public order number, items with reviewed English names, quantities, pack composition, line prices, subtotal and fee (only if they reconcile), total paid | Same summary |
| Never included | Internal `TL-…` id, kitchen warnings, admin links, payment or provider identifiers, street address, phone | Same |

Slot start times (`shared/commerce-policy.ts` `DELIVERY_WINDOWS`):

| Slot | Email 2 due (Dubai) |
|---|---|
| 8:00 AM – 1:00 PM | 08:00 |
| 1:00 PM – 4:00 PM | 13:00 |
| 4:00 PM – 9:00 PM | 16:00 |

The schedule comes only from the stored order fields (`delivery.date`/`slot` or `pickup.pickupDate`/`preferredTime`), never from comments or the browser clock. Checkout already accepts only these three labels.

Previews (illustrative data) are in this folder: `confirmed-delivery`, `confirmed-pickup`, `window-pickup` and `window-delivery`, as `.html` and `.txt`, with screenshots at 375 and 1024 px. There is no horizontal overflow at 320, 375 or 1024 px. The design follows the approved internal order email: a wordmark header, a serif title, a Product/Qty/Price panel, gold rules and a paired schedule block. Customer emails are English only, as before; no ES/AR email copy exists.

## Before / after: what a customer receives

| Moment | Today (legacy, when enabled) | V2 |
|---|---|---|
| Payment verified | `ORDER_PAID` "is confirmed!" (if `CUSTOMER_ORDER_PAID_EMAIL_ENABLED`) | Email 1, branded "Order Confirmed" |
| Operator: Confirmed → Production | "is now being prepared" | **none** |
| Operator: Production → Ready (pickup) | "is ready for pickup" | **none** |
| Operator: Ready → Out for Delivery | "is on the way" | **none** |
| Slot start | none | Email 2 |
| Internal team emails / WhatsApp | unchanged | unchanged |

OMS state changes work exactly as before. Progress emails are suppressed for every order enrolled in V2, **permanently**: turning V2 off or changing its epoch never brings them back for that order, so an enrolled customer can never receive a third email. Orders paid before the epoch keep the legacy behaviour.

## Safety rules implemented

- **Flag and epoch.** `CUSTOMER_EMAIL_V2_ENABLED=true` plus `CUSTOMER_EMAIL_V2_SINCE=<ISO UTC>` (a fresh epoch), and it requires `CUSTOMER_EMAIL_ENABLED=true`. Invalid configuration fails at startup. An order is enrolled only if it was created, charged and paid after the epoch: no backfill and no replay.
- **One of each per order.** Each email is keyed per (event, order), recorded atomically with the paid transition. Duplicate webhooks and reconciliations add nothing, and V2 takes the single `ORDER_PAID` slot, so the legacy confirmation never duplicates it.
- **Survives restarts.** Rows live in SQLite. A row left `sending` by a crash becomes `failed` with outcome `unknown` and is never resent automatically. The row id is the Resend `Idempotency-Key`.
- **No early expiry.** A scheduled row ages from its `dueAt`, not from when it was queued, so tomorrow's email is not expired by the two-hour rule.
- **30-minute grace.** A window email that could not go out within 30 minutes of the slot start is not sent. It is marked "Late …", with an audit "operational exception" entry, and Operations shows "No enviado · fuera de tiempo".
- **Re-checked at send time, in the claiming transaction.** If any of the following holds, the email is not sent and the reason is recorded:
  - the order is cancelled;
  - the payment is no longer `paid` (refund, partial refund, chargeback or review);
  - the stored schedule changed (no rescheduling flow exists; any change is treated as not eligible);
  - the recipient changed or is missing.
- **Missing recipient** at payment: nothing is queued and an audit line is written.
- **Invalid or missing schedule:** Email 1 is still sent, and Email 2 is recorded as failed "Invalid or missing schedule; not scheduled", visible in Operations.
- **Unknown provider outcome:** recorded as `unknown`, never retried blindly.
- **Rollback.** Turning the flag off holds V2 rows: they are not sent and expire. Re-enabling with a new epoch never releases old rows ("Expired activation window"). Enrolment is permanent, so legacy progress emails never resume for an enrolled order.

## The automatic `TL-…` email: provider findings

The application's own customer emails never contain the internal `TL-…` id: they use the public `#NNN` number. The `TL-…` email therefore does not come from this code path. Code inspection:

- `/checkout/link` (payment links) explicitly sends `sendEmail: false, sendSms: false`.
- `/checkout/web` (the live web checkout) sends `orderId: TL-…`, a description, `customer.email` and line items, and does **not** send `sendEmail: false`.

Paymennt therefore most likely emails its own payment receipt, showing `TL-…`, to the customer address it receives. To confirm, compare the sender domain of the `TL-…` email (Paymennt versus our Resend `CUSTOMER_EMAIL_FROM`).

Supported suppression options, **none applied**:

1. A merchant-dashboard setting for customer payment receipts or notifications, if Paymennt offers one.
2. A documented `/checkout/web` parameter equivalent to `sendEmail: false`. This must be confirmed in Paymennt's API documentation or with Paymennt support first: an unverified field could be rejected by a LIVE checkout.

Both are changes to the live provider and need explicit founder authorization.

Official documentation could not confirm either option (31 Oct 2026: `docs.paymennt.com` is unreachable from the engineering environment, and the public pages say nothing about suppressing receipts). A support inquiry is prepared for founder approval, not sent: [`paymennt-receipt-inquiry.md`](paymennt-receipt-inquiry.md).

## Activation plan (requires founder GO)

1. Merge this PR, deploy it with the flag **off**, and confirm nothing changes. No new rows appear; OMS and internal emails behave the same.
2. Confirm `CUSTOMER_EMAIL_ENABLED=true` and the Resend sender are already working in Production. Decide whether to keep `CUSTOMER_ORDER_PAID_EMAIL_ENABLED`; it is harmless, because V2 takes precedence for enrolled orders.
3. Set `CUSTOMER_EMAIL_V2_ENABLED=true` and `CUSTOMER_EMAIL_V2_SINCE` to a timestamp **after** the deploy, for example the next full minute (UTC ISO), then redeploy.
4. Observe the next natural paid order:
   - Email 1 is accepted;
   - Email 2 shows "Programado …" in Operations and is accepted at the slot start;
   - no progress email follows the operator's transitions.

   No synthetic LIVE charges.
5. **Rollback:** set `CUSTOMER_EMAIL_V2_ENABLED=false` and redeploy. New orders return to the legacy flow. Already enrolled orders keep the V2 policy: their pending V2 emails are held and expire, and they receive no legacy progress emails. No data rollback; existing rows and event identities are kept.
