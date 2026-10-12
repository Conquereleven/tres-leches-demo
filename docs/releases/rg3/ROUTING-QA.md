# Compiled Production routing — RELEASE BLOCKER

Reproduce using `npm run build` then `node --import tsx scripts/rg3/compiled-routing.ts`. This launches **dist/node/server.mjs**, an empty disposable SQLite database, Production runtime validation with providers offline, synthetic accounts, secure cookies and ephemeral localhost HTTPS. Both Chromium and WebKit exercise anonymous login, admin direct navigation and refresh. No Vite server is used.

Initial compiled revision matched `58d44483cddab3ecc72555b135454e63f85c6913`. [Full safe matrix](evidence/compiled-routing-initial.json). Final-head compiled CI repeats the gate.

| D1 route | Direct HTTP | Authenticated refresh | Anonymous login shell |
|---|---|---|---|
| /operations/overview | **404** | **404** | absent |
| /operations/orders | 200 | 200 | present |
| /operations/production | 200 | 200 | present |
| /operations/delivery | 200 | 200 | present |
| /operations/inbox | 200 | 200 | present |
| /operations/products | **404** | **404** | absent |
| /operations/print | **404** | **404** | absent |
| /operations/settings | **404** | **404** | absent |

The explicit SPA fallback list in `server/http.ts` omits the four newer D1 paths. In-app navigation can work while direct links/refresh fail; Vite passes do not establish Node release readiness. Compiled test exits 2, and CI must retain this failure.

Positive evidence in both engines: health 200/exact compiled revision, ready storage:true, anonymous workspace401, valid local admin login, agent diagnostics403 and Settings navigation hidden. Homepage/menu/cart/checkout/return200. Unknown page404 and unknown anonymous API401 with JSON (no API→SPA fallback). `/assets/` returns the index shell rather than a directory listing; not a resource disclosure. Private .env/database/source paths are tested on the final rehearsal. Public image checks use fixture-free empty runtime and existing approved assets; full checkout behavior is covered separately by mock browser suites.

Recommended isolated corrective change: add exactly overview/products/print/settings to the established Node SPA allowlist, preserve staging-only readiness and unknown-route404 behavior, and add compiled HTTP/auth/refresh regressions. Do not use a catch-all /operations/* fallback. Route HTML need not contain private workspace data; API auth and role restrictions remain authoritative. Revalidate all eight routes on the final candidate before GO.

**No application fix was silently made.** RG3 reports the demonstrated blocker as permitted by the task; original approved PRs remain unchanged. A corrective branch/PR must be reviewed and its exact SHA integrated/tested before release approval.
