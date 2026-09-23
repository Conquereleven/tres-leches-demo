# Embedded Paymennt TEST checkout

The existing web checkout owns the order, quote and payment record. `/api/checkout/prepare` creates these atomically without enqueueing a hosted-link job. The official Paymennt Frames script owns the cross-origin card iframe. Only the browser-safe `PAYMENNT_PUBLIC_KEY` is returned by the configuration endpoint, and only while TEST is enabled. Production remains offline and returns no key.

`/api/checkout/token` strictly accepts the checkout capability, internal order ID, token and email. Price, card fields, currency and status are rejected. The backend reloads the order and current catalog/zone rule, validates its amount against the existing payment, atomically claims the attempt, then calls `/payment/debit` with `source.type=TOKEN` and trusted checkout details. No token is persisted or logged. Concurrent or repeated submissions cannot debit again. Ambiguous transport outcomes remain blocked until reconciliation; no blind POST retries.

A verified CAPTURED response with matching checkout identity, AED amount and PAID checkout status runs the existing financial transition to Paid/Confirmed immediately. REDIRECT accepts only the TEST provider's documented authentication path. On return, `/api/checkout/reconcile` calls GET `/payment/{id}`, validates its checkout identity, and uses the same transition method. Browser return parameters are ignored. The signed webhook endpoint and authoritative checkout GET reconciliation remain unchanged, including raw-body Base64 HMAC and durable receipts. A callback arriving before the direct response is retried by the existing notification worker.

An explicit retry is accepted only after authoritative failed/cancelled/expired status. It reuses the order and creates a new payment record through the existing command, with the hosted-link outbox entry removed inside the same transaction. An uncertain attempt is not eligible for this retry.

CSP permits the official `https://pay.paymennt.com` script and `https://pay.test.paymennt.com` frame, with no broad frame wildcard. An additional message boundary rejects events outside the exact TEST frame origin/source. API credentials and webhook keys remain server-only. The existing browser session stores the order capability/details, never the payment token or card data.

## Configuration / activation

Set only `PAYMENNT_PUBLIC_KEY` in the existing Railway paymennt-test service. API credentials and private HMAC file are reused. Never enable LIVE or deploy this activation to Production. For controlled UAT, select 2 × Pan de Muerto and JLT Cluster C: AED 50 total with free delivery. Use only Paymennt's official TEST card inside the iframe, then measure from PAY to visible confirmation. 3DS requires a separate authoritative return check.

## Apple Pay

The published Frames API and shipped script expose card tokenization, not an Apple Pay component. The reviewed Merchant API schema has TOKEN/STORED_CARD sources and no documented Apple Pay source. Existing credentials alone do not demonstrate wallet activation. Paymennt must confirm the merchant's Apple Pay entitlement and provide its supported web wallet component/API, domain registration requirements and TEST wallet flow. Do not display a simulated Apple Pay button. Card activation does not depend on this clarification.

Sources: https://docs.paymennt.com/docs/payment/frames ; https://docs.paymennt.com/openapi/paymennt.yaml ; https://pay.paymennt.com/static/js/paymennt-frames.js
