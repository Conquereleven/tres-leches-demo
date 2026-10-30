# Pastelerías 3L | Commerce & Operations Platform

**Owner:** 3L Pastelerías · **Engineering repository:** CornerTech AI collaboration  
**Audience:** incoming technical leadership, maintainers and reviewers  
**Important:** repository code, a merged PR, a deployed build and a commercially activated feature are **four different states**. Confirm each in its authoritative release evidence.

## What this system does

A bilingual/multilingual bakery storefront and an operational commerce backend for the UAE. The customer experience covers product discovery, cart, delivery/pickup and hosted payment checkout; internal workflows cover order intake, kitchen, fulfillment, customer conversations, catalog governance and auditability. 3L is a real client project, **not** a disposable demonstration. Historic "demo" names remain in the repository and some test fixtures.

The architecture prioritizes immutable order/payment history, integer-minor-unit money, server-authoritative catalog prices, idempotent commands, explicit operator permissions and human approval of sensitive integrations.

## Technical map

| Layer | Location / technology | Responsibility |
| --- | --- | --- |
| Customer web | React 19, Vite, `src/brand/`, `src/main.jsx` | Storefront, product presentation, cart and checkout UI |
| Operations UI | `src/commerce/` | Inbox, order management and operational workflows |
| Application runtime | Node.js, `server/` | HTTP API, checkout, domain commands, integrations, auth |
| Shared domain contracts | `shared/`, TypeScript, Zod | Catalog/checkout policies, validated state transitions |
| Transactional data | SQLite on persistent storage | Operational records, payment reconciliation, outbox, audit |
| Integrations | Paymennt, Meta WhatsApp, Resend | Hosted checkout, messaging and notifications behind configuration gates |
| Quality gates | `tests/`, Playwright, ESLint, TypeScript | Unit/integration, HTTP, browser and release verification |
| Deployment definition | `railway.json` | Node service build, start and health check |

Never deploy the preserved static Sites Worker as the full backend. Never infer a provider's LIVE status from the existence of integration code.

## Quick start (isolated local development)

Requires Node.js **>=22.13**, npm and writable disposable SQLite storage.

~~~bash
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run test:sites
npm run test:e2e:build
npm run scan:secrets
~~~

UI development typically serves port 5173 and the backend 3001. `npm start` serves the compiled Node application on the configured port. Tests must use synthetic/disposable databases, **never** Production data, provider keys or customer exports. Obtain local configuration names from [.env.example](.env.example); do not use live credentials for onboarding.

## Current release interpretation

- The repository contains code for controlled LIVE Paymennt operation; see [LIVE release contract](docs/checkout/paymennt-live-release.md). A README is not proof of which configuration is currently deployed.
- The Tricolor singles / fixed-three-piece pack implementation was merged in PR #42. **New commercial SKUs still require separately authorized Production catalog publication.** See [Tricolor release notes](docs/tricolor/README.md).
- The Product Hub and dynamic public catalog have explicit enablement and publication controls. Refer to [Product Hub V2](docs/product-hub/product-hub-v2.md) and [dynamic catalog](docs/product-hub/storefront-dynamic-catalog.md); do not presume a feature flag is enabled.
- Checkout and financial records may be live customer history. No reset, bulk seed, destructive migration, simulated webhook or automatic payment/send operation is acceptable.

## Start reading

1. [CTO technical onboarding and review agenda](docs/CTO_ONBOARDING.md)
2. [Engineering and safety rules](AGENTS.md)
3. [Order-management behavior](docs/operations/oms/README.md)
4. [Checkout LIVE operating contract](docs/checkout/paymennt-live-release.md)
5. [Catalog and Product Hub](docs/product-hub/product-hub-v2.md)
6. [Tricolor implementation and release gates](docs/tricolor/README.md)
7. [AI copilot architecture and policy](docs/ai-agents/architecture.md)

## Contribution and safety

Use a dedicated branch and a reviewed PR. Documentation changes do not authorize merges, payments, catalog publication, provider activation, production deployment, database writes or external messaging. Keep sensitive service identifiers, customer information and environment secrets out of onboarding materials. Obtain a separate, explicit approval for every production-impacting action.

**Ownership:** technical review may be delegated; commercial approvals, customer-data access and production release authorization remain separately controlled.
