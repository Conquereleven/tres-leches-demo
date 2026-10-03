# EN / ES / AR multilingual release

Canonical repository: `/Users/rodrigom./code/tres-leches-demo`. Branch: `feature/3l-master-delivery-storefront`. Existing dirty work was protected by checkpoint `20eff62`; it was not reset or deployed as a partial implementation.

## Architecture and completeness

Presentation uses i18next + react-i18next with seven namespaces per locale: common, navigation, home, menu, product, checkout, policies. EN is the initial default. There is no English fallback. Missing customer copy is visibly marked in the chosen language and fails the build gate. `CustomerCopy` is a compatibility boundary for existing nodes; new UI should prefer explicit keys and full interpolation using `localizedKey`.

Final canonical inventory: **1,041 keys**, **1,041/1,041 EN**, **1,041/1,041 ES**, **1,041/1,041 AR**. The initial 579 included 13 technical identifiers excluded with reasons in `inventory-exclusions.json`; three duplicate HTML-encoded labels were also normalized/deduplicated; 478 additional presentation keys cover authored product names, approved SKU snapshots, help, legal content, validation and accessibility. No catalog duplication was introduced. `audit:i18n` verifies presence and interpolation contracts. `audit:customer-copy` parses customer TS/TSX and rejects unexplained English/source nodes. Both are mandatory before the production build.

Source audit: 624 static candidates, zero unexplained strings. Dynamic source templates and canonical data boundaries also have browser coverage. The static audit is not a formal whole-program data-flow proof. Explicit exclusions are printed in its JSON report and do not imply arbitrary backend messages are safe to render: unknown operator/backend messages are replaced with localized recoverable customer errors.

`intentional-nontranslations.json` lists same-spelling exceptions per locale: brand names, proper nouns, approved culturally meaningful baking identities (Pan de Muerto, Conchas, etc.), standard units, currency/data labels and approved size names. A Spanish source label already written naturally in Spanish is not a missing Spanish translation. SKU IDs, phone numbers, addresses, order identifiers and canonical state/date/time values remain data and are never translated or rewritten.

## Language, state and business boundaries

EN/ES/العربية native controls work in the desktop header, compact mobile/tablet header, menu dialog and checkout header. `?lang=en|es|ar` selects explicitly; `3l-language` local storage restores the choice on reload. Locale changes do not remount the cart or checkout form. Tests preserve multiple SKUs/quantities, selector values, street/building/community/date/time and customer details across all three languages. Operations remain EN/LTR even after navigating from Arabic.

The hosted Paymennt page is an external navigation boundary. The 3L locale remains stored for return; third-party UI is provider-controlled. No undocumented locale argument or provider HTML injection was introduced. Existing hosted checkout, reconciliation, held/failed/paid classifications, idempotency, frozen orders, billing/delivery request mappings and financial state transitions remain intact. No payment/provider/server code or Production credentials were changed.

One canonical catalogue remains: 77 authored products, 236 catalog records including 222 active options. Catalog JSON, IDs, prices, availability and media bytes are unchanged from the previous Production release. JLT minimum AED 30, zero extra delivery fee, subtotal-only total, legacy manual address review, 12-hour notice, no same-day rule and canonical windows are preserved. Google and Meta activation remain out of scope; Production stays legacy, Meta outbound false.

## RTL and visual review

Arabic sets document `lang=ar` and `dir=rtl`; semantic forward/back arrows, progress order, guide and layout alignment follow direction. Photography, 3L/WhatsApp/payment/social marks and decorative editorial motion are not mirrored. Mixed Latin customer data is isolated with `bdi`; phone/email values stay LTR. Dates/money are formatted for presentation only.

Arabic font strategy: web-safe Geeza Pro, Tahoma, Noto Sans Arabic, Arial, sans-serif. No new font binaries or licenses are introduced; available system fonts supply glyph coverage. Arabic headings have appropriate line height and no forced Latin display face. Manual screenshot inspection corrected mobile/tablet header height collisions, footer overflow, data direction and Arabic hero wording. Native OS/browser date-picker chrome follows the browser locale; application labels, validation and chosen-date presentation are localized.

