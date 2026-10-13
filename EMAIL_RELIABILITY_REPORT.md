# Email reliability audit — Resend and automatic notifications

Branch `audit/3l-email-reliability`, from `origin/main` `def0c1f`. 13 October 2026.

Scope: code, tests and repository documents only. No email was sent, no provider
was called, Railway and the Production database were not queried, nothing was
deployed or enabled. All tests use fake providers and in-memory stores.

**Result in one paragraph.** The email path is safe by construction: nothing is
queued before a payment is verified against the provider, every email is one
durable row keyed by order and event, and no row can be sent twice. The price of
that safety is that delivery is *at most once*: any failure, including a
one-second provider blip, permanently ends the row as "failed", and there is no
retry, automatic or manual. No defect was confirmed, so no production code was
changed. Nine characterisation tests were added. The recipient
`golojlt@gmail.com` is not in the repository in any form; it can only exist as
private configuration and needs the owner's verification.

---

## 1. Architecture

| Piece | Where | Role |
|---|---|---|
| Customer outbox | `server/domain/customer-notifications.ts` | `recordCustomerEvent` (l.117) writes a row; `dispatchCustomerNotifications` (l.186) delivers; `recoverInterruptedCustomerNotifications` (l.248) runs at boot |
| Internal outbox | `server/domain/operations-email.ts` | `recordPaidOperationsEmail` (l.15) writes one row per recipient; delivery reuses the customer dispatcher with `collection = "operationsEmailNotifications"` |
| Provider | `server/adapters/resend.ts` | `ResendEmailProvider.send` (l.24): `POST https://api.resend.com/emails`, plain text, 10 s timeout, row id as `Idempotency-Key` |
| Configuration | `server/adapters/resend.ts` | `resendFromEnv` (l.55), `operationsEmailConfig` (l.66) |
| Wiring | `server/http.ts` | providers built l.234–243; worker every 300 ms l.1199–1222; workspace projection l.960–973 |
| Row types | `server/domain/model.ts` | `CustomerNotification` l.205, `OperationsEmailNotification` l.229 |
| Operations view | `src/commerce/order-view.ts` | `orderNotifications` l.534, `orderActivity` l.436; older card in `src/commerce/Workspace.tsx` l.1533 |
| Manual test command | `scripts/send-test-email.ts` | one `[TEST]` message, no database (not run in this audit) |
| Internal WhatsApp (separate) | `server/domain/notifications.ts` | same ORDER_PAID trigger, own outbox; not changed or exercised here |

The worker is one chain per tick: `service.drain()` → WhatsApp alerts →
customer emails → internal emails, guarded by a single `working` flag
(`server/http.ts` l.1197–1227). Rows are sent one after another.

## 2. Event → email matrix

| Event | Trigger (exact write point) | Recipient | Applies to | Row written when |
|---|---|---|---|---|
| `ORDER_PAID` (internal) | `CommerceService.applyCheckout`, branch `p.status === "paid" && !p.paidAt` and order `Awaiting Payment` (`server/domain/service.ts` l.1118–1143) | each address in `OPERATIONS_EMAIL_TO` | delivery and pickup | same transaction that makes the order Paid → Confirmed and issues the public number |
| `ORDER_PRODUCTION_STARTED` | operator `transition` Confirmed → Production (`service.ts` l.570–573) | customer's checkout email | delivery and pickup | same transaction as the transition |
| `ORDER_READY_FOR_PICKUP` | Production → Ready | customer | pickup only | same transaction |
| `ORDER_OUT_FOR_DELIVERY` | Ready → Out for Delivery | customer | delivery only | same transaction |

Nothing else creates an email. In particular there is **no customer email on
payment**, none on Delivered, Cancelled, refund, or any change to an order, and
no internal email for anything except a newly paid order.

Rows are written whether or not a provider is configured for customer events.
Internal rows are written only when `OPERATIONS_EMAIL_ENABLED=true` at the
moment of payment, because the recipient list is empty otherwise
(`http.ts` l.240, `operations-email.ts` l.27).

