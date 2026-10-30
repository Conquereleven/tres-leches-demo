# Flexible delivery by area — review candidate

Baseline: `10a2176583da52890758dad57b9262a8af0e44f2` (main). This branch changes new quotations only. No Production access, database operation, provider call, publication, merge or deployment was performed.

## Commercial behavior

| Free delivery from AED | Delivery below threshold AED |
| ---: | ---: |
| 30 | 15 |
| 50 | 15 |
| 100 | 15 |
| 150 | 20 |
| 200 | 20 |
| 250 | 25 |
| 300 | 25 |

A nonempty available cart below the threshold can proceed with the area's fee. Exactly at/above threshold, fee is zero. Fee never helps reach the product threshold. Pickup is free. Coverage, date, time windows, 12/24-hour notice and legacy/Google address strategies are unchanged.

The existing catalog/pack pricing remains authoritative. No product-discount mechanism exists in this baseline; no discounts were invented. A future discount mechanism must supply the validated net product subtotal to the common quotation boundary before this threshold comparison. Browser-supplied discounts/fees are rejected now.

## Data and boundaries

`DeliveryZone.deliveryPolicy` is optional, strict and explicit:

```json
{"mode":"flexible","freeDeliveryThresholdFils":5000,"belowThresholdFeeFils":1500}
```

All policy money is integer fils. Absence means the historical hard-minimum behavior. Legacy `minOrderAed`, `deliveryFeeAed` and `freeDelivery` are retained rather than silently repurposed in persisted data. The initial rollout copies the approved legacy minimum into the new threshold; subsequent admin edits change the explicit policy only. Removing the policy restores that zone's retained legacy minimum.

`Quote.deliveryRule`, `zoneVersion`, `feeFils` and `totalFils` are recorded when the accepted order/payment is created. Existing quote revisions already include the complete quote; cart fingerprints include its amounts. Existing same-intent retries reuse frozen amounts; a new/replacement checkout must pass current validation. A changed quote revision fails atomically before creating an order. Paid orders and old outbox content are never regenerated.

No Paymennt adapter/reconciliation/state-machine changes: the existing hosted adapter already maps accepted `feeFils` into `totals.shipping`. Fake transport tests prove products AED 40 + shipping AED 15 = amount AED 55, with one provider creation under retries and unchanged amount after rule edits. Provider-authoritative reconciliation remains required to confirm payment.

The editor uses the existing admin command, version guard, idempotency receipt and RBAC. Carrito, checkout/review/return summaries, Operations, ticket previews and newly rendered paid confirmations show recorded delivery separately. No email channel or recipient was enabled. EN/ES/AR customer text and EN/TL staff labels are included; new Tagalog wording has not received native review.

## Rollout tool (not executed against Production)

```sh
# DB_PATH must refer to an existing initialized database.
npm run delivery:policy -- dry-run
# Review every change and retain the returned digest.
# BACKUP_DIR must be absolute; only execute after separate activation approval.
npm run delivery:policy -- apply <reviewed-digest>
```

Dry-run opens SQLite read-only, does not construct Store, and outputs valid/count/digest/per-zone diff/errors. Apply refuses an outdated digest, ambiguous legacy fee, unknown active threshold, duplicate ID or invalid existing policy. Existing explicit per-zone overrides are preserved. Inactive zones are skipped. There is no automatic startup application.

Apply creates an integrity-checked SQLite backup with private permissions before mutating anything. The entire zone set is checked again in the write transaction to reject concurrent editing. Only the changed zones' `deliveryPolicy` and `version` change; orders, payments, histories, catalog and other state remain equal. Repeated apply is a no-op. Tests include populated paid historical records, backup failure and concurrency after backup.

The checked-in dry-run evidence is **94 seeded zones in a disposable database**, not the current Production zone count. Production may include admin-created communities such as Bluewaters; a future approved Production dry-run must inspect its actual state rather than copying seed data.

## Activation gates

1. Founder reviews this PR and desktop/mobile evidence. Resolve the existing Vite audit finding or record an authorized security disposition; do not bypass CI protections.
2. Approve/update public `/delivery` wording before enabling a policy. `src/brand/Policies.tsx` currently says orders below the minimum are not accepted and that no additional delivery charge exists. Those legal statements were intentionally left unchanged pending review. The static community-band display also needs to represent the activated policy accurately.
3. Obtain separate merge/deployment and zone-data activation authorization. Preserve all Railway/Paymennt/Resend/Meta settings. No environment variable is required for this policy.
4. On the approved release, run the real read-only dry-run, review all area changes, confirm backup custody and use its exact digest for one apply. Any unknown threshold blocks the batch for business review.
5. Verify effective public config, below/exact/above threshold quotes, pickup and existing order amounts without creating payments. Lisa approves the live display before any real payment UAT is separately authorized.

Suggested public-policy wording for founder review (not published): “Each supported delivery area has a free-delivery threshold. Below that threshold, you can order with the area's delivery charge, shown before payment. Delivery is free once your product subtotal reaches the threshold. Pickup is free.” Localize the final approved wording and replace the conflicting below-minimum refusal together.

## Rollback

Before data activation, reverting code is sufficient because no policy is installed automatically. After activation, disable/remove the new policy through versioned admin zone updates using the original per-zone values from the pre-apply backup; review a zone-only diff first and stop for concurrent edits. This restores hard minimums for future quotes. Do **not** restore the whole SQLite file over a trading database: that would erase orders created after the backup.

Retain accepted orders/payments and their delivery snapshots even if the policy or code is rolled back. Existing hosted payment amounts must never be edited or replaced speculatively. The previous release's frozen-payment contract already supports a recorded nonzero delivery fee. Coordinate rollback with a release owner and keep the backup private; it is a recovery source, not a catalog/price reset.

## Coordination

No open delivery-fee PR existed at discovery. PR #67 checkout recovery, #34 SEO, #68 Google, #43 handoff, #38 Conchas and #6 media were preserved. No edits were made to their branches/worktrees. This branch does not change `web-checkout.ts` or payment adapters, reducing overlap with recovery work.

Linear project: https://linear.app/cornertechai/project/3l-pastelerias-280923e9be99/issues . The Linear plugin is available but not installed in this execution, and no browser-control tool is available; therefore no ticket creation/update or duplicate-resolution claim is made. Link this PR to the existing project once authorized Linear access is available.

## Evidence

See `artifacts/flexible-delivery/QA.md`, `dry-run.json` and the linked screenshots. All browser orders and imagery shown in evidence are explicit synthetic fixtures, including the retired AED 25 test product; Production catalog/pricing has not changed.
