# Sprint 1B — frozen checkout safety

## Baseline and isolation

This branch starts from `origin/main` at `e2a82387549d5861e110178d6b9c8b8ae7f84f10`.
PR #6 (Conchas) was open at `14484ab0eef21c64732ea744c31eb3f6761839c3`;
its uncommitted media/catalog work remains untouched in its own worktree.
PR #7 (Catalog Foundation) was open at `b65be4915327f74ef54325bf7793bc15f54596da`
and its worktree was clean. Neither PR is merged or modified by this sprint.
The canonical checkout worktree was clean at
`4bd4cbe7422a8666ae225aa15db128d886109afe` and remains untouched.
Implementation uses a separate worktree of the canonical Git repository,
`feature/3l-frozen-checkout-safety`, with no dependency on PR #7.

## Problem and freeze point

`requestPayment` already stores `catalogSnapshot`, the committed quote, payment
amount, and payment outbox job. For website orders these commit together with
the idempotency receipt inside the existing SQLite `BEGIN IMMEDIATE` transaction.
**That transaction commit is the acceptance/freeze point.** No provider call
occurs before it commits.

The hosted worker previously recalculated from the current catalog and sent live
names/prices. Resume and duplicate POST also consulted current prices before
checking the accepted receipt. Repricing, renaming or deactivating a SKU after
acceptance could block or change the accepted checkout's line presentation.
Status summaries could fabricate historical prices from the live catalog.

## Contract

| Situation | Behavior |
| --- | --- |
| New checkout | Current `State.catalog`, seasonality, scheduling and zone rules remain authoritative. |
| Quote changes before acceptance | Current storefront forwards opaque `X-Checkout-Quote-Revision`; mismatch returns 409 and asks the customer to return to delivery/review. Reservation rolls back with no provider call. |
| Accepted, unchanged cart | Resume uses stored cart intent and commercial snapshot; catalog changes never supersede it. Exact duplicate POST verifies original normalized input and frozen consistency before any live catalog lookup. |
| Changed SKU/quantity/fulfillment | Existing supersession guards apply, including uncertain/processing-payment review; new checkout uses fresh authoritative pricing. |
| Failed/cancelled/expired checkout | Resume requests a fresh priced replacement, preserving old financial status and suppressing old URL. Exact POST replay alone never creates another payment. |
| Paid checkout | Same checkout is returned; different cart creates a separate checkout. Paid financial records/order snapshots are not rewritten by replay or late worker completion. |
| Incomplete/inconsistent historical snapshot | No live catalog fallback and no invented names/zero prices. Financial status and committed amount remain readable; line summary is omitted. Unpaid checkout is held for review and URL suppressed. Creation/resume fail closed. |

The quote revision is a comparison hash, not a price authority, secret, catalog
publication revision, or client amount. New requests still use server prices.
It covers sorted selected SKUs, catalog records and authoritative quote.
It is optional for compatibility with old clients; older clients still receive
current server pricing at initial acceptance but do not gain the display-change
detection provided by the current storefront. Existing accepted POSTs ignore a
stale revision and preserve their original idempotency receipt.

Existing identity, scheduling, address validation and delivery/pickup business
rules remain in force. This fix does not promise a stale delivery date remains
bookable or replace address verification policy.

## Frozen invariants and provider boundary

The shared validator requires:

- Order/payment linkage and currency AED.
- One snapshot entry for every unique line SKU, nonempty name, positive safe
  integer price and quantity.
- Computed line subtotal equals stored quote subtotal.
- Stored fee is a nonnegative safe integer; subtotal + fee equals quote total
  and payment amount.

The hosted `POST /checkout/web` uses these validated SKU/name/quantity/unit-price
values and the stored fee. No current catalog or zone recalculation occurs in
that asynchronous worker. Names, customer/billing/delivery mapping and provider
request IDs retain existing adapters. No provider endpoint, signature/HMAC,
GET reconciliation or ORDER_PAID rules change. Only authoritative reconciliation
can confirm payment, as before.

Current delivery fees remain zero. The nonzero-fee regression is explicitly a
historical fixture; it proves stored fees survive without changing zone policy.

SQLite claims serialize workers across connections. Expired non-idempotent
Paymennt creation leases become unknown and require reconciliation rather than
blind retry. Rejected and uncertain responses preserve existing job semantics.
A stale hosted job for a non-creating payment is completed without another
provider POST; a late result cannot reset a reconciled payment to pending.

The retained, non-customer Drop-In/token adapter is not activated or redesigned.
Its existing live-price comparison fails closed rather than silently repricing.
Current public checkout remains hosted `/checkout/web`. Legacy financial
reconciliation remains available independently of missing line summaries.

## Validation

All tests use disposable SQLite and injected fixture providers; no merchant
API, real card, LIVE database or external payment call is involved.

`tests/commerce/frozen-checkout.test.ts` adds 21 regressions: preaccept price
revision, postaccept price/name/deactivate/remove, delayed creation and eight
replays, restart pending, seven corrupt/missing snapshot cases, multi-SKU stored
fee, rejection/uncertainty, expired replacement, separate SQLite worker claims,
expired processing lease, and paid-state preservation during late completion.
Existing stale-checkout tests retain quantity/SKU/fulfillment supersession,
paid immutability and late-payment reconciliation. Two expectations now correctly
resume the frozen checkout after a live price change. Existing browser checkout
also asserts the quote-revision header is actually sent.

Final local release gate (11 October 2026):

| Check | Result |
| --- | --- |
| Typecheck | Passed |
| Lint | Passed |
| Build + i18n/customer-copy audits | Passed |
| Full commerce unit/integration/HTTP suite | 468 passed; zero failures/skips; includes 21 new frozen-checkout cases |
| Checkout Chromium | 19 passed |
| Checkout WebKit | 19 passed |
| Sites packaging | 4 passed |
| Secret scan | 890 source/bundle files scanned; zero findings (heuristic) |
| Git whitespace check | Passed |

The initial full suite ran before a build existed in the new worktree and the
canonical-host smoke test returned 404. After building, the full suite passed.
Browser runs were serialized after the HTTP suite to avoid its shared fixture
port. Build retains existing large-chunk and pending-business-information
warnings; they do not change this safety gate. No Production database, provider
configuration, catalog file, media, CSS, Meta or notification adapter was changed.

## Rollback and Sprint 2

Rollback is a code revert only; there is no schema change, migration, rewritten
historical snapshot or catalog change. Never restore a full Production database
over newer transactions. Rolling back would restore the audited live-catalog
worker hazard, so keep dynamic commercial writes disabled until revalidated.

PR #7 adds optional catalog metadata/read API, while keeping `State.catalog` as
sole pricing authority. This sprint neither imports nor activates that API and
has no overlap with its model/schema additions. Future catalog writes must use
existing SQLite transactions, preserve accepted snapshots and expose refreshed
quotes to the storefront. Catalog Foundation's publication revision is distinct
from this checkout comparison token.

Sprint 2 still needs publication/RBAC/concurrency/history, dynamic storefront
adoption and complete preaccept revision handling for any newly introduced
clients. Incomplete legacy commercial records require manual review, not
backfill from current prices. Founder review/approval is required before merge
or deployment. This sprint performs neither.
