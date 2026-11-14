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

## Verification and release boundary

Synthetic regression tests cover the Nov 12 14:38 creation / Nov 13 16:51 acknowledgement, Nov 13 16–21 request → Nov 14 for 12h, Nov 15 for 24h; pickup/delivery, on-time preservation, cutoff, invalid/missing slots/dates, changed orders, missing snapshots/intents, non-paid states, historical paid, all authority classes, receipt replay, outbox dedupe, ownership rejection, reopen and SQLite integrity. Test providers are injected and disposable only. Existing HTTP 401/403 tests remain release gates.

Browser tests in `tests/operations-e2e/payment-time.spec.ts` cover Orders original/proposed presentation and the paid pending return at 390/1440. They are synthetic UI contracts, not provider or Production evidence. See the external handoff/evidence directory for actual command outcomes and unavailable capabilities; a written test or attempted launch is not a browser PASS.

Release remains HOLD pending independent review and host HTTP/browser verification. No commit, push, PR, merge, deployment, P1 ordering work or real #200 remediation is part of this artifact. Code rollback is a separately approved release action; never restore an old database over paid orders or erase durable acknowledgement/proposal evidence.