## 3. Verified-payment condition

`recordPaidOperationsEmail` is called from one place only, inside
`applyCheckout`. Every caller of `applyCheckout` passes a status obtained from
the provider by the server:

- `reconcile` → `payment.getCheckout` / `findCheckout` (`service.ts` l.937–1041).
  Used by the operator's reconcile action, the web return page and the webhook.
- embedded checkout → the server's own debit response or `getPayment`
  (`server/domain/embedded-checkout.ts` l.213, l.283).

A webhook is only a prompt to look: `acceptPaymentNotification` stores a
receipt and calls `reconcileNotification`, which performs the GET
(`service.ts` l.807–935). Before applying, `applyCheckout` also requires the
checkout id, request id, order id, amount and currency to match (l.1052–1061).
The recorder then re-checks `payment.status === "paid"`, both `paidAt` values
and the order/payment pairing (`operations-email.ts` l.22–29).

| Scenario | Outcome | Evidence |
|---|---|---|
| Order placed, not paid | no row | test "no email is queued by placing an order…" |
| Customer returns from the hosted page, provider still PENDING | no row | same test |
| Signed notification says PAID, provider GET says PENDING | no row, order stays Awaiting Payment | same test |
| Recorder called with an unpaid payment | returns `[]`, leaves no marker | same test |
| Verified PAID | exactly one row per recipient | same test |
| Verified PAID reconciled again, webhook replayed | no further row | same test; existing "new authoritative paid order queues one internal email…" |

Customer emails need an operator transition, which itself requires the payment
to be `paid` (`service.ts` l.538–545), so they cannot precede payment either.

The older `paymentWebhook` path (`service.ts` l.728) marks an order paid
without queuing any email. It is reachable only with `APP_ENV=test` and a
non-Paymennt provider (`http.ts` l.681–683, l.750); it is not a Production path.

## 4. Idempotency, duplicates and failures

### Guards

1. **One row per (order, event).** `state.events["customer-event:<EVENT>:<orderId>"]`
   and `state.events["operations-email-paid:<orderId>"]`, set in the same
   SQLite transaction as the row.
2. **Linear state machine.** No state can be re-entered (`server/domain/workflow.ts`),
   so a transition cannot repeat even without guard 1.
3. **`paidAt` guard.** The paid branch runs once per payment.
4. **Claim before send.** A row moves `pending → sending` in its own
   transaction before the network call (`customer-notifications.ts` l.211–219);
   a second dispatcher finds it not pending and skips.
5. **Provider key.** The row id is sent as `Idempotency-Key`.

### Scenarios

| Scenario | What happens | Email sent | Row ends as |
|---|---|---|---|
| Webhook replayed, reconcile repeated | guards 1 and 3 | once | unchanged |
| Operator double-clicks, request retried | command idempotency + guard 1 | once | unchanged |
| Two dispatch passes at the same time | guard 4 | once | `sent` |
| Resend answers 429 or 5xx | caught, never retried | **no** | `failed`, attempts 1 |
| Resend answers 4xx (bad key, unverified sender, invalid address) | same | no | `failed` |
| Timeout after 10 s or network error | same; the true outcome is unknown | maybe | `failed` |
| HTTP 200 with an unreadable body | treated as an error | probably yes | `failed`, no message id |
| Process dies between claim and provider answer | boot marks it failed (`http.ts` l.236–243) | maybe | `failed` "Interrupted while sending" |
| Process dies after Resend accepted, before the local commit | same as above | **yes** | `failed` — shown as failed although delivered |
| Graceful stop (SIGTERM) mid-send | shutdown waits for the worker (`http.ts` l.1243–1256) | once | `sent` |
| No provider configured | dispatcher returns before reading rows | no | stays `pending` |
| Provider enabled later | rows older than 2 h retired first, newer ones sent | only rows under 2 h | `failed` "Expired…" / `sent` |
| The store write after a successful send throws | chain aborts, logged as `worker.failed` | yes | stays `sending` until the next restart |

