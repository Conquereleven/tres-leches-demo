# Final review gate — Production reconciliation plan (NOT EXECUTED)

No Production data, API, Railway environment, database, backup or provider has been accessed for this review. Founder authorization is still required for this procedure. Development readiness does not certify historical LIVE origin.

## Definitions and acceptance boundary

`qualityScope=financial_consistency` describes internal record completeness and reconciled arithmetic only. `quality=internally_consistent` means no source issues were detected by this engine; `partial` flags exclusions, fallback timestamps, unknown adjustments or allocation issues. Neither value independently certifies a capture as LIVE. `provenance=unverified` applies to every report from this historical model, including empty/otherwise consistent reports. Paymennt provider names, LIVE-looking URLs, reconciliation timestamps and the current runtime profile do not establish independent historical environment provenance. Mock/known TEST records remain excluded. CSV and visible UI carry both dimensions.

## Authorization and input control

1. Obtain separate founder authorization for a read-only Production reconciliation, identifying the exact date range, authorized operator and private result location. No provider reconciliation calls, status changes, outbound notifications, role changes, catalog publication, configuration or deployment.
2. Record actual deployed revision from Railway deployment metadata, reporting-engine SHA and report schema, database identity/profile and published catalog revision as context only. Do not use the catalog to reconstruct history. Verify the approved reporting code is the code being compared; an undeployed local candidate must be labeled an isolated rehearsal.
3. Choose a consistent input: preferably an existing, verified backup already under private owner custody, opened read-only. If none is available, request separate authorization for the established consistent-backup operation; do not improvise copying a live SQLite/WAL file. A direct audit alternative is an authorized SQLite read-only connection with `query_only=ON` and a read transaction that reads the serialized document once. Avoid `new Store(...)` on the live DB: its constructor initializes/migrates data.
4. Run integrity_check on the authorized read-only source. Capture SHA-256 of the private snapshot/document, audit timestamp and source fingerprint; never publish the raw state, PII, checkout URLs or transaction IDs. Use one immutable input for independent calculations and the candidate engine. The live dashboard and an export generated later are not an identical point-in-time source if new payments arrive.

## Independent ledger comparison

The reviewer independently reads accepted orders and payment records from that fixed input, without calling the report's aggregation functions for the reference calculation. Retain identifiers privately only to investigate discrepancies. Public review evidence contains aggregated counts/fils only.

- Collapse byte-equivalent duplicate payment IDs; quarantine conflicting IDs, duplicate order IDs, reused settled provider references and multiple settled attempts per order. Confirm one settled attempt plus unpaid retries counts one paid order.
- Partition records into mutually exclusive primary dispositions using the adapter's documented filter order: known mock/TEST/unknown provider; missing/ambiguous association; non-settled attempt; missing verification/invalid AED amount; missing payment date; duplicate/reused settled capture; outside requested Dubai period; included and allocated; included and unallocated. Retain secondary reasons separately. Engine issue counters can overlap and are source-wide: their sum is NOT a unique excluded-payment count.
- For each included capture verify Paymennt identity/reference, accepted amount/currency, recorded reconciliation evidence and first recorded paid timestamp. Payment status paid/refunded/partially_refunded/chargeback permits original gross capture only. No refund amount, settlement, net-sales or profit inference. Missing provenance remains unverified even when every amount matches.
- Use Payment.paidAt, or the stored Order.paidAt fallback with warning. Do not substitute createdAt, updatedAt, delivery date or today's date. Explicitly account for missing dates outside period attribution. Test inclusive Dubai midnight boundaries and the immediately preceding equal-length period.
- Independently validate each accepted financial snapshot: SKU uniqueness, quantity, base price and accepted premium price snapshot; subtotal = sum accepted line quantity × unit price; total = subtotal + accepted delivery fee = payment amount. Preserve distinct compositions and prices. Preparation components do not add sold units; purchased packs count as boxes. Tricolor colors/components are preparation details, not extra sales rows.
- Missing/inconsistent snapshots retain the confirmed capture in gross totals but contribute to unallocated count/fils, never today's catalog prices. Unconfirmed/missing-proof records never inflate gross capture. Report excluded counts and safely stored declared amounts separately (not revenue); invalid amounts remain unquantified. Do not assign unknown-date exclusions to a guessed period.

## Required reconciliation equations / evidence

For selected and prior periods, compare exact integer fils and distinct identities, with ZERO unexplained difference:

- Gross captured fils = sum unique eligible capture amounts.
- Paid order count = distinct eligible order identities (not attempt count).
- Gross captured fils = allocated product fils + accepted delivery-fee fils + unallocated capture fils.
- Sum daily paid counts/amounts = period paid count/amount; sum SKU allocated amounts = product allocated total.
- Allocated units = sum purchased line quantities; pack components never contribute additional units.
- Average = round(gross captured fils / eligible paid orders), null if no orders. Zero comparison denominator remains unavailable.
- CSV date rows/product allocations match the same fixed-input report and filter, including financial-consistency and unverified-provenance columns.

Record input fingerprint, engine SHA, range/timezone, included/excluded/unallocated counts and fils, reason matrix, missing timestamp counts, refund/dispute counts with unavailable amounts, classification/translation gaps, and before/after historical-state fingerprints. The procedure performs no write; an unexpected changed source fingerprint requires a new fixed-input comparison, never a historical correction.

## Stop / approval gates

STOP on integrity failure, inconsistent input identity, unexpected writes/provider calls, unaccounted duplicates, arithmetic difference, raw customer data exposure or use of mutable catalog prices. Excluded and unallocated records must be explicitly reviewed; do not call a partial total complete revenue. Do not claim independent LIVE certification without a separately approved authoritative provenance source. Founder decides whether the disclosed unknown historical provenance is acceptable for operational use; that decision does not turn unknown provenance into verified LIVE.

Remaining release gates: founder code/wording approval; explicit read-only reconciliation authorization and successful aggregate comparison; native EN/TL operational-language review; acceptance of exclusions/unallocated records and unavailable metrics; separate merge and deployment authorization with established backup/rollback gates. No payment/status change or commercial publication is part of any analytics reconciliation.
