# Validation — 2026-09-07

- `npm run typecheck`: pass (strict new TypeScript, UI, server, unit and browser tests).
- `npm run lint`: pass, zero errors/warnings.
- `npm test`: 20/20 passed: domain, source data, matching, payment integrity, concurrency, restart, signatures, HTTP origin/body validation, login/RBAC, bounded retries and provider timeouts.
- `npm run build`: pass; Vite 6.4.3 frontend + unchanged Sites package + compiled Node runtime.
- `npm run test:sites`: 4/4 passed.
- `PLAYWRIGHT_BROWSERS_PATH=./work/browsers npm run test:e2e:build`: 3/3 passed against compiled Node server with disposable database.
- Browser cases: complete WA2 → GPS → payment → Delivered; original storefront checkout/detail/conversation; recoverable failed send preserves draft, retry succeeds, filters and out-of-coverage block payment.
- Responsive: inbox, delivery and admin zones at 390/768/1024/1440 pixels, no horizontal overflow; screenshots visually reviewed at desktop and mobile.
- Golden-path browser console: zero errors/warnings; zero page exceptions. The failure-recovery case deliberately receives a simulated HTTP 503.
- `npm audit --audit-level=moderate`: zero vulnerabilities after compatible Vite/transitive dependency security updates.
- `git diff --check`: pass.

Initial browser-launch restrictions were resolved by running the authorized local Chromium tests outside the macOS process sandbox. Initial findings (tablet navigation overflow and compiled-server root handling) were fixed and verified by the final passing runs. No checks are reported as passed solely from code inspection.

The tests simulate WhatsApp, GPS and payments. Live Meta/Paymennt calls, merchant credentials, real geographic boundaries and real payment settlement are not validated or enabled. No publication, push or merge occurred.