Two consequences:

- **Duplicates: none found.** There is no code path that sends a row twice.
  Because a failed row is never attempted again, the `Idempotency-Key` is in
  practice never reused; it is a second line of defence only.
- **Losses: any failure is final.** `attemptCount` never exceeds 1. There is no
  backoff, no maximum, no retry command and no retry button (`retryJob` in
  `service.ts` l.260 covers WhatsApp/payment jobs only). The stored texts say
  "review before resending", but nothing in the product can resend.

### Expiry

`CUSTOMER_EMAIL_MAX_AGE_MS` = 2 hours, measured from `createdAt`, applied to
`pending` rows only and only while a provider is configured
(`customer-notifications.ts` l.185–207). It applies to both outboxes.

## 5. State of a notification row

```
                 recordCustomerEvent / recordPaidOperationsEmail
                                   │
                                   ▼
        ┌──────────────────────► pending ───────────────┐
        │  (no provider: rests here indefinitely)        │ provider set and
        │                          │ claimed             │ older than 2 h
        │                          ▼                     ▼
        │                       sending ──────────► failed (terminal)
        │                          │   error, timeout,     "Expired…"
        │                          │   or found at boot    "Delivery failed…"
        │                          ▼                       "Interrupted…"
        │                        sent (terminal)
        └─ never: no transition leads back to pending
```

Stored per row: `id`, `event`, `orderId`, `publicOrderNumber`, `recipient`,
frozen `subject` and `body`, `status`, `attemptCount`, `createdAt`,
`provider`, `lastAttemptAt`, `sentAt`, `providerMessageId`, `lastError`;
internal rows add `paymentId`. Each queued row also adds an audit entry.

Not stored: the HTTP status or failure class (the `catch` discards the error,
l.236), and anything after acceptance. There is no Resend webhook, so
**"sent" means "accepted by Resend's API"**, not delivered; bounces, complaints
and suppressed addresses are invisible to the application.

### What Operations shows

`orderNotifications` (`src/commerce/order-view.ts` l.566–601):

| Row | Label |
|---|---|
| `sent` | Enviado |
| `failed`, error starts with "Expired" | No enviado · caducó |
| `failed`, other | Falló · revisar |
| `sending` | Enviando |
| `pending`, provider configured | Pendiente |
| `pending`, no provider | Pendiente · proveedor de email no configurado |

"Sent" always has provider evidence in practice: the only code that sets
`sent` also sets `sentAt` and a schema-checked `providerMessageId`
(`customer-notifications.ts` l.229–235). The view itself tests `status` only;
`orderActivity` additionally requires `sentAt`. The workspace returns internal
rows without recipient, subject or body (`http.ts` l.964–973); customer rows are
returned whole, including recipient and body, to every signed-in workspace user
— the same users already receive the full order with `customerDetails`.

The message id is stored but not shown, and failure reasons are not shown.

## 6. Recipients

| Variable (name only) | Purpose |
|---|---|
| `CUSTOMER_EMAIL_ENABLED` | must be exactly `true` to send customer emails |
| `OPERATIONS_EMAIL_ENABLED` | must be exactly `true` to queue and send internal emails |
| `RESEND_API_KEY` | shared by both |
| `CUSTOMER_EMAIL_FROM` | sender; "Name <address>" or a bare address |
| `OPERATIONS_EMAIL_FROM` | optional internal sender; falls back to the customer sender |
| `OPERATIONS_EMAIL_TO` | comma-separated internal recipients |

- Customer recipient: the email typed at checkout, validated there
  (`z.email().max(254)`, `server/domain/web-checkout.ts` l.179). An order with
  no email records no event.
- Internal recipients: trimmed, exact duplicates removed, each validated as an
  email, between 1 and 20 (`resend.ts` l.68–79). One row and one API request
  per recipient, so recipients never see each other and one refusal does not
  affect the rest.
