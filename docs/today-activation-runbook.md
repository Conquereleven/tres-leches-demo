# TL-25 — today's TEST activation

Use branch `release/3l-provider-activation-final`. Never use Lovable, production mode, live Paymennt, demo seeds or a static Sites deployment as the operational backend. All actions below are explicit operator actions. No test message or charge is sent automatically by startup or diagnostics.

Prerequisites: build this release with `npm ci` and `npm run build`; keep `.env`/provider secrets outside the checkout/static directory, mode 0600. Supply the `.env.example` staging settings through the server secret manager. Start with `PROVIDER_MODE=offline`, `META_OUTBOUND_ENABLED=false`, `STAGING_SEED=empty`. Configure a new persistent database, separate backup directory and HTTPS reverse proxy. Generate real admin/manager/operator credentials with `node scripts/operator-password.mjs USER_ID ROLE` using secure password stdin; no fixture passwords. Start Node with `node --env-file=/absolute/private/staging.env dist/node/server.mjs`. Application settings are read on restart.

Meta uses `META_NUMBERS_JSON`: exactly three objects with id `wa1`/`wa2`/`wa3`, label, real E.164 `phone`, `phoneNumberId`, and `wabaId`. Shared settings: `META_GRAPH_VERSION`, `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN`. `META_PAYMENT_TEMPLATE_JSON` contains the approved name/language; this release supports a body with two text parameters in order: AED amount and full checkout URL. Select/approve that template shape during onboarding; no source change is required for its name/language/account values.

Set `PROVIDER_MODE=test` to activate configured groups independently. Missing groups remain offline. Enabling `META_OUTBOUND_ENABLED=true` requires complete Meta configuration and never switches the origin number. Paymennt has no configurable host and always calls the TEST API. Mapbox requires `MAPBOX_ACCESS_TOKEN` and explicit permanent-geocoding entitlement `MAPBOX_PERMANENT_ENABLED=true`.

Sequence (owner tags are responsibilities, not automatic actions):