QA matrix: EN/ES/AR × 390/768/1440. Home, guide, menu, product, cart, fulfillment, contact, checkout and mock-confirmation/tracking captured; compact-menu captures included. Tests assert no horizontal overflow, no visible missing-copy marker, accessible home/review and no page errors. Representative screenshots were actually inspected for wrapping, clipping, controls, price layout and RTL; the approved low-resolution source photography remains unchanged. Existing embedded English artwork/video captions are preserved media assets, not untranslated application UI. Current media preservation is intentional.

Screenshot gallery and final evidence: `work/qa/i18n/index.html`, `work/qa/i18n/release-report.md` and `release-evidence.json`. These are ignored local QA artifacts, keeping screenshots and operational evidence out of deploy archives.

## Test inventory and release gate

| Suite                                                                                  | Passing tests |
| -------------------------------------------------------------------------------------- | ------------: |
| Unit/integration (`tests/commerce/*.test.ts`)                                          |           372 |
| Original browser / operations / AI / staging                                           |            12 |
| Checkout / payment / stale checkout / operational UI                                   |            19 |
| Menu / server availability / accessibility                                             |             8 |
| Closure / mocked Google / coverage / pickup / tracking                                 |            13 |
| UAT V2 / quantity / homepage motion                                                    |             4 |
| Multilingual journey / native validation / minimum / pickup / motion / multi-SKU state |            17 |
| Sites packaging                                                                        |             4 |
| **Local total**                                                                        |       **449** |

No existing relevant suite is omitted. Original E2E uses `E2E_BUILD=true` so all 12 execute. Provider operations in integration/E2E use disposable local fixtures/mocks; no real charge or provider call is made. Typecheck, lint, build, dependency audit (zero vulnerabilities), secret scan (zero findings) and git diff whitespace check are release gates. Build warns about the large client bundle; all locales are bundled to support immediate switching. Final JS is about 1.097 MB raw / 303 KB gzip (baseline about 641 KB raw); this is a measured cost, not a claimed performance improvement. Lazy per-locale bundles are a future optimization.

A separately guarded `PRODUCTION_SMOKE=1 npx playwright test --config=playwright.production-i18n.config.ts` runs three public no-payment tests after deployment. It covers delivery and pickup through review, quantity/cart/locale persistence, legacy minimum messages, international WhatsApp and return errors. Deployed tracking presentation uses an explicitly intercepted fixture; authoritative backend reconciliation is covered locally, and no historical payment capability or LIVE provider GET is exercised.

## Production safety, pipeline and rollback

Previous known-good SHA: `d71be297a386705ef7d44ecfcf22e600cad0de07`; deployment `ca7b0280-f76e-4575-85ac-5536acdddb20` at https://www.3ldubai.ae/.

Before release, the private SQLite backup is `/data/backups/i18n-before-1791064472935.sqlite`, mode 0600. Orders/payments baseline: 10/10; their hashes, plus conversations/zones, are recorded without PII in the private QA evidence. No database/schema migration or catalog import is needed. Post-deploy compares each collection against that backup. Temporary Railway SSH access is scoped to backup/read-only verification and removed at closure.

Deploy only a clean exact commit archive using the existing canonical Railway Production project/service/environment. Update only non-secret `BUILD_SOURCE_SHA` provenance, not merchant/provider/address/Meta settings. Check health revision equals the deployed archive SHA, run guarded public smoke, then compare private data integrity. Exact final SHA/deployment ID and post-deploy results belong to the final QA release report referenced above, so committing deployment evidence does not accidentally produce an undeployed HEAD.

On checkout/payment regression, broken Arabic layout, serious console error or integrity discrepancy, restore the previous known-good archive immediately and report rollback. No financial rollback/migration is part of this presentation release.

Pre-existing unconfirmed merchant facts (email, support hours and optional policy decisions) remain unchanged, with the same truthful fallback wording. Technical/visual Arabic review does not constitute certification by a professional legal translator; a merchant linguistic/legal review can refine presentation without changing business rules.

The compact Arabic navigation additionally asserts computed RTL direction and logical text alignment, protecting against changes in bundled CSS order. All five public policy/contact routes are exercised in all three locales; cancellation percentages and cut-off remain unchanged.
