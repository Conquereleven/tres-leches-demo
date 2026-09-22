# Direct Paymennt TEST checkout

Baseline: ee27faebaee5effd43220e5433fc1be5ccb18e86. Claude's uncommitted web-checkout domain entry point and ten audit cases were recovered and extended, not discarded. Unrelated pending Meta work stays in the original working tree. Commit 9445735 separately restores only the accidentally shipped operational-number placeholder hunk; WebP/JPEG MIME and storefront/compliance content remain intact.

## Runtime and authority

Public routes: GET /api/checkout/config, POST /api/checkout/quote, POST /api/checkout, POST /api/checkout/status; UI /#bakery and /checkout/return. Creation is limited to staging + PROVIDER_MODE=test + configured Paymennt adapter + private webhook key; production offline rejects it with 503. An isolated test harness may inject the real adapter with fixture transport only in APP_ENV=test.

The new public entry point reuses CommerceService commands, quoteOrder, catalog validation, SQLite, the outbox worker, Paymennt adapter, signed raw-byte HMAC webhook, authoritative GET and existing state machine. No card data is collected. Web conversations use source `web`; they never send payment links through a fabricated/default WhatsApp number. The existing public WhatsApp contact link remains available and includes quantity.

`data-imports/pan-de-muerto.json` uses the existing import format: ID pan-de-muerto, Pan de Muerto, priceAed 25.00 → 2500 fils, active/available, Bakery. Currency remains the domain's AED. No inventory, allergen, ingredient, variant or lead-time values were introduced.

Actual seed and authenticated TEST workspace confirmed jlt-cluster-c (also B/D): minimum AED 30, deliveryFeeAed 0, freeDelivery true, TL-25 confirmed. Only active rules with known amounts are offered. Unknown fees remain blocked. Customer selects the delivery zone and supplies a fulfillment address; this is not a claim of GPS/geocoder verification. One unit is AED 25 and fails; two units subtotal/total 5000 fils and fee 0. No zones are rewritten.

## Idempotency and privacy

A checkout-level durable receipt stores the hash of a random UUID capability, normalized input hash and order ID. Receipt, web conversation, domain commands and payment job commit in one synchronous SQLite transaction before network dispatch. Concurrent retries reuse the existing payment; altered input under the same key rejects. Transaction failure rolls back drafts. Uncertain provider responses retain the receipt/job and are not blindly POSTed again. Existing administrator reconciliation can recover by provider request ID. Creating another request ID is a new checkout, not a retry.

The customer status API requires the random capability, not an order ID plus guessable phone. It returns only order reference, state, amount, currency and pending hosted URL. It never exposes customer/address/provider credentials. Session storage keeps checkout continuity; a different browser/device without that session cannot view private status. POSTs require same origin and JSON, schemas reject extra amount/price/fee/currency/status fields, and existing request/body limits apply.

Return-page URL parameters carry no authority. The hosted payment-link API schema has no documented returnUrl: preserve `/checkout/link` rather than invent a parameter or create a separate web-payment integration. PAY SECURELY opens hosted TEST payment in a separate tab and leaves the original 3L tab on its polling status page. If the browser blocks popups, that page offers CONTINUE EXISTING PAYMENT. Return to the original tab after payment. Confirmed displays only after the reconciled payment is paid and the order has reached Confirmed or later. A pending, failed, cancelled or expired payment never becomes success from a redirect.

## TEST-only release/import

Target project 1f9a94c1-0574-49a9-b579-bf6af3aad601, environment b32d77cf-6597-4b3e-9810-caf275bffb68 (paymennt-test), service fe8c1417-39ca-4038-b94e-68659ab1c659. Existing volume/domain/secrets are reused. No second service, SSH credential or production change is needed.

Explicit TEST start command: `node scripts/start-paymennt-test.mjs`. This is not the default npm start. It rejects any other project/environment/service, wrong runtime/profile/provider mode or enabled Meta outbound. It reads current catalog/zone first, validates the merged approved import through the existing CLI dry-run, takes and verifies a SQLite online backup BEFORE any application DB write, invokes the existing backup-protected catalog importer, and verifies the canonical item. Existing items are preserved. Conflicting canonical records or changed JLT rules fail closed. An already-correct product is a no-op on restart. Logs contain counts, approved non-secret product facts and backup paths only. Backups remain on the private TEST volume; off-volume disaster recovery is separate.

Clean Git snapshot only. Set BUILD_SOURCE_SHA to the committed source SHA in TEST so /api/health attests the build. No Production deployment, provider-mode change, catalog mutation, LIVE key or zone mutation is authorized by this runbook.

## Reviewer (Tarek)

Open https://tres-leches-pasteleria-demo-paymennt-test.up.railway.app/#bakery after release health/config verification. Select quantity 2; choose JLT Cluster C. Enter only UAT reviewer name, a non-customer test contact and an explicitly labeled UAT delivery address. Verify unit AED 25, subtotal AED 50, delivery FREE, total AED 50. Click PAY SECURELY. Use only Paymennt's approved TEST card on the hosted page; no real card or customer information. Return to the original 3L tab; it stays pending until verified reconciliation and then displays PAYMENT CONFIRMED. Retrying the same browser request reuses the checkout. A missing callback must be investigated, never forced green. The previous authenticated read found TEST catalog count 0; record post-deploy count and deployment ID in release evidence.

## Verification

Run typecheck, lint, full commerce/HTTP tests, build, secret scan, Sites regression and dependency audit. `node --import tsx tests/fixtures/catalog-bootstrap-check.ts` (after build) verifies wrong-target rejection, pre-mutation backup, import and repeat-start idempotence on a disposable DB. `npx playwright test --config playwright.checkout.config.ts` exercises quantity, minimum, hosted handoff, status-param rejection, mobile width and WhatsApp fallback with isolated provider fixtures. Browser checks are not proof of a real TEST card settlement; the reviewer completes that separately.
