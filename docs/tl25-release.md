# TL-25 provider activation — engineering release

Baseline verified clean: `release/3l-production-cleanup`, `077d7f69b351f5696c4484ef311f76f10a6404ce`. Work branch: `release/3l-provider-activation-final`. No Lovable, push, merge, deployment, real provider messages or merchant charges.

## Paymennt

`server/adapters/paymennt-notification.ts` implements Support's Base64 HMAC-SHA256 contract using exact request Buffer bytes and constant-time comparison. It rejects missing keys/signatures, malformed signatures and altered whitespace. HTTP validates `X-PointCheckout-Topic` against created/paid/cancelled/expired/failed/refunded before JSON schema validation.

Receipt identity hashes the tuple checkout ID, normalized status and optional statusUpdateTimestamp. Checkout ID alone is never the event identity. SQLite persists the receipt before contacting Paymennt. Successful reconciliation and completion of the receipt commit in the same transaction. GET failures, financial mismatches or storage failures receive non-2xx; durable pending receipts retry with capped backoff. Readiness exposes pending notification count. A terminal notification that precedes the authoritative state remains retryable.

The authoritative checkout must match checkout ID, request/payment ID, internal order ID, AED and exact integer-fils amount. The official response's `amount` represents grand total. Paid/Confirmed cannot come from webhook fields, redirects or browser commands. Duplicate receipt replay cannot duplicate fulfillment/customer messaging. Refund/dispute changes the payment and records operator review while preserving order history; fulfillment guards stop further movement. Older unsettled states never regress a settled payment.

TEST registration uses official `POST /webhooks` with `address`. The explicit compiled server tool persists a private 0600 receipt containing the returned ID/hmacKey, with exclusive intent and atomic replacement/fsync; secrets cannot be placed inside the checkout/static assets. An uncertain registration is not retried automatically. Secret content is never printed; readiness reports only configured/not configured. Actual registration awaits the merchant TEST account.

## Meta

Provider groups now configure independently, so Meta does not wait for Paymennt credentials. `.env.example` lists shared Meta secret/token/version settings, `META_NUMBERS_JSON` for three unique source mappings and approved template JSON. `META_OUTBOUND_ENABLED=true` is explicit and requires full Meta configuration. No source edits are needed for actual account values.

The existing signed challenge/batched raw HMAC webhook path remains durable; text, GPS, unsupported media and statuses remain normalized. Outbound uses the stored source alias and business phone, never another number. Persistent jobs stop on uncertain timeout; definite rejection can be retried by an operator. Inside 24h text is allowed; outside it a configured approved payment template is required, with explicit actionable errors. The selected template must contain two body parameters: amount and full checkout URL.

New administrator-only staging account validation checks each configured phone ID belongs to its WABA via a read-only Meta request. It never sends a message. Explicit TEST replies are sent by an operator from a received conversation through the normal persistent Inbox workflow. Per-number diagnostics expose boolean configuration, template/window prerequisites, last inbound/outbound-success timestamps and sanitized error state, without phone numbers/tokens.

## Commercial and catalog

JLT B/C/D are resolved at 30 AED minimum, preserving free delivery and existing fee state. Remraam is canonical; `REMRAN` remains an alias and stable ID `remran` avoids breaking existing references. A one-time migration marker applies confirmed updates to existing stores. No other fee is inferred. The remaining 88 unknown-fee rules stay visible and block charges until reviewed; confirmed JLT B/C/D rules are usable.

Approved catalog import is JSON version 1, validated with Zod and exact decimal-string→integer-fils conversion. It rejects duplicate/missing IDs, invalid prices and unexpected fields. Dry-run is read-only. Apply creates and verifies a private unique SQLite backup first; rollback restores only catalog content and preserves newer orders/receipts. Runtime starts with no products. Inactive/unavailable products are excluded from the sales selector and blocked server-side. Issued payments preserve their catalog snapshot as well as the amount. Lisa's approved JSON is the only missing catalog artifact; no products are invented.

Template: `docs/catalog/template.json`; schema contract and compiled commands: `docs/catalog/README.md`; implementation: `server/domain/catalog.ts` and `scripts/catalog-import.ts`.

## Readiness and activation

`/operations/readiness` exposes provider, commercial, catalog, auth, HTTPS, persistence and backup checks only to staging administrators. Public `/api/ready` exposes storage/environment health only. Mapbox diagnostics take explicit real coordinates or a received location; no synthetic coordinate is seeded. Runtime diagnostics distinguish configuration from observed connectivity/notifications and never infer PILOT READY from fixtures.

The engineering decision is **INTERNAL READY / EXTERNAL INPUT REQUIRED**. `INTEGRATION READY` requires observed provider checks, a reconciled notification, configured outbound, approved catalog and healthy storage/auth/backup. Production/live remains deliberately blocked. Real UAT is not asserted or fabricated.

Follow the 37 owner-labelled steps in `docs/today-activation-runbook.md`. Steps 23–30 depend on the approved catalog: if it has not arrived, resume those tests after steps 31–33 rather than inventing an item.

## Validation

- Strict typecheck and ESLint pass, including server/admin TypeScript tools.
- 108 domain/adapter/HTTP/SQLite/catalog/brand tests pass.
- HTTP golden path uses real Meta/Paymennt/Mapbox adapters with isolated simulated HTTP responses: signed WA2 inbound → order → GPS → 30 AED rule → TEST checkout → WA2 send → signed payment notification → authoritative GET → Paid/Confirmed → Production → Ready → Out for Delivery → Delivered. Repeated notification preserves messages and fulfillment history.
- 10 browser E2E scenarios pass. After final label/accessibility polish, staging was rerun: 1/1 passes at 390/768/1024/1440, no horizontal overflow, no axe violations or browser console errors. Brand regression still covers its original responsive matrix.
- Production build and 4 Sites packaging tests pass. Compiled catalog dry-run successfully validates the zero-product template.
- Dependency audit: zero known vulnerabilities at validation time. Heuristic source/client-bundle secret scan: zero findings. This is not a claim of exhaustive external security certification.
- Clean HTTPS staging test proves zero conversations/orders/payments/products, real-role authentication mechanics through isolated test accounts, private readiness and working backups. Fixtures remain under tests only.

## External-only inputs

1. Lisa-authorized real Meta/WhatsApp account access and credentials for WA1/WA2/WA3, including template approval.
2. Merchant Paymennt TEST account access and credentials, allowing actual registration and receipt of its one-time hmacKey.
3. Lisa's approved catalog file.
4. Real provider/GPS validation and Lisa UAT requiring those accounts and business acceptance.

These are activation/account/content inputs, not unimplemented verifier, adapter, importer or workflow code. Local tests do not claim merchant connectivity, actual message delivery, real settlement or PILOT READY.
