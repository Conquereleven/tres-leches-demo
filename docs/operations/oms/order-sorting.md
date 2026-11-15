# P1 Orders sorting and timestamp presentation

Local implementation candidate, based on P0 `ff79aa49aabc95bd314ddd527cd61176d8ad778b`. Codex is sole implementation DRI; Hermes coordinates and records the separate local commit after freeze; Claude independently reviews the exact frozen artifact (AMAE DUAL, proportional to the shared Orders/document surface). No commit or release is authorized by this document.

The original user GO and source handoff §4.6 authorize P0 then P1 local implementation/tests. The final P0 reviewer sentence asking for separate P1 authorization is incorrect and does not supersede that GO. P0 commercial-flow/copy/native-language and Production gates remain separate. No acceptance/rebooking command or P0 financial change is part of P1.

## Sorting contract

- **All orders** (`fulfilment = any`, no daily view or `view = all`): stored positive integer `publicOrderNumber` first, numeric descending. #200 appears above #199, #1000 above #999, regardless of creation time. Cancelled/refunded orders retain their issued number; ordering does not infer numbering or paid status from live payment state.
- **Unnumbered/historical/unpaid**: remain visible after numbered orders, explicitly labelled Unnumbered and with the existing payment/fulfillment badges. Within this section, creation is descending, missing creation last; exact ties use internal id ascending with a deterministic code-point comparison.
- **Fulfillment groups** (including Preparing and Ready): retain creation chronology, not the numeric All priority. Existing Kitchen/Deliveries/overview grouping, state priorities and comparators remain untouched.
- Same-number fallback is creation chronology then internal id. No order number, timestamp, lookup key, audit, command, permission or idempotency key is written. Page size remains 25; sorting precedes pagination; search and all filters use the same stored fields as before.

`createdAt` still means `order.audit[0]?.at`; Created at filters use that event, not payment recognition. The list's existing date column now explicitly labels Created at and includes a compact Paid at (3L recognition) line. Detail's payment summary always presents Paid at, including Not stored. The read-only `recognizedPaidAt` uses stored `order.paidAt`, then the corresponding payment's stored `paidAt`; it never infers from Paid audit transitions, notification/provider timestamps or settlement time. Missing/invalid values stay unknown. The original creation heading remains unchanged.

Five UI-owned labels are in the isolated Operations EN/TL resources through `t()`. Stored operational facts remain untranslated; new TL labels are implementer-authored and **NOT native-reviewed**. No customer language/copy, notification or V2 flags/epoch changed. No CSS/layout redesign or new table column.

## TPL-18 compatibility — not integrated into main

Main has no `matchingOrders` or `ORDER_VIEWS`. P1 does not implement those features or import PDF dependencies. `orderComparator(query)` is a minimal seam accepting the existing fulfillment filter plus an optional daily-view identifier. It selects numeric order only for All; other/daily views keep chronology.

The isolated candidate under external evidence `compatibility-tpl18/` archives exact source paths from PR76 `5e511c96aeb0a77d0821803a2754c809788f36db`, with unchanged document modules/fixtures/original tests. Only its order-view comparator block and `matchingOrders`' `.sort(orderComparator(query))` differ. The existing Tomorrow actionable-first partition remains afterward, so unpaid/draft work never jumps ahead of actionable work. Delivered-today chronology is preserved. No original PR76/PRINT worktree, merge or cherry-pick is involved.

Original PR76 documents tests and additional P1 matching/pagination/role tests execute against that candidate. Fixed selected IDs and fixed generation time produce byte-identical CSV, delivery-note PDF, packing-slip PDF and ZIP before/after the adaptation. All-matching selection spans every page; documents preserve requested order, contents, frozen facts and role boundaries. The candidate delta is preserved as `p1-tpl18-integration.patch` externally and **needs separate exact-artifact integration review when TPL-18 is integrated**. Compatibility tests do not mean TPL-18 is present or published in main.

## Evidence and remaining gates

External `p1-*` evidence records RED/GREEN, actual commands/results, source/compatibility manifests, build/Sites and actual host browser/full-suite outcomes when available. Browser specs use synthetic intercepted API data and do not certify providers or Production. Chrome runtime must be labelled system Chrome; absent pinned WebKit stays NOT RUN.

No remote write, push, PR, merge, deploy, Railway/Production/customer data/provider/message/charge or real #200 remediation. Full offline regression and actual desktop/mobile UI verification are host gates where sandbox loopback is denied. Reuse valid P0 evidence; do not re-diagnose the incident. Final P1 is not CLOSED or Production verified; exact-artifact independent review and Founder acceptance remain distinct.
