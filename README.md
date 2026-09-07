# Tres Leches · WhatsApp Commerce OS

Extends the preserved TL-01–TL-08 storefront with TL-09–TL-12. Start at **Gestión → Inbox**. The seed contains 91 source-derived rules. All customers, three numbers, GPS fixture points, messages and payments are explicitly simulated. No real payment or WhatsApp API is called.

## Run and validate

Node >=22.13 (tested with Node 26.4), npm, writable local disk.

```sh
npm ci
npm run dev
# Local storefront + workspace: http://127.0.0.1:5173
npm run typecheck
npm run lint
npm test
npm run build
npm run test:sites
npx playwright install chromium
npm run test:e2e
npm run test:e2e:build
npm run audit
```

`npm run dev` runs the Node API on loopback port 3001 and Vite on 5173 with a same-origin API proxy. `npm start` serves the built frontend and API from `dist/node/server.mjs`; it needs no TypeScript runtime. Set `APP_ORIGIN` to that server's exact public origin. Environment configuration is process-based; inject `.env.example` values using the deployment environment or Node's `--env-file` flag. Never use `VITE_*` for secrets.

For repeatable browser tests, the Playwright server uses a fresh temporary SQLite database on each run. Do not point tests at a live operational database. The optional `PLAYWRIGHT_BROWSERS_PATH` environment variable can locate an existing browser installation.

## What changed

| Ticket | Implementation |
| --- | --- |
| TL-09 | Structured source-derived zones, aliases, longest-specific-name matching, boundary-inclusive polygons with priority, exact-point mock GeoService, commercial eligibility and admin editor. |
| TL-10 | Three isolated number identities, unified inbox and filters, agent ownership, version checks, durable outbound queue, normalized signed inbound/status webhooks. |
| TL-11 | Swappable PaymentProvider, deterministic mock links, same-source WhatsApp delivery, resend, reconciliation/timeline and duplicate-safe payment webhooks. |
| TL-12 | Server-validated state transitions, audit actors/timestamps, locked checkout quotes, production/delivery views and late-payment review handling. |

The old storefront, checkout, orders, capacity, metrics, translation and approved-answer demo remain available. **Pedidos** and **Inbox anterior · demo** in the outer navigation are the original in-memory MVP. The **Inbox** workspace's own Pedidos/Producción/Entregas views use the new persisted model. Legacy fictitious records are not misrepresented as reconciled operational orders. The catalog is unchanged; storefront-to-operational-order persistence is a separate migration, not silently performed on demo history.

## Golden path

1. Open Gestión → Inbox; WA2's Valentina conversation is selected.
2. In Zonas y tarifas select JVC. Enter a delivery fee confirmed by the business, or an explicitly agreed demo-only value. The source did not specify a fee; no value is invented in the seed.
3. Return to Inbox, take the conversation, create a pedido and add Pastel Tres Leches ×1 (AED120).
4. Use **Simular GPS entrante · JVC**, or resolve a manual address containing JVC.
5. Request Payment. The durable queue creates the mock link and sends it via WA2.
6. Simular resultado de pago → Simular paid. The order records Paid then Confirmed.
7. Advance through Production → Ready → Out for Delivery → Delivered. Inspect both timelines.

The E2E uses AED10 **only in its disposable test database**. It is not a business tariff or a seed value.

## Boundaries and persistence

- `server/domain/`: Zod validation, state machine, delivery eligibility, command handling. All prices are calculated server-side from the catalog in integer fils. Minimum excludes delivery fee.
- `server/adapters/providers.ts`: WhatsAppProvider, PaymentProvider, HMAC verifier and mock implementations. `server/domain/zones.ts`: GeoService and mock.
- `server/db/schema.sql`: versioned SQLite schema. All aggregate changes, event receipts, command receipts and outbound jobs commit together under `BEGIN IMMEDIATE`; WAL/busy timeout support concurrent connections on one host. No external I/O is performed inside the transaction.
- `server/http.ts`: same-origin API, body limit, rate limit, authenticated production-sandbox sessions, RBAC and static serving. No request payloads, secrets, phone numbers or provider error bodies are logged.
- `src/commerce/`: typed UI; it calls only the internal API. New TypeScript is strict with unchecked-index protection. The preserved JSX MVP remains JavaScript, intentionally not disguised with `any` or `@ts-nocheck` conversions.

