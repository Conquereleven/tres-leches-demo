# Paymennt support inquiry: customer emails from `/checkout/web` (DRAFT, not sent)

**Status: CLOSED, never sent.** Founder decision, 31 October 2026: Paymennt's customer payment receipt stays enabled and unchanged. Do not modify the checkout request, dashboard, configuration, credentials or receipts. Kept for the record only.

## Why this inquiry is needed

- Paymennt's official API documentation could not be read from the engineering environment (`docs.paymennt.com` is blocked by its network policy). The public pages found, the FAQ and the payment-link and receipt marketing pages, state that every payment has a shareable digital receipt. They document no parameter or setting that controls customer emails for `/checkout/web`.
- Our integration sends `sendEmail: false` and `sendSms: false` only on `/checkout/link`. Nothing shows that the same field exists on, or affects, `/checkout/web`. It must not be assumed to suppress receipts.
- Before sending, someone with access should first check the Paymennt merchant dashboard (settings or notifications), which may already offer a customer-receipt toggle. If it does, this inquiry is unnecessary.

## Message to send (after approval)

> **Subject:** Customer email notifications for Web Checkout (`/checkout/web`)
>
> Hello Paymennt team,
>
> We use the Web Checkout API (`POST /checkout/web`) for our online store. We pass `customer.email` and our internal `orderId`. After a successful payment, our customers receive an email from Paymennt that shows that internal order reference. We send our own branded order confirmation, so we would like to understand our options.
>
> 1. Does `/checkout/web` send emails (and/or SMS) to the customer? Which events trigger them (payment success, failure, refund)?
> 2. Is there a supported request parameter for `/checkout/web` that disables these customer notifications? Is `sendEmail` / `sendSms`, as documented for `/checkout/link`, supported on `/checkout/web`, and does it also cover the payment receipt?
> 3. Alternatively, is there a merchant dashboard setting that disables customer receipts for API checkouts? Does it apply to TEST and LIVE separately?
> 4. Would disabling customer emails affect merchant notifications, webhooks/notifications to our server, refund or dispute communications, or any compliance requirement for the cardholder receipt?
> 5. If customer receipts cannot be disabled, can the order reference shown to the customer be a separate display value, without changing the `orderId` we use for reconciliation?
>
> Merchant account: _[merchant ID / account name, filled in by the founder]_
>
> Thank you.

## After the answer

- **Supported request parameter:** add it to `createWebPayment` in a separate, reviewed PR with TEST validation first. A LIVE change needs explicit founder authorization.
- **Dashboard setting:** a founder-authorized change in the merchant portal, done in TEST first if the portal separates environments.
- **Neither is possible:** keep the receipt. Optionally ask about question 5.
