# P0 payment-time fulfillment validation — local candidate

DRI: Codex. AMAE DUAL (payments); independent exact-artifact review by Claude Code is pending. Baseline: `13c46096087a7e58caecb8e2625bc4fc34e73e7a`. This document does not authorize release, provider access, messages or customer remediation.

## Contract and authority

`requestPayment` freezes a SHA-256 intent fingerprint plus the requested method/date/slot before provider initiation. It covers lines and preparation/price snapshots, catalog snapshot, quote, fulfillment/address/billing/contact data. It is internal change detection, not provider financial authority. No payment amount, product, quote or accepted preparation snapshot is recalculated at payment recognition.

At the first authoritative transition from a non-paid payment to paid, `applyCheckout` records the server acknowledgement time, then validates fulfillment inside the same SQLite transaction before freezing outbox rows. Hosted creation responses, embedded results, customer GET reconciliation/polling, operator reconciliation and notification reconciliation all converge here. Signed Paymennt notifications still require verified GET; their timestamp/status does not settle money or determine the scheduling clock. Notification receipts retain the existing completion/retry/replay transaction. The separately verified alternative event route calls the same scheduling policy; its existing no-GET-provider gate remains intact.

`paymentFulfillment` records payment id, acknowledgement time, actor, authority class, provider checkout id, optional durable receipt id, original request, effective proposal, status and reason. The acknowledgement time is not a provider transaction/settlement timestamp. Duplicate paid recognition never recalculates the proposal, changes the timestamp or re-freezes outbox rows. Already-paid historical payments, including those without `paidAt`, are not backfilled.

## Scheduling decision

- **unchanged**: the requested date and exact configured slot remain valid against shared Dubai `validWindow` and `leadHours`; preserve them.
- **proposed**: the date is no longer valid. Start with shared `earliestFulfillmentDate`, search forward for the first date allowing the exact same slot and 12/24-hour window-start notice. The entire 21:00 minute is inclusive; 21:01 advances the global earliest date. Store the candidate in operational date fields, with an explicit pending-confirmation status. This is not customer or chef acceptance.
- **review-required**: missing/invalid schedule, unknown/inconsistent frozen commercial record, missing intent fingerprint, changed order/state/payment association, or no safe date. Keep the paid financial truth; do not invent an effective schedule. Missing intent on a pre-release unpaid checkout intentionally requires review, rather than assuming the order was unchanged. No migration/backfill is included.

Search uses the shared policy's 32-day bounded horizon; it invents no holidays, rates, inventory, geography or availability exceptions. Commercial approval and actual preparation capacity remain human responsibilities. An unrepresentable scheduling horizon fails closed for the schedule without discarding payment.

## Downstream safety

Payment state transitions and public number allocation retain their existing authority. `Confirmed` is preserved for existing payment/outbox compatibility; for a non-unchanged decision it does **not** assert acceptance of the proposed schedule. Orders list, order detail, board and legacy panel display pending confirmation. Detail shows original versus proposed dates. The capability-protected checkout return uses explicit localized EN/ES/AR paid-but-pending wording, hides the accepted-schedule/progress composition and offers support, without a retry-payment action. Internal actor/receipt/fingerprint data is not added to the customer response.

New internal email/WhatsApp snapshots retain their product/financial details but label the schedule as pending; the candidate is explicitly a proposal. Newly frozen customer confirmations say payment verified and fulfillment pending confirmation. Legacy progress emails are suppressed while pending. V2 enrolment remains permanent and uses the existing flags/epoch/dedupe keys: its window row is a visible failed scheduling exception with no due time, never an automatic ready/dispatch promise. Both confirmation and failed-window previews use pending copy. Dispatch rechecks pending status. Previously frozen rows are untouched.

No acceptance/rebooking command is introduced by P0. Pending decisions require authorized human coordination; this candidate does not claim to capture agreement or automatically resume window emails after an agreement. A future approved scheduling workflow must define that contract explicitly. No email flags, provider settings, transport or dispatch activation changed; no real sends were performed.

This is an intentional commercial-flow/copy/native-language-review and release residual, not a local technical blocker to a separately authorized P1 continuation. It must not be described as fabricated customer or chef acceptance.

## Review fixes 3 and 5 — 15 November 2026

The legacy alternative `paymentWebhook` path shares the same settled-status set as authoritative reconciliation (`paid`, `partially_refunded`, `refunded`, `chargeback`). Any other settled payment on the order excludes automatic scheduling/confirmation. The first-recognition guard requires both payment and order `paidAt` to be absent; previously paid events are not backfilled, and existing first-recognition timestamps are not overwritten. A newly made fulfillment decision adds the same durable `Payment fulfillment …` order-audit entry as reconciliation. Same-event and different-event-id paid replays add no fulfillment decision/audit or notifications. This mock-only route gains no provider behavior, notification enqueueing or acceptance command.

The pending labels in Operations list, board, detail and legacy panel use the isolated EN/TL resources through `t()`. Original and proposed date/slot labels and the recorded-reason label are deterministic UI templates. Stored reason, dates and slots are interpolated verbatim, never translated or rewritten at runtime; audit snapshots remain unchanged. Six new TL labels are implementer-authored and **NOT native-reviewed**; see `docs/operations/oms/tagalog-review.md`. Customer language, backend status enums, notifications and email flags/epoch are unchanged by these fixes.

## Verification and release boundary

Synthetic regression tests cover the Nov 12 14:38 creation / Nov 13 16:51 acknowledgement, Nov 13 16–21 request → Nov 14 for 12h, Nov 15 for 24h; pickup/delivery, on-time preservation, cutoff, invalid/missing slots/dates, changed orders, missing snapshots/intents, non-paid states, historical paid, all authority classes, receipt replay, outbox dedupe, ownership rejection, reopen and SQLite integrity. Test providers are injected and disposable only. Existing HTTP 401/403 tests remain release gates.

Browser tests in `tests/operations-e2e/payment-time.spec.ts` cover Orders original/proposed presentation and the paid pending return at 390/1440. They are synthetic UI contracts, not provider or Production evidence. See the external handoff/evidence directory for actual command outcomes and unavailable capabilities; a written test or attempted launch is not a browser PASS.

The original 22-file P0 is recorded in local commit `7ef4f13366f48fc741475fce8d2b97ed4fe87541`, independently reviewed by Claude Code (Opus 5.5): PASS with observations. Hermes' host verification records 878/878 unit/HTTP tests, 3/3 P0 UI scenarios in system Chrome 157.0.8103.51 and 31/31 OMS/mobile-integrity/order-address cases. Pinned WebKit remains NOT RUN; system Chrome does not certify it. Checkout regression is 8/9, with a pre-payment stable-control predicate failure under separate baseline investigation by Hermes; no checkout/helper change is included here. These results are evidence for the original commit, not an independent review or host certification of the uncommitted review-fix delta.

Release remains HOLD for explicit Founder commercial/copy/native-language and release gates. The review-fix delta needs its own frozen-artifact narrow re-review; host verification may be reused only where valid for unchanged scope. No commit, push, PR, merge, deployment, P1 ordering work or real #200 remediation is authorized by this artifact. Code rollback is a separately approved release action; never restore an old database over paid orders or erase durable acknowledgement/proposal evidence.