- Enabled with zero or invalid recipients, or without key or sender: the
  function throws and **the server does not start** (`server/main.ts` prints a
  generic line and exits). The rejected value is not echoed.
- Any value other than the exact string `true` means disabled, silently.
- Only a comma separates addresses. A semicolon makes the list invalid.
- De-duplication is case-sensitive: `Ops@…` and `ops@…` are kept as two
  recipients and would produce two emails to one mailbox.
- The list is read at start-up and frozen into each order's rows at payment.
  Adding a recipient affects only orders paid after the restart; nothing is
  backfilled.

### Status of `golojlt@gmail.com`

| Place | Present |
|---|---|
| Source (`server/`, `src/`, `shared/`, `scripts/`) | No |
| Tests and fixtures | No |
| Documentation | No |
| `.env.example` | No (it lists the variable name with a placeholder) |
| Any commit on any branch (`git log --all -S`) | No |

This is the intended design: recipients are private configuration and
`.env.example` says not to commit real ones. The address can therefore only
live in `OPERATIONS_EMAIL_TO` in the hosting environment.

**Requires owner verification in private configuration.** Railway was not
queried: the available variable listing can return values in plain text
depending on the session, so no names-only method could be guaranteed.
`docs/operations/paid-whatsapp/PRODUCTION_READINESS.md` (l.41) records an
earlier names-only inventory in which `RESEND_API_KEY`,
`OPERATIONS_EMAIL_ENABLED`, `OPERATIONS_EMAIL_FROM` and `OPERATIONS_EMAIL_TO`
were present by name in Production; whether the address is among the values
was not, and has not been, checked. `docs/operations/address-hotfix/README.md`
(l.23) also records the Resend domain `mail.3ldubai.ae` as failing DKIM/SPF
verification at that time. Neither statement was re-verified here.

To add the address, the owner appends it to `OPERATIONS_EMAIL_TO`
(comma-separated, lower case) and restarts. No code change is needed.

## 7. Templates and content

**Customer** (`renderCustomerEmail`, `customer-notifications.ts` l.50–110)

| Event | Subject | Body |
|---|---|---|
| Production started | `Your 3L order #001 is now being prepared` | greeting, one sentence, date and window, sign-off |
| Ready for pickup | `Your 3L order #001 is ready for pickup` | greeting, date and window, pickup point address, sign-off |
| Out for delivery | `Your 3L order #001 is on the way` | greeting, delivery area name only, sign-off |

- English only, whatever language the customer used on the site. AGENTS.md
  forbids changing customer notification language as part of Operations
  localisation, so this needs its own decision.
- Plain text only. No HTML part, no links, no logo.
- Personal data: first name, order number, schedule and area. No street,
  building, phone, email, surname or internal id (pinned by a new test).
- Orders paid before public numbers existed show the internal `TL-…` id.
- No support contact: `business.email` is still an open owner input
  (`src/brand/business.ts` l.31), and no `reply_to` is sent, so replies go to
  the sender address, for which no mailbox exists
  (`docs/infra/post-release-oct-2026.md`).
- The body is frozen when the event is recorded.
- The first name is the customer's own text, up to 60 characters, inserted as
  is. It is plain text sent to the address the same person typed; low risk.

**Internal** (`operations-email.ts` l.69–96)

- Subject `New paid 3L order #001`. Body: reference and internal id, customer
  name, phone, email, WhatsApp, lines with English operations names, unit and
  line prices from the order snapshot, total paid, method, date, time, full
  address fields or pickup point, address verification status, customer
  instructions and delivery notes, link.
- This is a complete personal-data record sent to external mailboxes. With a
  consumer mailbox as recipient, retention and access are outside the system.
- The link is `<APP_ORIGIN>/operations/orders?order=<id>`. That is the earlier
  form: the app rewrites it in the browser to `/operations/orders/<id>`
  (`parseOperationsPath`, `order-view.ts` l.606; `Workspace.tsx` l.42). It
  works, pinned by a new test, but it depends on a client-side rewrite.
