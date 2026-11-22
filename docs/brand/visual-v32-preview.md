# 3L Visual V3.2 - Local interactive preview (Draft PR #83)

Run in isolated worktree feat/3l-v32-commerce-integration-20261122:

    npm ci
    node scripts/preview-visual-v32.mjs

Open http://127.0.0.1:3232/visual-v32, /visual-v32/menu, /visual-v32/bakery.
Inspect 1440x900 desktop and 390x844 / 375x667 mobile; check real variants, cart, checkout without payment.

Script compiles branch, creates synthetic temporary SQLite, uses offline fixture only.
APP_ENV=test, NODE_ENV=test, PROVIDER_MODE=offline, clock frozen Oct 8, 2026.
Never use real customer data, credentials, webhook providers or payment APIs.
Preview is not Production. No deployment or merge authorized.
Canonical approved target: standalone V3.2 ZIP. Repo media differs from the approved visual reference.
Four desktop columns preserved. No custom payment logic.