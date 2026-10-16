# 3L-COMMERCE-004 — composition pricing and kitchen emails

## Scope and source

Current main at start: `7c72fd94826d63e3d244d20818bb462e051b2bc9`.
Email PR #39 remains unchanged at `795bf63f45c477422014e0d9500b19ed0ce045bf`, with green CI. This pricing branch starts from that exact commit and reuses its template, outbox and Resend adapter. The pricing PR targets main and includes that unchanged prerequisite commit; it does not merge either PR. Merge #39 first after authorization, then refresh/review the pricing PR against the resulting main before authorizing its merge. Do not independently cherry-pick the email changes twice.

No catalog/import/price-updater files or SKU prices have been modified. The eight base prices and the published individual Pistachio prices were checked against Production's **public read-only** config: revision `catalog-v1-814c6df52cc0b6945455cd01a22daeb98971e27301731738d78b90689dbd177b`, 28 component authorizations, Chocolate Covering excluded. Full minimal baseline: [JSON](production-public-baseline.json).

The founder's latest approval supersedes the earlier indefinite exclusion of Traditional Sugar with Chocolate Covering. Approved future rules: Sugar, Sesame and Chocolate Covering (Traditional); five current fillings including Pistachio (Filled). Pistachio is never a Traditional component. Publication and deployment remain separately unauthorized.

## Financial contract

`PAN_PACK_PREMIUM_PRICING_ENABLED` is independent and defaults OFF. With it OFF, existing legacy fixed pricing remains, and Chocolate Covering is filtered from effective public approvals and rejected at quote time. Product Hub refuses newly publishing covering approvals until premium pricing is enabled and its published rate source validates. Enabling pricing never automatically publishes eligibility.

With the flag ON, each selected covering piece adds AED5 mini / AED6 individual. Each selected Filled Pistachio adds the FULL published individual price, AED23 mini / AED26 individual, starting with the first piece. These are additions to the published pack base, not replacements for included pieces. Other approved flavors add zero. The published Pistachio SKU must exist exactly once and equal the approved 2300/2600 fils; missing/conflicting rates fail closed (503) and publication is blocked, never silently discounted. A later business price change requires reviewing the explicit policy rather than silently changing this approval.

One integer-fils calculation serves server quotes and the display projection supplied by the server. Pack prices are per composition/box, not a new SKU price. `priceSnapshot` is stored on each accepted order line: policy version, base, premium quantities/rates and final unit amount. The catalog snapshot keeps its original base price. Multiple compositions of the same SKU can have different immutable amounts. Hosted Paymennt items, order totals, ticket previews, Operations line totals and internal email all consume that accepted per-line price. Client requests cannot supply this snapshot or surcharge amounts.

Legacy paid orders remain fixed-price; no financial snapshot, payment or historical message is rewritten. New-model accepted pending checkouts also retain their frozen price after later publication. Unaccepted quote fingerprints include the pricing policy/rates, and stale quotes are rejected before order/provider creation.

An old fixed-price pending premium checkout from before activation is different: its hosted URL is withheld by the app, new creation/replay is revalidated and a late underpriced payment remains recorded as paid but uses the existing manual-review path (no automatic fulfillment/ORDER_PAID email). Already-issued external hosted URLs cannot be invalidated by this application-only sprint. Audit/review them privately before activation; do not cancel/change provider registrations or send automatic charges/refunds.

## Approved eight-format evidence (AED, per box)

| Format | Base | Per premium piece | 1 premium | 2 premium | All premium |
|---|---:|---:|---:|---:|---:|
| Traditional 6 mini | 60 | 5 | 65 | 70 | 90 |
| Traditional 12 mini | 115 | 5 | 120 | 125 | 175 |
| Traditional 6 individual | 72 | 6 | 78 | 84 | 108 |
| Traditional 12 individual | 140 | 6 | 146 | 152 | 212 |
| Filled 6 mini | 100 | 23 | 123 | 146 | 238 |
| Filled 12 mini | 190 | 23 | 213 | 236 | 466 |
| Filled 6 individual | 120 | 26 | 146 | 172 | 276 |
| Filled 12 individual | 235 | 26 | 261 | 287 | 547 |

Zero premium pieces = base. Every box still contains exactly 6 or 12 pieces. Machine-readable assertions/output: [CSV](eight-format-evidence.csv).

## Visual evidence / reproduction

- `node --import tsx scripts/preview-pack-pricing.ts`: in-memory SQLite, injected fake payment transport, no emails. Generates the matrix and [HTML kitchen preview](fictional-premium-kitchen.html) / [text](fictional-premium-kitchen.txt).
- Example: one Traditional box AED70, one Filled box AED146 and two Filled boxes AED123 each, total AED462. Components are nested, never separately purchased items. Original fictional allergy note is retained.
- `npx playwright test -c playwright.premium.config.ts`: Chromium/WebKit, EN/ES/AR, 390/768/1440px, all eight sizes, exact counts, premium labels, immediate totals, cart persistence and server quotes. Complete local captures: `work/qa/premium/`; selected evidence is under `screenshots/`.
- Existing email previews and template from PR #39 are retained. Actual iPhone Gmail/Apple Mail inbox delivery remains untested; it requires separately authorized internal email UAT. Browser screenshots are not real client delivery evidence.

