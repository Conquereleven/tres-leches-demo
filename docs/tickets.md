# TL-09–TL-12 delivery

Baseline: unversioned React/Vite TL-01–TL-08 prototype. Initialized Git and preserved it on main before creating `feature/tres-leches-commerce-os`. Existing routing is a single-page React state switch plus storefront anchors; no backend routes or auth existed. Original verification was four static-Worker packaging tests. New internal API routes are listed in README.

## TL-09 — Delivery Zone Engine

Implemented 91 structured rules from the image, including JLT cluster expansion and three explicit free-delivery rules. Unknown delivery fees/minimums remain nullable and block payment. Admin editing uses role and version checks; names/aliases, priorities, polygons, activation and review notes are editable. Matching prefers specific nested names while rejecting multiple independent localities. GPS uses polygon coverage or the explicit mock fixture. Unit tests cover boundaries, aliases, inactive zones, minimum threshold, fee exclusion and unknown/ambiguous locations.

## TL-10 — Unified Inbox

Implemented three number fixtures, immutable origin routing, search/number/unread/agent/status filters, agent takeover/release/assignment, message history/translation and linked orders. Versioned commands and durable idempotency receipts reject stale or duplicate actions. Signed normalized webhook endpoints receive inbound/status/GPS events. Outbound messages use leased durable jobs with bounded retry and unknown-result handling. Drafts survive failed sends. Previous approved-answer/takeover inbox remains labelled as the earlier demo.

## TL-11 — Payment Automation

Implemented PaymentProvider and complete sandbox flow: create → queued link → source-number send → normalized webhook → Paid/Confirmed, with provider reference, transaction, amount/currency and timestamps. Resend stays in the workspace. Mismatched amounts, duplicate events and late-success events are tested. Unsupported cancellation never masquerades as a cancelled provider charge. Actual provider identified as Paymennt; credentials and adapter wire-format/status-verification work remain external activation items.

## TL-12 — Operational Workflow

Implemented all requested states and allowed transitions in the server domain. Paid/Confirmed cannot be selected by an operator. Quotes/lines lock during payment and fulfillment. Production and delivery views use the same persisted orders. Transition audit records actor, timestamp and from/to. SQLite transaction tests cover persistence/restart and multiple connections. HTTP tests exercise signature rejection, origin validation, request validation, login and server-side RBAC.

## Architecture decisions

- Preserve the storefront and its fictitious history as the earlier demo; never promote its locally selected “Pagado” labels into verified payments.
- Add a Node/SQLite server and a strictly typed operational UI rather than introduce a frontend-only imitation of webhook reliability.
- Keep financial amounts in integer fils. Separate minimum, delivery fee and free-delivery flag. Snapshot the commercial quote at payment creation.
- Commit event receipt, state change and outbound job atomically. External calls happen after commit and outside the database lock.
- Keep original static Sites package unchanged. Full runtime is Node; a static-only deployment cannot serve the operational API.
- Production-sandbox authentication is new because the original prototype had none. Real integrations fail closed pending configured, reviewed adapters.