The SQLite document is an atomic aggregate store for a **single-node deployment**, not a horizontally scalable database. It grows with audit/event history. Before high-volume use, move to normalized relational tables, indexed unique provider/event references, retention/archive policies, backup/restore monitoring and a dedicated queue runner. There is no silent deletion of idempotency receipts. Keep the database on persistent disk with restricted filesystem permissions. Sessions expire after eight hours and require login again after process restart.

A queued job has a persisted lease, 10-second call budget and exponential retries (2/4/8 second intervals, maximum three automatic attempts). Automatic retries require the adapter to declare actual provider idempotency support. An uncertain non-idempotent send is stopped for reconciliation rather than duplicated. A failed safe job exposes a retry action. A late payment is recorded as money received but does not resurrect a cancelled/replaced order. Captured/pending payments block cancellation unless the provider offers a reviewed cancellation flow; the mock deliberately declares no cancellation support.

## HTTP contract

| Route | Purpose |
| --- | --- |
| GET `/api/health` | Readiness and explicit sandbox mode |
| GET `/api/workspace` | Current authenticated workspace snapshot |
| POST `/api/commands` | Zod command; requires `Idempotency-Key`, expected record version and matching Origin |
| POST `/api/login` | Production-sandbox operator login; scrypt password verification and HttpOnly/Secure/SameSite cookie |
| POST `/api/webhooks/whatsapp` | HMAC-verified **normalized internal contract**; inbound message/GPS or delivery status |
| POST `/api/webhooks/payment` | HMAC-verified **normalized internal contract**; reference/amount/currency/transaction reconciliation |
| POST `/api/demo/location`, `/api/demo/payment` | Explicit sandbox fixtures using the same domain event handlers |

These are not advertised as plug-and-play Meta/Paymennt raw webhook endpoints. Real wire-format normalization and provider-specific trust verification belong in those adapters. Unknown `/api/*` returns JSON 404, never the SPA shell. The API rejects invalid signatures before JSON parsing. Do not expose the development server to the public network.

## Connecting real providers later

**Paymennt is identified** in the updated source conversation. Its official [payment-link integration flow](https://docs.paymennt.com/docs/payment/links) says to create the checkout, obtain/share the redirect link, receive an update, then **retrieve the checkout status server-side** before fulfillment. Implement the real PaymentProvider with that verification and amount/currency/reference checks. The mock HMAC scheme is our sandbox contract, not a claim about Paymennt's actual signature protocol. Confirm checkout API credentials, sandbox base URL, merchant/currency, event authentication, capture-vs-authorized semantics, expiry, cancellation and idempotency guarantees with the merchant account. Never treat AUTHORIZED as PAID. Proposed env names: `PAYMENNT_API_KEY`, `PAYMENNT_API_SECRET`, `PAYMENNT_BASE_URL`.

For Meta, implement WhatsAppProvider using `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_GRAPH_VERSION` and a three-number `META_PHONE_NUMBERS_JSON` mapping. Validate app-secret signatures over raw bytes, support Meta's verification challenge, normalize all events in each webhook batch, preserve each `phone_number_id`, enforce the service window/template policy and handle status callbacks. Confirm ownership/coexistence or migration of the three existing numbers. Do not declare send idempotency unless the chosen provider actually guarantees it; uncertain requests need provider lookup/manual reconciliation.

Replace MockGeoService with a reviewed geocoder/coverage adapter. An unknown GPS is never silently matched to an unrelated manual address; operators can explicitly resolve a manual address instead. No real neighborhood polygons are invented. Environment names: `GEO_PROVIDER`, `GEO_API_KEY`.

Real mode fails closed (`DEMO_MODE=false` in production) until reviewed adapters are installed. For an HTTPS **production sandbox**, explicitly set `NODE_ENV=production`, `DEMO_MODE=true`, `APP_ORIGIN`, `WEBHOOK_SECRET` and `OPERATOR_USERS_JSON`. Generate salted password hashes with `scripts/operator-password.mjs` (stdin). Place Node behind a TLS reverse proxy and use persistent disk. Demo endpoints are appropriate only for the sandbox and must be removed/disabled when enabling real mode.

## Hosting compatibility

The original `.openai/hosting.json`, Worker, packaging script and four hosting tests are preserved. Their output remains a **static demo package**; deploying it alone does not deploy the Node/SQLite backend. This branch's full functional runtime is Node. Do not publish the static Worker as the Commerce OS. A future Sites deployment needs a separately configured backend or a deliberate D1/Worker persistence migration. No site was published and no merge/push was performed.

See [source-data review](docs/data-review.md) and the original screenshots in `docs/sources/`.
