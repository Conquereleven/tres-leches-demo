# Hosted checkout recovery V2

Baseline: Production `10a2176583da52890758dad57b9262a8af0e44f2`. This is an isolated proposal, not a Production activation.

## Established defects and incident limits

Previously `heldCheckout` called the synchronous local resume function without a Paymennt GET. A stored pending URL could therefore remain offered even if Paymennt had since expired it. Returning shoppers also always started at fulfillment, despite having a valid saved draft. These are reproducible recovery defects. They do **not** establish the cause of the 27 October customer reports.

The founder confirmed the remembered message “your payment can not be processed” was on the 3L website. Its exact response/code/time is still unknown. The similar handled rejection copy exists in the historical direct-payment adapter and generic UI error presentation; LIVE rejects those direct endpoints. The observed hosted creation and reconciliation requests were 200. No bank decline or hosted-provider failure is inferred from this discrepancy.

The supplied Production order reference is read-only evidence only. The administrative session expired during the follow-up, so no fresh inspection, reconciliation or mutation of that reference was performed. Never put customer details, provider URLs, capabilities or payment references into this PR or its QA artifacts. All committed tests and screenshots use synthetic records.

## Recovery contract

`POST /api/checkout/resume` retains the existing Origin, JSON, rate-limit and capability boundaries. Its asynchronous `recoverWebCheckout` wrapper:

1. Follows the durable successor chain, with cycle/depth protection.
2. Reads the prior checkout from Paymennt through the existing reconciliation service. Provider reference, request/order identity, amount and currency checks remain unchanged.
3. Revalidates saved customer/billing data, date/cutoff/product lead time, coverage/community, minimums, pack eligibility, availability and current server quote.
4. Returns a current payable hosted URL only for a safely resumable pending checkout with the same accepted intent.
5. Returns a processing/review state for authorization or unresolved outcomes. Timeout, invalid provider data and in-flight reconciliation expose no stale URL or fresh key.
6. Reserves one durable `recoveryKey` only for a confirmed failed/cancelled/expired predecessor. Reservation creates **no order, payment, notification or provider checkout**.
7. Creates the replacement only after explicit customer review/payment submission. The creation boundary checks the predecessor again; durable worker/idempotency protections remain authoritative.

Pending hosted checkouts cannot be locally retired simply because the customer changes quantity, composition or fulfillment. The adapter has no documented cancellation capability. An unverified cancellation or the age of a link is not permission to create another charge. Older tests permitting pending hosted retirement now assert the block and confirm provider expiration before replacement.

If today's quote differs from the accepted pending payment amount, recovery returns a review hold with no hosted URL. It never displays a current cart total beside a link for a different amount. The original accepted amount is not rewritten; the capability-protected return page can still show the actual stored payment facts.

The original accepted snapshots and payment amounts remain intact. Terminal reconciliation uses the existing transition back to Building; no kitchen entry or ORDER_PAID notification occurs. A late paid predecessor is held for review by the existing workflow, and blocks an uncreated replacement. Refunds, partial refunds and chargebacks never grant an automatic retry. A distinct cart after a paid purchase retains the existing separate-purchase semantics.

## Browser experience

- Pending: current hosted continuation plus status link, without another creation.
- Expired/failed/cancelled: retained draft opens Review and pay; explicit review checkbox and current amount precede a new hosted attempt.
- Uncertain: clear hold, CHECK AGAIN performs recovery verification, never blindly creates a checkout.
- Invalid saved fulfillment: reopen fulfillment with retained address/customer/cart and a review notice. The selected date is kept; invalid windows cannot advance.
- Refresh/closed tab: same-browser durable capability and draft restore the current attempt; query strings never establish ownership or success.
- EN/ES/AR recovery copy uses the existing locale resources and Arabic RTL.

`checkout-storage.ts` keeps existing session compatibility and adds same-origin local recovery storage. Draft and capability values have a 24-hour expiry, checked/removed when read. No card/token/provider credentials are stored. Drafts include customer/contact/address details, so this is same-browser recovery, not a customer account or shareable tracking link. Paid/cart-clear removes draft copies from both stores; the short-lived capability remains for viewing confirmation. When neither store works, a new payment is blocked before its capability can be lost. Clearing browser storage or switching browsers without the capability still requires support; phone/order-number lookup is deliberately unavailable.

HTTP requests have a 25-second browser deadline. A lost creation response is treated as uncertain, retaining the same idempotency key. Provider GETs retain the adapter's own deadlines. No blind provider creation retry is introduced.

## Validation and release gate

Run after build (some existing Commerce tests read built assets):

```sh
npm run typecheck
npm run lint
npm run build
npm test
npx playwright test --config playwright.incident.config.ts
npm run test:sites
npm run scan:secrets
npm run audit
```

The browser fixture status-control file is allocated in its disposable test directory and injected only into the fake transport. It adds no Production endpoint. Dedicated CI runs Chromium/WebKit without merchant credentials or deployment permissions.

Review the new domain/storage tests, full commercial suites, checkout browser results and synthetic screenshots. Required scenarios include expired/pending/authorized outcomes, closed tabs, invalid dates, provider timeout/mismatch, independent SQLite workers, durable successor reuse, composition preservation, paid immutability and exactly-once ORDER_PAID.

Release recommendation is conditional on passing the exact PR head and founder approval. No migration command, Railway variable, catalog publication or payment activation is needed. A read-only current Paymennt record/error code remains necessary to close the separate customer incident. Do not use a Production retry to obtain that evidence.

## Rollback

No merge/deploy is authorized by this task. After a separately approved release, roll code back through the normal reviewed release process; do not restore SQLite or modify historical amounts. `recoveryKey` is additive optional metadata. Older code can ignore it, but re-enables the old recovery behavior, so pause customer retry instructions during rollback. Preserve pending/paid records and do not resend emails or regenerate hosted links. Never remove a historical payment to reset recovery.
