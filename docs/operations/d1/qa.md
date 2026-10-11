# D1 validation evidence

All checks run in the isolated D1 worktree. No production connection, payment call or printer communication was used.

| Gate | Result |
|---|---|
| Typecheck | PASS |
| ESLint | PASS, zero warnings |
| Build | PASS, public i18n/customer-copy audits included |
| Unit / integration / commercial / payment | 454 passed, zero failed |
| Sites worker | 4 passed |
| Existing operational Playwright | 7 passed: public storefront → Operations smoke, WA2 lifecycle, recoverable send/zone review, legacy route, Copilot, sidebar/drawer, staging auth/RBAC/logout |
| D1 Chromium + WebKit | 34 passed: historical snapshot regression in both languages/browsers; nine screens × EN/TL × 390/768/1440; restricted Products/Settings; canonical transition/version/idempotency in both languages |
| Checkout Chromium | 19 passed |
| Checkout WebKit | 19 passed in final follow-up suite |
| Axe | Zero violations across the nine-screen D1 matrix; existing workflow tests also enforce axe |
| Console / assets | Zero page/console errors and no broken images in the D1 matrix |
| Secret scan | Zero findings (source and client bundle) |
| npm audit | Zero vulnerabilities |

54 full-page screenshots: [visual index](screenshots/index.md). Screenshots were inspected for Overview, Orders, Print Center, mobile Tagalog and desktop layouts. All capture data is synthetic. Browser mocks intercept API traffic; teardown can log a local Vite proxy connection refusal after a test page closes, without provider or production traffic.

## Translation coverage

436 resource keys per language; equal keys and interpolation placeholders. AST regression checks require every literal admin translation key. Customer records, product names, approved customer knowledge and diagnostic evidence remain verbatim. The language selector stores a preference against the current authenticated actor atomically, including immediately after login.

## RBAC and workflow

No server permission change. Existing command endpoints remain authoritative. Existing tests exercise admin zone edits, agent/admin assignment, versioned transitions, recovery, Copilot approval, login/logout, and rejection of non-admin diagnostics. New tests verify direct Products/Settings routes deny an agent and both admin languages send the identical canonical transition payload and idempotency header. Print Center reads only permitted workspace snapshots and sends no write.

## Residual limitations

- Product Hub is not integrated until PR #7 is reviewed/merged; no editor is simulated.
- Epson connectivity remains unverified; no hardware transport or jobs are implemented.
- Preferences are browser-local, not synchronized across devices.
- Native Tagalog review by staff remains useful for wording. Business records and provider evidence are intentionally not translated.
- Build retains the existing large-chunk warning and existing business-information checklist; no dependency/framework changes were made.
- An unrelated legacy public-brand browser test expects the packaging poster on desktop, while unchanged main uses story-desktop-poster.webp at desktop widths. It was observed during exploratory full original E2E and not altered in this operations-only sprint. The seven relevant operational cases and the checkout suites are the release gates here.

## Safety proof

`git diff e2a82387549d5861e110178d6b9c8b8ae7f84f10 -- server shared src/brand src/styles.css data-imports package.json package-lock.json` is empty. No production variables, databases, data imports, catalogs, prices, delivery policies or provider integrations changed. PR #6/#7/#8 and unrelated worktrees/stash are preserved. No merge or deployment authorized by D1.

## Final QA follow-up

Print Center uses only the stored order snapshot. Missing snapshots, absent ordered products, duplicate matching rows, blank names, invalid prices and invalid/duplicate order lines block the whole preview with an EN/TL review-required alert. Extra snapshot entries are allowed because an accepted snapshot may contain more than the ordered products. Current catalog data and SKU-name fallbacks are never used. Existing ticket layout remains preview-only; no transport, RBAC or business-state changes.

Three focused unit regressions plus an actual mock-provider checkout acceptance regression verify historical names/prices remain intact after catalog edits. Sixteen browser regressions verify missing/incomplete/duplicate snapshots and changed catalog presentation across EN/TL and Chromium/WebKit. A separate public-storefront Gestión → Operations Inbox smoke restores navigation coverage while preserving direct-route tests.

Historical orders without a consistent stored snapshot require manual review; no automatic reconstruction or backfill is performed. Original 54 screenshots remain unchanged (repeat captures only had nondeterministic rendering differences).
