# CTO onboarding | Pastelerías 3L

**Snapshot:** 18 October 2026, based on repository code and documentation. This is a reading guide, not an attestation of a current deployment.  
**Audience:** prospective technical leader reviewing architecture and technical due diligence.

## 1. Product context

3L Pastelerías is a client-facing commerce and operations implementation. Its value is an integrated customer ordering journey plus a controlled operational back office, not merely a themed storefront. Primary users are customers, kitchen operators, managers and the founder/client owner.

Review the surfaces separately: public storefront, catalog and checkout; internal Inbox and OMS; payment reconciliation; kitchen/fulfillment; approved customer notifications; and catalog governance.

## 2. Architecture and trust boundaries

- **Storefront:** React/Vite UI in \`src/brand/\`, with commerce interaction code under \`src/commerce/\`.
- **Backend:** Node server and domain commands in \`server/\`; shared policy and strict types in \`shared/\`.
- **Persistence:** SQLite as the operational transaction store with durable receipts, outbox and audit. Understand the single-instance/storage assumptions before proposing horizontal scaling.
- **Prices and history:** the server owns prices, eligibility, tax/fee rules where configured, order transitions and reconciled payment state. Quotes and accepted orders retain snapshots. Money uses integer fils, not floating point AED.
- **Paymennt:** hosted checkout and authoritative provider GET reconciliation; webhooks are evidence to reconcile, not stand-alone proof of payment. LIVE activation has a separate auditable contract.
- **Meta / Resend / AI:** outbound calls are gated and require explicit approval/operating rules. Inspect whether a feature is enabled in the target environment, not simply in source.
- **Catalog:** historical bundled assets, the Product Hub draft/publish model and live dynamic storefront are distinct concepts. Publishing a catalog revision is a business action.

Suggested code entry points: \`src/main.jsx\`, \`src/brand/\`, \`src/commerce/\`, \`server/\`, \`shared/\`, \`tests/\`.

## 3. Status and evidence ledger

| Topic | Source evidence | Interpretation |
| --- | --- | --- |
| Payment LIVE capability | [LIVE release contract](checkout/paymennt-live-release.md) | Implementation exists; actual deployment/provider state must be independently checked |
| OMS | [OMS guide](operations/oms/README.md) | Operational routes and command constraints documented |
| Product Hub | [Product Hub V2](product-hub/product-hub-v2.md) | Admin workflow with separate publication/activation contract |
| Dynamic catalog | [Storefront adoption](product-hub/storefront-dynamic-catalog.md) | Feature-gated: do not assume current Production adoption |
| Tricolor | [Merged implementation report](tricolor/README.md) | PR #42 merged; two new commercial pack SKUs require independent authorized publication |
| AI | [Agent architecture](ai-agents/architecture.md) and [policy](ai-agents/policy.md) | Supervised capability; do not enable autonomous operations by inference |

Historic runbooks can describe older release stages. Prefer a current dated release decision plus matching build SHA and production read-only evidence over old status statements.

## 4. Reproduce safely

~~~bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:sites
npm run test:e2e:build
npm run scan:secrets
~~~

Use the sandboxed local fixture database and **test-only payment adapters**. Do not execute scripts for production catalog imports, payment webhook registration, live checkout, sending messages, migration/application or Railway deployment while only conducting onboarding.

## 5. Questions for CTO review

1. Is the current production SHA traceable to a reviewed commit and release decision?
2. Are backup, restore drill, SQLite locking, storage durability and single-instance assumptions adequate?
3. Which APIs / services own catalog authority, price snapshots, immutable orders and refunds?
4. Are permission checks, audit trails, notification retries and ambiguous external outcomes fail-closed?
5. Which Product Hub changes are built, deployed, enabled and actually published?
6. Is CI representative of Production mode, including hosted checkout and WebKit/Safari?
7. What should be extracted into the future **CornerTech Commerce** platform without coupling customer 3L Production data to a multitenant SaaS?

## 6. Access and governance

Prospective CTO review should start with repository-level **read-only** permission where possible. No access to customer databases, production secrets, payment consoles or deployment write roles follows automatically. Require explicit agreement on responsibilities, confidentiality, access scope and review ownership before expanding privileges.

For technical proposals, open issues or PRs scoped to 3L only. Do not migrate its production data or silently turn the client solution into a shared SaaS infrastructure.
