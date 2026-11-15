# P0 payment-time fulfillment contract — local correction, 15 November 2026

DRI: Codex; Hermes coordinates host checks and the local commit; Claude independently reviews the final SHA/evidence. Correction base: `3f35e6a54d13a83d7379c0aa488dfe57f1d37a3a`. Local synthetic scope only; no release, provider activation, real payments, customer remediation or external sends are authorized. Exact runs, hashes and residuals are in the external `payment-contract-fix-20261115/IMPLEMENTATION-HANDOFF.md`. Independent review remains pending.

## Atomic accepted schedule

`requestPayment` freezes an intent fingerprint and original method/date/slot before provider initiation. It covers lines, preparation/price/catalog snapshots, quote and fulfillment/contact/address/billing details. The fingerprint detects changes; Paymennt GET reconciliation remains financial authority. Notification payload/timestamps never settle money or set the scheduling clock.

At the first authoritative paid recognition, the same SQLite transaction records the acknowledgement, validates intent, decides the schedule, writes the operational date, audits the decision, confirms the order and freezes customer/internal outboxes. No amount, line, quote, catalog or preparation snapshot is recalculated. The original requested schedule, payment transaction and first-recognition timestamps remain stored. Replays do not make a second decision or re-freeze notifications. Historical paid records without a decision are not backfilled or newly held.

- `unchanged`: the original exact date and configured slot remain valid under shared Dubai cutoff and product lead-time policy.
- `auto-rescheduled`: a new demonstrably safe rebooking is **accepted automatically**, before notification freeze. Search from the shared earliest fulfillment date for the earliest valid date with the original exact slot and 12/24-hour window-start notice. The full 21:00 minute remains inclusive; 21:01 advances the global earliest date. No holidays, capacity, rates, geography or availability exceptions are inferred.
- `review-required`: missing/invalid schedule, missing/inconsistent frozen intent or snapshots, changed intent/state/payment association, or no representable safe date. Preserve PAID; do not invent acceptance.
- `proposed` is legacy only. It is never automatically promoted. Unknown or malformed present decisions also remain held.

Approved regression: checkout 12-Nov 14:38 Dubai, original 13-Nov 16–21, authoritative recognition 13-Nov 16:51 Dubai, 12h notice → accepted 14-Nov 16–21. V2's actual window row is `pending`, due `2026-11-14T12:00:00.000Z`; its send-time blocker permits that accepted schedule at the slot start. Customer/internal frozen copy uses the effective date. The 24h counterpart moves to 15-Nov.

## Shared safety semantics

`shared/payment-fulfillment.ts` is browser-safe and shared by API, server notices/email consumers, Operations capabilities and PrintCenter. Only coherent `unchanged` and `auto-rescheduled` decisions resolve: effective/original method and slot, real dates, payment association and recognition metadata must exist; effective date/slot/method must match operational fields. `unchanged` must match the original date; an automatic reschedule must advance it. A status alone cannot release a missing or mismatched effective schedule. Absent decisions retain historical behavior.

The server refuses Production, Ready, Out for Delivery and Delivered commands while held, including pickup collection. Rejection leaves order, money, audit, command receipt and outboxes unchanged. UI capabilities withhold the next step; list/board/detail/legacy panel show the shared review state. The checkout return retains paid-but-pending support copy and no retry-payment action. Internal decision metadata remains private.

PrintCenter shows an explicit hold instead of a dated ticket. `ticketSnapshot` rejects held records, while preserving snapshot checks and historical no-decision behavior. V2 does not schedule an uncertain date and rechecks the hold at dispatch. Existing frozen outbox rows are not rewritten; permanent V2 enrolment/dedupe, provider receipt replay and first-paid guards remain intact. Previously frozen pre-fix pending rows are not automatically replayed.

## Unresolved review workflow and integration boundary

No manual approval, override, migration or legacy autoacceptance is implemented. Unsafe/legacy exceptions remain explicitly held. Founder must define and authorize a future manual review/release command, with audited agreement and notification semantics; operators cannot currently release those records through this patch. Never edit SQLite directly or restore an old database to clear a hold.

`server/orders/documents.ts` is absent from this branch. CSV/PDF/ZIP protection is proven only in a **new isolated TPL18 compatibility copy** in the external evidence root, using the previous PR76/P1 compatibility source. That adapter marks the review hold and suppresses promised date/slot; accepted automatic schedules retain the effective date. Its exact integration patch/manifests require future separately authorized integration. This is not a PR76 merge, combined release or deployed document protection. Existing P1 comparators and daily-view partitions are preserved.

## Validation and release limits

Durable tests cover automatic acceptance, frozen customer/internal copy, actual V2 row/dueAt and start-time eligibility, 12/24h and cutoff matrix, pickup/delivery, unknown/legacy/review/malformed decisions, command and ticket holds, historical no-decision behavior, authority routes, replay, restart/SQLite integrity and ownership. Providers are injected and databases disposable. Original external approved-policy probe remains byte-identical.

Browser scenarios cover accepted versus held Operations, PrintCenter and pending customer return at 390/1440; outputs belong outside the repo. A sandbox socket denial is not a browser failure or PASS: Hermes must execute the supplied host Chrome config. Chrome evidence never certifies WebKit/Safari. New EN/TL review label wording is implementer-authored and **not native-reviewed**. No CSS or design change.

No full 908-test rerun is required by this scoped task. Run targeted runtime/HTTP suites, typecheck, lint, build and Sites tests; record actual outcomes, including denied host checks. Local implementation and synthetic results do not imply Production acceptance, independent review or Founder closure. No push, PR, merge or deployment without separate authorization; code rollback is separately gated and must preserve payments/audit/outboxes. Never restore a historical database over newer transactions.