- Customer free text (instructions, notes) is included verbatim. Mail clients
  turn URLs in plain text into links, so a customer can place a clickable link
  in a staff email.

**Unsubscribe.** These are transactional messages tied to an order, so no
unsubscribe link is required for them. The proposed follow-up in section 9.3
is different: asking for a review is promotional in most readings and needs
consent and an unsubscribe route.

## 8. Findings

### Confirmed defects

None. No behaviour was found that contradicts the documented design and can be
shown with a failing test, so no production code was changed.

### Risks (by priority)

| # | Risk | Effect | Evidence |
|---|---|---|---|
| R1 | No retry of any kind | A 429, a 5xx or a brief outage permanently loses the alert or customer email; staff can only notice the "Falló · revisar" label on that order's page | test "a rate limit, a provider outage and a timeout each end as failed…" |
| R2 | Failure reason is discarded | A wrong key, an unverified sender and a rate limit look identical; diagnosing activation problems needs the Resend dashboard | same test (`lastError` is the generic text) |
| R3 | Nobody is told when emails fail | No log line, counter, readiness item or list filter for failed emails; a broken sender could go unnoticed across many orders | `customer-notifications.ts` has no logging; `server/readiness.ts` has no email entry |
| R4 | Late payment announces nothing | Money received for an order that is no longer awaiting payment produces no email and no WhatsApp alert, only a payment timeline entry | test "a payment confirmed after its checkout expired…" |
| R5 | A bad email setting stops the whole site | Enabling with a typo in the recipient list or sender prevents start-up, checkout included | `resend.ts` l.57, l.68–84; `main.ts` |
| R6 | "Sent" is acceptance, not delivery | Bounces and spam complaints are invisible; Gmail may also junk mail from a new sending domain | no Resend webhook exists |
| R7 | Delivered but shown as failed | Crash or unreadable answer after acceptance; a person "resending" by hand would duplicate | test "an accepted request whose answer cannot be read…" |
| R8 | Shared worker | Each failing send can hold the worker up to 10 s; WhatsApp alerts and webhook reconciliation wait behind a backlog. Web checkout drains on its own, so payment creation is not blocked | `http.ts` l.1199–1222; `web-checkout.ts` l.895 |
| R9 | Full state read every 300 ms per outbox, rows never pruned | Cost grows with history | `customer-notifications.ts` l.196–210 |
| R10 | Case-variant duplicate recipients | Two emails to one mailbox | verified by a scratch run, not pinned |
| R11 | A row can stay `sending` until restart | Only if a store write fails right after a send | by reading; not reproduced |
| R12 | Older order card ignores expiry for internal rows | Shows "Falló · revisar" where the order page shows "caducó" | `Workspace.tsx` l.1574–1582 vs `order-view.ts` l.572 |

### Non-issues (checked)

- Email before verified payment: not possible (section 3).
- Duplicate sends from replays, double clicks, concurrency or restarts: not possible (section 4).
- A backlog released when the provider is switched on: prevented by the 2-hour rule.
- Recipients, sender or key in source: none; the secret scan reports 0 findings.
- Provider error text or addresses in stored errors or logs: none; only generic text is stored.
- Internal recipients exposed to the browser: not returned by the workspace.
- Header injection: the provider call is JSON; subjects contain only the order reference.

## 9. Proposed automations (design only — nothing implemented or enabled)

All three reuse the existing outbox, dispatcher and adapter. Each has its own
flag, off by default, and each row keeps the (order, event) key.

### 9.1 Buyer order confirmation on verified payment

