# Paymennt TEST → LIVE runbook

Status on 2026-09-14: **PAYMENNT TEST BLOCKED — awaiting manual TEST payment and signed callback evidence**. New Support credentials authenticate successfully (HTTP 200). Webhook registered; hmacKey persisted privately on the TEST volume, mode 0600, and loaded after TEST deployment `2761a245-118d-4c94-aa08-794c1a1a2018`. One synthetic order `TL-13E91EFE` has a hosted checkout for AED 30.00 and remains Awaiting Payment. No signed receipt observed yet. LIVE remains blocked. This document does not authorize activation.

## Current implementation and environment

Use the existing `PaymenntProvider`, notification verifier, durable receipts, authoritative reconciliation and order state machine. Do not create a second implementation or let a notification directly settle an order.

- TEST merchant API: `https://api.test.paymennt.com/mer/v2.0`
- LIVE merchant API already selected in the adapter's environment branch: `https://api.paymennt.com/mer/v2.0`
- Diagnostic: `GET /checkout?requestId=TL18-DIAGNOSTIC-NO-CHECKOUT`.
- Current TEST webhook address: `https://tres-leches-pasteleria-demo-paymennt-test.up.railway.app/api/webhooks/payment`.
- Headers for merchant authentication: `X-Paymennt-Api-Key`, `X-Paymennt-Api-Secret`.
- No public key is used or required by this hosted-link architecture. Do not introduce a `VITE_` payment credential. An embedded checkout SDK would require separate reviewed architecture; it is not part of this integration.

## Resolve TEST authentication first

Update `PAYMENNT_API_KEY` and `PAYMENNT_API_SECRET` only in Railway's **paymennt-test** service variables using the new TEST merchant credentials supplied by Support. Keep `PAYMENNT_ENVIRONMENT=test`. Never paste secret values into chat, shell arguments, source, screenshots or reports.

The replacement Support TEST pair was installed securely and tested on 2026-09-14: **HTTP 200**. This supersedes the earlier 401 result. Credentials are server-only Railway variables. Retain only diagnostic status; never log authentication values or raw Support messages.

## Register the webhook

1. Verify TEST authentication succeeds and the public TEST service is healthy.
2. Set `PAYMENNT_WEBHOOK_SECRET_FILE` to an absolute private persistent path, such as `/data/private/paymennt-test-webhook.json`, outside the repository and any served directories. Parent directory must be private and the file must be mode 0600.
3. Run the existing `scripts/register-paymennt-webhook.ts register` tooling in the TEST service context with `APP_ENV=staging`, `PAYMENNT_ENVIRONMENT=test`, correct `APP_ORIGIN` and secret credentials supplied by environment. Equivalent source-tree command: `npm run paymennt:register -- register`. The compiled runtime does not imply that tsx/dev dependencies are installed; use the reviewed tooling in a private runtime with persistent storage, not an ad-hoc replacement API implementation.
4. Tooling POSTs `{address}` to `/webhooks`, stores the returned registration JSON and `hmacKey` atomically and privately, fsyncs it, and prints only `WEBHOOK CONFIGURED`. It creates an exclusive pending marker before the request. Never retry blindly after a timeout or uncertain result; inspect private registration state and confirm with Support first.
5. Verify supported merchant topics with Support/registration configuration: `checkout/created`, `checkout/paid`, `checkout/cancelled`, `checkout/expired`, `checkout/failed`, `checkout/refunded`. The existing registration request does not send a topic subscription field; do not invent one or claim per-topic subscriptions were registered without confirmation.
6. Reload the service as required so it reads the configured private key. Check readiness. Never send the key to the frontend or copy a TEST registration/key into LIVE.

Verification uses `X-PointCheckout-Hmac-Sha256`, HMAC-SHA256 over exact original raw bytes before JSON parsing, Base64 digest and length-checked `timingSafeEqual`. Supported topic comes from `X-PointCheckout-Topic`. Implementation readiness is not evidence of a real signed notification.

## Controlled TEST payment

Use one synthetic UAT order, no customer PII and no real WhatsApp send. Use an explicitly recorded small AED amount compatible with the authoritative commercial rule; do not bypass minimum checks or invent missing rates. Keep request ID/order ID stable and do not retry an uncertain checkout POST until recovery by request ID proves whether it exists.

Return the hosted TEST checkout URL to the operator and stop before card entry. The operator uses the official TEST card provided by Support. Never collect or store card details.

After operator completion, verify a durable signed receipt and then `GET /checkout/{checkoutId}`. Match checkout ID, request ID, order ID, exact amount and AED currency to the pending order. Only the matching authoritative paid response may settle it. Replay the identical notification safely: no extra payment, confirmation, fulfillment or outbound job. Record only safe identifiers, statuses and timestamps.

## Required reviewed LIVE release (not just changing variables)

**Current code deliberately rejects LIVE.** `server/config.ts`, the `PaymenntProvider` constructor and registration tooling are TEST-only, and the current production runtime contract requires providers offline. Simply changing `PAYMENNT_ENVIRONMENT` will not activate LIVE successfully.

Before a separately approved LIVE release, review these explicit activation guards to allow the authorized environment while preserving auth/RBAC, reconciliation, signatures, idempotency and all negative tests. Generalize the same registration tooling for an explicitly approved LIVE context; do not create a second payment implementation. Complete TEST UAT, Lisa acceptance and merchant website requirements first. No guards were changed in this task.

Replace/configure only in the separately approved LIVE environment:

| Variable | Required value/change |
|---|---|
| `PAYMENNT_API_KEY` | New LIVE merchant key in secret variables |
| `PAYMENNT_API_SECRET` | New LIVE merchant secret in secret variables |
| `PAYMENNT_ENVIRONMENT` | `live`, only after reviewed guard support |
| `PAYMENNT_WEBHOOK_SECRET_FILE` | Separate private LIVE registration file, never the TEST file |
| `APP_ORIGIN` | Approved LIVE HTTPS origin |
| `APP_ENV` / `PROVIDER_MODE` | Values permitted by the future reviewed activation contract; do not guess or copy TEST configuration |

No direct base-URL variable currently exists; the existing adapter derives the endpoint from environment. Keep Meta outbound and AI autonomy disabled unless separately authorized. Register a fresh LIVE webhook for the LIVE origin and store its independently returned key.

## LIVE smoke test and rollback

After explicit authorization for one controlled real charge (merchant, amount and operator), verify health/auth/backup, create one synthetic order, and have the operator manually pay through the LIVE hosted page. Verify signature, durable receipt, authoritative identity/amount/currency, single confirmation and duplicate delivery handling. Refund only with separate authorization and provider support. A successful HTTP registration is not a successful payment test.

Rollback: stop new checkout creation/outbound processing with the approved release's provider controls; retain receipts and pending reconciliation state. Restore the last compatible release and configuration with providers offline if necessary. Do not overwrite SQLite with an old backup that drops real transactions. Reconcile any uncertain charge against the provider before retrying. Re-enable only after checking schema compatibility, restored storage and authoritative payment state.

Verify TEST keys are absent from LIVE through private in-memory comparison/fingerprints and secret-source metadata, never printing values. Confirm the selected merchant endpoint is the LIVE host, the fresh registration belongs to the LIVE origin, and no TEST secret file is mounted. A key name or prefix alone does not prove merchant environment. Retain separate TEST infrastructure and credentials; do not copy them into production.
