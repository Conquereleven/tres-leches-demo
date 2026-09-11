# Pastelerías 3L · Commerce OS

Canonical operations live at `/operations/inbox`; the approved brand site remains at `/`. There is one operational Inbox, no MVP/demo UI and no runtime fixtures. A new database contains source-derived delivery rules and **zero products, conversations, orders or payments**.

TL-25 activation instructions: [today's runbook](docs/today-activation-runbook.md). Catalog handoff: [template and validated import](docs/catalog/README.md). Commercial provenance: [data review](docs/data-review.md). Earlier TL09–TL24 notes are historical; blocked-contract/demo instructions there do not apply to this release.

## Local validation

Node >=22.13, npm, writable local SQLite storage. Development starts empty and has no external send/payment success fallback.

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run test:sites
npm run test:e2e:build
npm run audit
npm run scan:secrets
```

Development serves UI on 5173 and API on 3001. `npm start` serves the compiled frontend/API on 3001. Playwright uses disposable fixture databases and its own local server; never point tests at real operational data. `PLAYWRIGHT_BROWSERS_PATH` may select an existing Chromium installation.

## Operational boundaries

- Strict TypeScript/Zod domain commands enforce assignment, versions, catalog eligibility, delivery rules and state transitions. Money is integer fils. Issued payments retain the commercial quote and catalog snapshot.
- SQLite transactions persist commands, inbound receipts, outbound jobs, payment notifications and audit. This release is a single Node/SQLite operational instance with verified online backups; do not run multiple workers against a shared network filesystem.
- Meta supports three explicit source mappings, raw HMAC verification, batched inbound text/GPS/statuses and persistent outbound processing. Replies use the original number. Unknown send outcome stops for review; outside 24h a configured approved template is required.
- Paymennt always uses the TEST API. The Base64 HMAC verifier reads exact bytes with the registered private `hmacKey`. Allowed topics trigger durable reconciliation. Only authoritative GET matching checkout/request/order/AED/grand total can mark Paid/Confirmed. Settled payments never regress from older notifications; refunds require operator review without erasing fulfillment history.
- Approved catalog import supports dry-run, apply and catalog-only rollback with pre-change backups. Empty/unknown products cannot generate a charge. [Catalog contract](docs/catalog/README.md).
- Provider groups activate independently through server configuration. Secrets must never use `VITE_*` or enter static assets. `.env.example` documents required names without credential defaults. Readiness is admin/staging-only; its public health endpoint contains no provider diagnostics.

## Release boundaries

Default external outbound is off. Registration is an explicit TEST-only server command that stores the one-time key privately and refuses automatic re-registration after uncertain outcomes. Production and live Paymennt remain deliberately disabled pending real provider tests and Lisa UAT. Automated fixtures never establish PILOT READY.

The preserved Sites Worker is static-only: `dist/client`, `dist/server/index.js` and `dist/.openai/hosting.json` remain compatible, but the full operational backend is compiled Node + SQLite. Do not deploy the static Worker as Commerce OS. No push, merge or deployment is part of TL-25.