1. **OUR TEAM** — Boot the clean staging release; confirm zero conversations, orders, payments and products on a new database.
2. **OUR TEAM** — Verify real admin, manager and operator login/permissions; check backup status and restore procedure.
3. **OUR TEAM** — Configure Mapbox token and permanent-geocoding entitlement; restart with `PROVIDER_MODE=test`.
4. **OUR TEAM** — In `/operations/readiness`, enter the real store's Dubai coordinates and run Mapbox connectivity; confirm the returned location through a received GPS order before approving a commercial mapping. No geographic fixture is stored at runtime.
5. **LISA / META** — Obtain authorized Meta Business access.
6. **LISA / META** — Identify which real operational numbers are WA1, WA2 and WA3.
7. **META / OUR TEAM** — Enter all WABA IDs and phone-number IDs in `META_NUMBERS_JSON` with the corresponding business phone.
8. **META / OUR TEAM** — Enter app secret, verify token, access token and Graph version privately; restart and run “Validar configuración Meta”.
9. **META / OUR TEAM** — Configure `https://STAGING-ORIGIN/api/webhooks/whatsapp` and subscribe the app/WABAs to messages.
10. **META / OUR TEAM** — Complete GET challenge using the configured verify token; verify Meta dashboard success.
11. **LISA / META** — Send an inbound test to WA1 from an authorized real test recipient.
12. **OUR TEAM / META** — Explicitly enable outbound, take that conversation and send a TEST reply in the canonical Inbox.
13. **LISA / META** — Send an inbound test to WA2.
14. **OUR TEAM / META** — Take that WA2 conversation and reply explicitly.
15. **LISA / META** — Send an inbound test to WA3.
16. **OUR TEAM / META** — Take that WA3 conversation and reply explicitly.
17. **OUR TEAM / META** — Confirm sender/origin for every reply. Check last inbound/outbound diagnostics; no number fallback is permitted. Unknown send outcome requires provider review before any retry.
18. **META / OUR TEAM** — Inspect approved payment-template name/language and two-body-parameter shape; configure it. Outside 24h, missing template fails visibly and sends nothing.
19. **PAYMENNT / OUR TEAM** — Enter merchant TEST API key and secret; keep `PAYMENNT_ENVIRONMENT=test`.
20. **OUR TEAM / PAYMENNT** — Restart and run “Comprobar Paymennt TEST”; this is a read-only checkout search.
21. **OUR TEAM / PAYMENNT** — Set an absolute private `PAYMENNT_WEBHOOK_SECRET_FILE` that does not exist yet. Explicitly run `node --env-file=/absolute/private/staging.env dist/node/register-paymennt-webhook.js register` once.
22. **OUR TEAM** — The command stores the returned `hmacKey` and webhook ID privately with mode 0600 and fsync. Never copy its contents into chat, logs or the frontend. Restart; readiness must show WEBHOOK CONFIGURED. If a pending marker remains, inspect the merchant registration with Paymennt before retrying; never blindly create a second webhook.
23. **OUR TEAM / PAYMENNT** — Create one TEST checkout from a real catalog-backed order meeting a verified rule. **If Lisa's catalog has not arrived, defer steps 23–30 until steps 31–33 complete. Never invent a product or price to force this test.** JLT B/C/D have confirmed 30 AED minimum/free delivery; all other unknown fees stay blocked.
24. **OUR TEAM / META** — Request Payment in that order; verify its link is sent from the conversation's origin number.
25. **LISA / PAYMENNT** — Complete the TEST checkout using the provider's authorized test-payment procedure.
26. **PAYMENNT / OUR TEAM** — Receive the notification at `/api/webhooks/payment` with the documented Base64 HMAC signature and allowed topic.
27. **OUR TEAM / PAYMENNT** — Confirm authoritative GET reconciliation matches checkout, request, order, AED and exact integer-fils total.
28. **OUR TEAM** — Verify payment PAID and a reconciliation timestamp.
29. **OUR TEAM** — Verify order CONFIRMED only after the verified reconciliation; redirects alone cannot settle it.
30. **OUR TEAM / PAYMENNT** — Replay the same authorized signed notification where practical; verify no additional fulfillment transition or customer message.
31. **LISA** — Deliver the approved catalog JSON using `docs/catalog/template.json` and its field contract. Receiving the file is not an automatic import.
32. **OUR TEAM** — Run `node dist/node/catalog-import.js dry-run /absolute/private/approved-catalog.json`; resolve validation errors with Lisa without guessing content.
33. **OUR TEAM** — Apply using `node --env-file=/absolute/private/staging.env dist/node/catalog-import.js apply /absolute/private/approved-catalog.json`; retain the backup. Resume deferred checkout tests now.
34. **LISA / OUR TEAM** — Send one real Dubai GPS through WhatsApp; verify the detected zone and commercial rule. Attach a provider canonical ID/polygon through the existing zone admin if needed; never infer unknown fees.
35. **LISA / OUR TEAM / META / PAYMENNT** — Run core UAT: three source numbers, below-minimum and unresolved-zone blocks, payment failures/expiry, approved template, paid→fulfillment→Delivered, duplicate notification and refund/operator-review behavior. Record actual evidence privately.
36. **OUR TEAM / LISA** — Review admin readiness, account observations, backups and UAT evidence. Configuration/automated fixtures do not imply PILOT READY.
37. **LISA / OUR TEAM** — Only then discuss a separately reviewed live/production switch. This release intentionally rejects live Paymennt and production boot.

Before accounts/content arrive, the engineering target is **INTERNAL READY / EXTERNAL INPUT REQUIRED**. Runtime component checks remain explicit about incomplete setup. Do not claim real provider validation from fixtures. If a terminal notification arrives before GET reflects its status, acknowledgment is deferred and reconciliation retries. Persistent pending notifications are retried internally with capped backoff and survive restart; Paymennt also retries non-2xx/connection failures after 5m, 10m, 15m, 30m, 1h, 4h, 12h, 12h. A failed storage write never receives a success acknowledgment.

Protocol references: [Paymennt official OpenAPI](https://docs.paymennt.com/openapi/paymennt.yaml), retrieved 2026-09-11 (`POST /webhooks`, address, response id/hmacKey); exact notification signature/topics/retry contract supplied by Paymennt Support in the user's TL-25 request. `amount` in the official checkout response is the order grand total, converted to integer fils. Notifications only trigger authoritative GET; they never provide financial authority.
