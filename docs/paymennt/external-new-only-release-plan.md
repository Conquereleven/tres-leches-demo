# 3L Paymennt webhooks: new-only release plan (NOT AUTHORIZED FOR PRODUCTION)

## Decision and invariant

This release is authorized for preparation and review only. **Do not deploy, set Production configuration, or close historical receipts.** The 31 existing unmatched payment-notification receipts from the Oct 9 audit remain open until separately approved.

Source: `fix/3l-paymennt-external-checkouts` at `79e4603`, enhanced on `fix/3l-paymennt-new-only-gated`.

## Technical gating

- New required opt-in environment variable for external checkout acknowledgement: `PAYMENNT_EXTERNAL_ACK_SINCE`, an exact UTC ISO-8601 timestamp ending `Z`, e.g. `2026-10-09T16:00:00Z` (illustration only; **never copy this as the production cutoff**).
- When unset, external checkout auto-acknowledgement is **disabled**; matched website payments still reconcile.
- An unmatched provider-confirmed checkout may be acknowledged as external only if the notification was **first received on/after the explicit cutoff** AND the same checkout has no earlier receipt that predates the cutoff.
- The original receipt's `receivedAt` survives Paymennt retries; a changed webhook status must not transform a legacy checkout into a new one.
- Background drain skips historical unmatched receipts, leaving their stored state untouched and not starving new receipts. Legacy website-owned receipts may still reconcile as normal.
- External classification still requires the authoritative Paymennt GET; unknown, inconsistent, and unassociated website-owned references retain retry behavior.
- Do not alter payment/order records or silently remove Paymennt registrations.
- Historical signed callbacks can continue returning 503 and Paymennt can continue retrying until a separate backlog decision. Do not describe this as complete elimination of all 503 noise.

## Independent review corrections (9 October 2026)

- The cutoff is parsed by `parseExternalAckSince` (`server/domain/external-ack.ts`). It must read back exactly as
  written: impossible dates such as `2026-02-30T00:00:00Z`, which the runtime would silently roll forward to
  2 March, now stop the server from starting, like any other malformed value.
- Hard floor `2026-10-09T13:00:00Z`: a configured cutoff earlier than this is raised to it. Every receipt in the
  9 October audit was first received before 11:00 UTC that day, so no configuration mistake can make them eligible.
  Receipts that arrive between the floor and the real activation are protected only by choosing the cutoff at
  deploy time, as described below.
- With the variable unset the worker behaves exactly as Production does today: it retries open receipts and their
  attempt counter grows; nothing is closed. With it set, the worker does not touch historical unmatched receipts.
- Added tests: parser acceptance and rejection, the floor against a 31-receipt backlog, restart durability on a
  file-backed store (same, later and no cutoff), and three HTTP-level cases against the fixture server
  (acknowledged with cutoff; 503 without; server refuses to start on an invalid cutoff).

## Mandatory implementation QA before GO

1. Run typecheck, lint, build, all unit/HTTP tests, checkout, payment, and staging browser suites.
2. Unit tests: explicit cutoff absent; future/new external checkout acknowledgement; old receipt unchanged; webhook retry of the same old receipt; different webhook status for an old checkout; old backlog not starving a new external receipt; existing website match, delayed association, unknown provider response, duplicate notification, provider API failure, and restart durability.
3. Verify UTC cutoff parser rejects invalid or ambiguous values, including missing timezone.
4. On TEST, use Paymennt TEST only: a website-created checkout stays unchanged, an external checkout created after cutoff gets 200, and injected legacy receipts remain open after worker/retry.
5. Compare branch diff against the **actual deployed commit**, not against an outdated historical `main`.
6. Keep receipt IDs, provider credentials, HMAC and personal data out of screenshots/logs and repository documentation.

## Proposed Production release (requires fresh user authorization)

**Preflight, read-only:**

1. Confirm live Railway service and deployed SHA; verify correct webhooks registration. Keep valid registration ID `1877924360153181328`; leave obsolete root registration `1876030766762052645` untouched pending separate Paymennt/support action.
2. Back up the actual persistent Production SQLite database and verify integrity. Record exact IDs and fingerprints of existing open historical receipts (31 at previous audit), orders, payments, zones, and catalog. No write.
3. Reconcile any difference since the last audit; STOP if an old receipt unexpectedly completed or matches a website payment.
4. Record exact release artifact and rollback deployment. Validate no pending Railway staged changes.
5. Choose a fresh, explicit activation UTC cutoff **at deploy time**, AFTER all historical receipts being preserved were first received. Any receipt received before this time remains ineligible even if its callback is retried.

**Controlled activation:** 6. Configure `PAYMENNT_EXTERNAL_ACK_SINCE` in the correct Production service together with deploying the exact reviewed commit, with permission for both steps obtained beforehand. Keep Meta, Resend and other flags unchanged. 7. Validate app health and provider connectivity. Observe new natural external webhook events only; do not create paid live transactions or synthetic customer orders without separate permission. 8. Confirm new external receipts close only when provider-confirmed; original historical receipt IDs remain open and unchanged in their completion/outcome; all website payment/order integrity checks unchanged; new provider failures still retry. 9. Monitor 4xx/5xx, notification backlog and Paymennt registration status. Legacy 503s may continue until separately reconciled.

**Rollback:** 10. Roll back the app to its documented last healthy deployment if critical regressions arise; remove the activation variable only as part of authorized rollback. Preserve all orders/payments and all 31 historical receipts. Do not restore an old DB backup over new customer transactions. Audit any new external acknowledgements for review.

## Separate approvals, never bundled

- Closing 31 historical unmatched receipts as `external` must use a separately authorized read-only plan plus targeted apply/backup.
- Removing obsolete Paymennt registration `1876030766762052645` requires explicit authorization after the correct `/api/webhooks/payment` registration is verified.
- No GitHub merge or Railway deployment of this payment-change PR until QA is independently reproduced.
