# TL-OMS-01 · Order management

Operations → Orders is an orders list and a dedicated page per order. Not deployed; see the pull request for status.

## Routes

- `/operations/orders` — list. Search and filters live in the URL (`q`, `status`, `payment`, `method`, `placedFrom`, `placedTo`, `dueFrom`, `dueTo`, `page`), so Back, refresh and shared links keep them. 25 orders per page.
- `/operations/orders/:orderId` — order page, looked up by the immutable internal id. The public number (`#012`) is display only.
- `/operations/orders?order=:id` — earlier links (alert emails, WhatsApp alerts) are rewritten to the order page.
- The server serves the app shell for `/operations/orders/<id>` (`[A-Za-z0-9_-]{1,100}`); order data still comes only from the authenticated `/api/workspace`.

## Data and actions

- No new endpoint, schema or migration. Everything is read from the existing workspace snapshot.
- Actions are the existing commands: `transition`, `assign`, `payments/reconcile`, `resendPayment`, `retryJob`. Order version, idempotency keys and server permission checks are unchanged.
- A draft order (New, Building, Awaiting Location, Minimum Check) shows the existing order builder on its page.
- Kitchen, Deliveries and Inbox are unchanged apart from colours and an "Open order page" link on each card.

## What is shown, and what is not

- Customer name: checkout first/last name, then the conversation label unless it is a delivery area or a phone number; otherwise "Name not recorded".
- Prices: the order's own catalog snapshot. A missing or ambiguous price is "Not stored"; the current catalog is used only for drafts, which is what their quote uses.
- Created time: the first audit entry (orders have no separate creation field).
- Notifications: "Sent" only when the row has provider evidence; pending, failed, expired and disabled are stated as such. No new retry controls.

## Deferred (no backend support today)

- Internal notes: no field or command exists, so no control is rendered.
- Product thumbnails: orders store no image reference.
- Discounts and taxes: not recorded on orders.
- Card brand / last four digits: not stored; the payment method shows provider and checkout flow only.

## Evidence

`screenshots/` holds real UI captures from `tests/operations-e2e/oms.spec.ts` at 390, 768 and 1440 px, using the synthetic fixture `tests/fixtures/oms.ts`.