| | |
|---|---|
| Trigger | inside the existing paid branch of `applyCheckout`, next to the internal alert |
| Event / key | `ORDER_CONFIRMED`; `customer-event:ORDER_CONFIRMED:<orderId>` |
| Guards | same as the internal alert: payment `paid`, both `paidAt`, order was `Awaiting Payment`, pairing matches; customer email present; never for the late-payment branch; no backfill for orders already paid |
| Flag | `CUSTOMER_ORDER_CONFIRMATION_ENABLED`, in addition to `CUSTOMER_EMAIL_ENABLED` |
| Template | subject `We received your 3L order #001`; first name; lines and quantities from the order snapshot; total paid; method, date and window; area name (delivery) or pickup point; what happens next; no full address, no payment details |
| Failure | at most once, as today, until R1 is addressed; 2-hour expiry |
| Needs | founder approval of wording; decision on language; a support contact; Paymennt's own receipt checked to avoid two near-identical emails; the paid branch is next to payment reconciliation, so the Codex team must agree to the one-line call |

### 9.2 Order-change notifications

| | |
|---|---|
| Trigger | there is no command today that changes a paid order's date, window, address or lines, and paid orders cannot be cancelled in the workflow. The events must exist first |
| Event / key | `ORDER_RESCHEDULED`, `ORDER_CANCELLED`, `ORDER_REFUNDED`; key must include a revision, e.g. `customer-event:ORDER_RESCHEDULED:<orderId>:<order.version>`, because a change can legitimately happen more than once |
| Guards | order paid; the value actually differs; written in the same transaction as the change; refund events only from a provider-verified status |
| Flag | `CUSTOMER_ORDER_CHANGE_EMAIL_ENABLED` |
| Template | what changed, old and new value, order number, how to reach 3L |
| Failure | as 9.1; a superseded pending row should be retired rather than sent after a newer one |
| Needs | the change commands themselves (state machine and payment code are outside this audit's remit); approved refund and cancellation wording; a support contact |

A smaller first step that needs no new command: an internal-only
`PAYMENT_NEEDS_REVIEW` email for the late-payment branch (R4) and for refund or
chargeback statuses, keyed by payment id.

### 9.3 Post-order follow-up

| | |
|---|---|
| Trigger | order reaches Delivered (or pickup collected); row written then with a `notBefore` time, for example the next day at 11:00 Dubai |
| Event / key | `ORDER_FOLLOW_UP`; `customer-event:ORDER_FOLLOW_UP:<orderId>`; additionally at most one per customer email per 30 days |
| Guards | order not refunded or disputed at send time (re-checked when sending, not only when queued); consent recorded; address not suppressed |
| Flag | `CUSTOMER_FOLLOW_UP_ENABLED` |
| Template | thanks, one question or a review link, how to report a problem, unsubscribe link |
| Failure | at most once; never retried after the window passes |
| Needs | the dispatcher must learn `notBefore` and must not apply the 2-hour expiry to scheduled rows; a consent checkbox at checkout and a suppression list (neither exists); legal review, since this is marketing rather than transactional; `List-Unsubscribe` headers, which the adapter does not send today |

### 9.4 Reliability improvements, in suggested order

1. Keep the failure class on the row (`http-429`, `http-5xx`, `http-4xx`, `timeout`, `interrupted`) — no personal data involved.
2. Automatic retry only for definite non-acceptance (429, 5xx): same row id as idempotency key, 3 attempts, backoff 1/5/15 min, inside the 2-hour window. Timeouts and interrupted rows stay manual. Resend keeps idempotency keys for a limited period, so the window must stay well inside it.
3. A manager/admin "send again" action for failed rows, with a warning on unknown-outcome rows.
4. One log line and a readiness entry for failed or stuck rows; a "notification failed" filter in the orders list.
5. Resend webhook (delivered, bounced, complained) with signature verification, to turn "accepted" into "delivered".
6. `reply_to` from configuration; the new `/operations/orders/<id>` link in the internal email; case-insensitive recipient de-duplication.
7. Report configuration errors through readiness instead of blocking start-up, or validate before deploy.
8. Run email dispatch on its own timer so it cannot delay the other workers.

Items 2, 3 and 5 change what is sent or add an endpoint and need approval.

## 10. Activation checklist for Production

To be done by the owner, privately, in this order. Stop at any step that does
not give the expected result.

1. **Domain.** In Resend, confirm the sending domain shows verified (DKIM, SPF, return path). The repository's last record says it was failing.
2. **Key.** A sending-only key restricted to that domain, entered directly in the hosting variables. Never in chat, a file or a commit.
3. **Sender.** Set `CUSTOMER_EMAIL_FROM` (and `OPERATIONS_EMAIL_FROM` if a different internal sender is wanted). Both flags stay off.
4. **Controlled test.** Run the existing one-off command once, to an address the owner chooses. Confirm arrival in the inbox, not junk. For a Gmail recipient, also confirm the message is not rewritten or clipped.
5. **Internal recipients.** Set `OPERATIONS_EMAIL_TO`: commas only, lower case, no trailing separator, each address exactly once. Include `golojlt@gmail.com` here if it is to receive alerts. Check the list by eye before saving: an invalid list stops the service from starting.
6. **Rehearse on staging first** with the same variable shapes, so a start-up failure is seen there.
7. **Enable internal alerts.** `OPERATIONS_EMAIL_ENABLED=true`. This restarts the service. Confirm the site and checkout respond.
8. **First real order.** On the next paid order, open its page in Operations: one "Internal email" row per recipient, "Enviado". Ask each recipient to confirm arrival and to mark the sender as not spam.
9. **Enable customer emails** only after step 8, and only with approved wording: `CUSTOMER_EMAIL_ENABLED=true`. Rows older than two hours are retired, not sent.
10. **First week.** Check the Resend dashboard daily for bounces and failures; the application will not report them (R3, R6).

**Rollback.** Set the relevant flag to `false` and restart. Nothing further is
sent; rows already recorded stay as history. Do not restore a database, delete
rows or resend by hand. Rows left `pending` when the flag was turned off will
be retired once a provider is back and they are over two hours old. If the
service fails to start after a change, revert that variable; no data is
affected.

## 11. Tests added

`tests/commerce/email-reliability.test.ts` — 9 tests, all passing on unchanged
production code:

1. a rate limit, a provider outage and a timeout each end as failed after one request, and no later pass retries
2. an accepted request whose answer cannot be read is recorded as failed without a message id, and is not sent again
3. a failed row does not hold back the rows queued after it
4. each internal recipient gets its own row, key and single-recipient request; one refusal affects only that recipient
5. internal recipients: at most twenty valid addresses, and an invalid list never reports the address it rejected
6. no email is queued by placing an order, by the return page or by a paid notification the provider does not confirm
7. a payment confirmed after its checkout expired is held for review and announces nothing by email
8. a customer event exists once per order and event, and an order without an email address records none
9. customer emails carry the order number and schedule but no address, phone or surname; the internal link opens the order page

Tests 1, 2 and 7 pin today's behaviour for R1, R7 and R4. They are expected to
change when those are addressed.

## 12. Validation

| Gate | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass, 0 problems |
| `npm run build` | pass |
| `npm test` | 581 passed, 0 failed, 0 skipped (572 before, plus 9 new) |
| `npm run scan:secrets` | 1325 files scanned, 0 findings |

Playwright suites were not run: no UI or server code changed.

## 13. Not verified

- Whether `golojlt@gmail.com`, or any recipient, is configured in Production.
- Current values or presence of any hosting variable; whether either flag is on.
- Resend domain verification, key scope, account limits, suppression list.
- Real delivery, inbox placement, or how any mail client renders the text.
- Resend's behaviour for a repeated `Idempotency-Key` (retention period, response to a changed payload): the adapter was tested against a scripted transport only.
- Whether Production holds notification rows, and in what states.
- The sign-in redirect for the `?order=` link when the reader is not logged in.
- Hosting behaviour when a new deployment fails to start (whether the previous one keeps serving).
- R11 was derived by reading and not reproduced.