## Controlled future merge/deployment/activation sequence

**No action below was executed in this sprint. Each merge, deploy, flag write and commercial publication requires separate founder authorization.**

1. Verify current main and both exact PR heads/CI. Inspect Railway source/autodeploy settings read-only. If merging main would deploy automatically, stop until the owner authorizes a controlled release arrangement. Do not assume autodeploy is off.
2. Merge #39 only when authorized. Refresh the pricing PR against that main, rerun affected gates, then obtain authorization for its exact final head. Do not deploy an intermediate pricing/email combination accidentally.
3. Before a Production deployment/activation, privately audit current published prices/rules and existing unpaid premium checkouts; verify a consistent private SQLite backup and isolated restore. Do not export customer data into PRs. Preserve all existing recipients, keys, provider registrations and flags.
4. Authorized code deployment may run with premium pricing OFF: no covering publication and no new catalog data. Smoke-test health, legacy ordering, frozen historical records and email configuration. This is a code release, not commercial activation.
5. With separate activation approval, set only `PAN_PACK_PREMIUM_PRICING_ENABLED=true` and perform the required controlled configuration deployment. Keep `PERSONALIZED_PACKS_ENABLED`, catalog flags, Paymennt/Resend/Meta configuration unchanged. Verify the server policy, eight quote prices, stale/invalid rejection and original 28 rules first. If the published Pistachio price conflicts, STOP; do not overwrite it. No synthetic LIVE transaction.
6. Only after those prices are verified, use the existing Product Hub admin workflow: fresh revision/version, no unrelated draft, add covering to exactly four Traditional rules, review eligibility-only diff, publish once under separate approval. Expected 8 rules / 32 component authorizations; Filled rules byte-identical. Never enable covering under fixed pricing.
7. Smoke EN/ES/AR menu, builder, cart and checkout: AED70 / AED123 / AED146, all eight base options, positive/negative zone minimums, pickup, exact capacity and cross-family rejection. No payment/provider calls are needed for these quote checks.
8. Observe a separately authorized natural paid order/internal email and verify immutable accepted amount/contents and one alert per recipient. Never replay old notification events. Actual-client mail UAT is a separate approved send/observation.

## Independent rollback

- Before activation/new-model orders: code can return to the validated email-only build, with the existing Production eligibility and configuration retained. Never restore an older SQLite database or reset events.
- After new-model orders exist: retain code that understands `priceSnapshot`; old email-only consumers use base prices and cannot safely replace it. Prefer forward repair or a compatible code rollback. Paid and pending accepted new-model snapshots remain untouched.
- Eligibility rollback can remove the four newly added Traditional covering approvals using a fresh Product Hub diff, while retaining premium pricing ON and Filled approvals/rates unchanged. New carts lose covering; accepted historical preparations remain intact.
- Do NOT switch pricing OFF while leaving Filled Pistachio purchasable under the old fixed model: that would undercharge. If stopping premium pricing becomes necessary, first obtain separate authorization for a coordinated eligibility change excluding premium components from NEW boxes (including Filled Pistachio), retain compatible historical readers, then switch the flag. Do not alter standalone availability. This is not an automatic rollback instruction or authorization.
- No catalog-wide import, data restore, old-event resend, extra charge/refund, credential change or provider registration change belongs in rollback.

## Commercial / execution checklist

- [x] Traditional Sugar + Sesame included.
- [x] Founder/Lisa approval: covering +AED5/+AED6; gated until verified pricing.
- [x] Filled Pistachio +FULL AED23/+AED26 from the first piece; no extra pieces.
- [x] Published base/individual prices verified read-only; no commercial files changed.
- [ ] Exact merge approvals.
- [ ] Controlled Production deployment and private backup/preflight authorization.
- [ ] Premium flag activation approval.
- [ ] Separate Product Hub eligibility-only publication approval.
- [ ] Natural paid-event / actual mail-client UAT authorization.

## Validation record

Local validation of the candidate: typecheck/lint/build passed; **656/656 commerce/unit/HTTP tests**, including 18 new premium-pricing tests, frozen checkout, duplicate reconciliation, refunds and email integration. Original Sites packaging **4/4**; heuristic secret scan **0 findings**; npm audit **0 vulnerabilities**. Local browser suites: premium pricing 24/24; inherited email 6/6; legacy packs 24/24; checkout 21/21 Chromium + 21/21 WebKit; Product Hub 8/8 (104/104 total). Final GitHub checks, including the Operations suite, are recorded in the PR. No LIVE order/payment/email or private Production data was used.
