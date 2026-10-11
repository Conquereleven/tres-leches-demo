# D1 validation evidence

All checks run in the isolated D1 worktree. No production connection, payment call or printer communication was used.

| Gate | Result |
|---|---|
| Typecheck | PASS |
| ESLint | PASS, zero warnings |
| Build | PASS, public i18n/customer-copy audits included |
| Unit / integration / commercial / payment | 450 passed, zero failed |
| Sites worker | 4 passed |
| Existing operational Playwright | 6 passed: WA2 lifecycle, recoverable send/zone review, legacy route, Copilot, sidebar/drawer, staging auth/RBAC/logout |
| D1 Chromium + WebKit | 18 passed: nine screens × EN/TL × 390/768/1440; restricted Products/Settings; canonical transition/version/idempotency in both languages |
| Checkout Chromium | 19 passed |
| Checkout WebKit | 19 cases verified: 18 passed in final suite, remaining navigation case passed in isolated recheck |
| Axe | Zero violations across the nine-screen D1 matrix; existing workflow tests also enforce axe |
| Console / assets | Zero page/console errors and no broken images in the D1 matrix |
| Secret scan | Zero findings (source and client bundle) |
| npm audit | Zero vulnerabilities |

54 full-page screenshots: [visual index](screenshots/index.md). Screenshots were inspected for Overview, Orders, Print Center, mobile Tagalog and desktop layouts. All capture data is synthetic. Browser mocks intercept API traffic; teardown can log a local Vite proxy connection refusal after a test page closes, without provider or production traffic.

## Translation coverage

435 resource keys per language; equal keys and interpolation placeholders. AST regression checks require every literal admin translation key. Customer records, product names, approved customer knowledge and diagnostic evidence remain verbatim. The language selector stores a preference against the current authenticated actor atomically, including immediately after login.

## RBAC and workflow

No server permission change. Existing command endpoints remain authoritative. Existing tests exercise admin zone edits, agent/admin assignment, versioned transitions, recovery, Copilot approval, login/logout, and rejection of non-admin diagnostics. New tests verify direct Products/Settings routes deny an agent and both admin languages send the identical canonical transition payload and idempotency header. Print Center reads only permitted workspace snapshots and sends no write.

## Residual limitations

- Product Hub is not integrated until PR #7 is reviewed/merged; no editor is simulated.
- Epson connectivity remains unverified; no hardware transport or jobs are implemented.
- Preferences are browser-local, not synchronized across devices.
- Native Tagalog review by staff remains useful for wording. Business records and provider evidence are intentionally not translated.
- Build retains the existing large-chunk warning and existing business-information checklist; no dependency/framework changes were made.
- An unrelated legacy public-brand browser test expects the packaging poster on desktop, while unchanged main uses story-desktop-poster.webp at desktop widths. It was observed during exploratory full original E2E and not altered in this operations-only sprint. The six relevant operational cases and the checkout suites are the release gates here.

## Safety proof

`git diff HEAD -- server shared src/brand src/styles.css data-imports package.json package-lock.json` is empty. No production variables, databases, data imports, catalogs, prices, delivery policies or provider integrations changed. PR #6/#7/#8 and unrelated worktrees/stash are preserved. No merge or deployment authorized by D1.

WebKit note: the final concurrent run logged a cancelled `/api/checkout/config` request during the cross-origin mock redirect in one case. The same case passed in isolation; an earlier full WebKit run passed all 19. Checkout implementation is byte-identical to baseline. No assertion was weakened.
