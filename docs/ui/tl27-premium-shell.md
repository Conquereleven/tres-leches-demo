# TL-27 · Premium operations shell

UI-only refactor from `2b1b4e372598e3bffe96339a55b48651ca81bb51` on `feature/3l-premium-dashboard-shell`. No deployment, merge, provider activation, database changes or production data changes.

## Presentation

- `OperationsShell.tsx`: centralized navigation metadata and role visibility, fixed 252px desktop sidebar, optional persisted 80px collapse, 80px tablet rail, native modal drawer below 768px, minimal topbar, consistent page header and current-user/logout area.
- `operations-shell.css`: scoped Montserrat UI, warm neutral surfaces, subtle lavender selection, calmer status chips and operational density. No dependency additions.
- `Workspace.tsx`: one existing Inbox; messages remain central and unchanged AI component moves to the contextual column. Boards show customer, existing quote total, payment status, zone and last audit timestamp; existing order controls remain available in a details disclosure. Missing zone prices have an explicit warning. Readiness groups existing server checks without changing their statuses.
- `Root.tsx`: removes the redundant operations return strip; storefront link lives in the sidebar. Consumer storefront implementation, content and routes are unchanged.

## Preserved boundaries

No changes under `server/`, to API calls, filters, order transitions, AI policies, assignment/takeover, same-number messaging, secrets, provider configuration or redirects. Navigation reuses the existing history behavior. No Catalog/Settings route was invented. Existing readiness visibility remains **staging + admin**; enabling it in Production would be a separate behavior change and is intentionally outside this UI sprint. Server remains authoritative for RBAC.

## Validation

- TypeScript strict, lint, build: PASS.
- Existing domain/HTTP integration tests: **158/158 PASS**, including AI, Meta, Paymennt, RBAC and offline production guards.
- Sites packaging tests: **4/4 PASS**. Secret scan: 0 heuristic findings. npm audit: 0 vulnerabilities.
- In-app browser: requested empty-state routes at 1440; Inbox/Orders at 1024; Inbox at 768; Inbox/Orders/drawer at 390. No horizontal overflow. axe: zero violations in the recorded final matrix.
- Native drawer keyboard: first reverse Tab wraps to logout; Escape closes and restores menu-button focus. Active fixture WA2 conversation -> assignment -> create order and order disclosure manually checked. Active Inbox/Orders at 390 have no overflow.
- **Automated Playwright E2E is BLOCKED by macOS sandbox**: Chromium fails to launch with `bootstrap_check_in ... Permission denied (1100)` before any scenario executes. This is not an E2E pass. Existing assertions were adapted to the new heading/drawer, and `tests/e2e/shell.spec.ts` adds width, persistence, keyboard, axe and history regression coverage. Run `npm run test:e2e` in an environment that permits Chromium before release.
- Built JS gzip: baseline 79.44 kB; TL-27 approximately 88.15 kB. CSS gzip: baseline 8.72 kB; TL-27 approximately 11.31 kB. Existing Phosphor icons reused; no dashboard library added.

## Local visual review

`npm run build` then `node --import tsx tests/fixtures/shell-preview.ts` serves loopback port 5177 using an empty disposable staging backend (5197), fixture-only login and locally injected axe. This harness is only under tests; never deploy it. It does not read or copy production credentials/databases. Actual runtime/auth remain unchanged. Populated checks used the existing separate test fixture server, not staging/production seeds.

## Visual review decision

**PREMIUM SHELL READY FOR REVIEW** — visual review only; not release approval.

1. More premium than the baseline: yes, calmer surfaces and a smaller consistent header.
2. Navigation clearer: yes, grouped sidebar and one visible navigation surface.
3. La Tiendita quality: the requested layout principles are applied; no actual La Tiendita screenshot/URL was supplied, so exact visual parity is not asserted.
4. 3L identity retained: approved logo, Montserrat and restrained brand colors.
5. Inbox is the main workspace: yes; conversation, order and AI remain in context.
6. Exactly one visible/accessibility navigation system at each viewport: yes.
7. Mobile usable: verified empty and active conversation/order states; drawer and keyboard checked.
8. Business logic changed: no.

Known limitations: inherited bilingual operational copy remains; Readiness keeps its existing staging/admin restriction; automated E2E still requires a supported runner. Screenshots and raw evidence are supplied in the task's `outputs/TL-27` folder. Rodrigo must approve screenshots before any deployment or merge.
