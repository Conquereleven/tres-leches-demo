# Multilingual release — implementation in progress

Baseline: `feature/3l-master-delivery-storefront`, `d71be297a386705ef7d44ecfcf22e600cad0de07`.
Production remains on that release. No deployment, provider calls, database migration, or financial data changes have been made by this sprint.

## Architecture

The existing English/Arabic custom boundary is being migrated to i18next + react-i18next. Resources are presentation-only, split into common/navigation/home/menu/product/checkout/policies under `src/brand/locales/{en,es,ar}`. Source index keys are deterministic presentation keys, independent of product/SKU identity. There remains one catalog.

Existing `CustomerCopy` nodes use a compatibility lookup; new copy should use explicit keys and interpolation via `localizedKey`. Existing dynamic-copy patterns remain a migration boundary and must be replaced with explicit parameters where practical. i18next's English fallback is disabled. Missing copy is visibly marked in the selected language and blocks the release audit; it must never be shipped in this state.

Locale selection uses EN/ES/العربية, native accessible select controls in public navigation and the checkout header. Local storage `3l-language` restores explicit choices; `?lang=` accepts en/es/ar without changing existing URLs. Switching changes provider state without remounting the cart or checkout. English is the initial default. Operations stay English.

Arabic uses document `lang=ar`, `dir=rtl`, and a web-safe Geeza Pro/Tahoma/Noto Sans Arabic/Arial stack without additional font binaries. Decorations, media and payment logos are not mirrored. Full component/semantic-icon visual review is still required.

Money/date helpers use Intl for presentation only. Product identity, SKU prices, canonical dates/time windows and stored order status values are unchanged.

## Release gate — not yet passed

Run `npm run audit:i18n` to report missing resources and invalid interpolation. Current inventory:579 keys; first translation pass:254 keys in ES and AR. Missing translations are explicit nulls; not placeholder English copies.

Still required: complete translations (including legal copy without changing its meaning), refresh extraction for authored product titles and latest guide strings, migrate hardcoded attributes/errors/options and dynamic financial messages, implement browser audit, complete cart/form-persistence/RTL tests, screenshot and manually inspect all 3 locales at390/768/1440, run all existing browser/security/packaging tests, measure bundle impact, then backup and compare Production historical order/payment hashes before/after the exact clean release.

No Production deploy is permitted until these gates pass. Provider-owned Paymennt hosted UI is externally controlled. Meta and Google activation remain out of scope. Human Arabic linguistic review should focus on legal and baking terminology; technical checks do not certify linguistic correctness.

Rollback baseline:Production deployment `ca7b0280-f76e-4575-85ac-5536acdddb20`, SHA above. No environment feature flag was added. Locale routing/SSR hreflang are future SEO work.

## Initial verification

Typecheck, lint, production build, secret scan, dependency audit (0 vulnerabilities), 371 unit/integration tests and 4 Sites packaging tests passed. Translation audit correctly fails:325 keys remain missing per ES/AR locale. No browser/RTL/screenshot gate or Production integrity comparison has been completed yet. Git changes remain local and uncommitted; current HEAD is the baseline SHA. This is not a release candidate.
