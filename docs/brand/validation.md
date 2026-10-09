# TL-19–TL-21 validation

Date: 2026-09-11. Runtime: compiled Node/SQLite application, disposable test databases; no external customer traffic.

| Check | Result |
| --- | --- |
| Lint | PASS |
| TypeScript strict | PASS |
| Domain / adapters / HTTP / DB / brand content | 80 passed |
| Sites packaging/worker | 4 passed |
| E2E | 10 passed |
| Build | PASS: client, prerendered HTML, static Worker packaging, Node server |
| Dependency audit | 0 vulnerabilities |
| Responsive | 320, 375, 390, 430, 768, 1024, 1280, 1440: 15 main sections + footer, zero measured overflow |
| Axe | 390, 1440 and modal: 0 WCAG 2 A/AA / 2.1 AA violations |
| Console | 0 unexpected authored warnings/errors |
| Layout stability | initial local CLS 0; official font loaded |
| Font assets | Abril 15,780 B + Montserrat 36,204 B WOFF2 |
| Client bundle | 331.59 KB / 98.24 KB gzip (existing operations included) |
| CSS | 69.06 KB / 13.97 KB gzip |
| Regression | WA2 golden path, legacy checkout, recovery/coverage, HTTPS staging login/RBAC/readiness pass |

Tests run through repository scripts: lint, typecheck, test, build, test:sites, test:e2e:build, npm audit. E2E uses isolated Chromium and fixture-only staging credentials. CLI NO_COLOR/FORCE_COLOR notices come from test tooling, not browser/app code.

The screenshot matrix uses reduced motion for stable captures; separate E2E covers normal preloader completion/revisit and fallback. Modal checks include Tab containment, Escape and focus restoration. Provider success is not fabricated: missing WhatsApp opens an informative dialog, missing newsletter returns a recoverable error.

Limits: performance is measured with actual bundled brand assets plus empty client-media slots; it is not a claim about unavailable production film/product imagery or field Core Web Vitals. Axe is an automated subset of accessibility assurance, supplemented by keyboard and visual review. Actual external ordering/newsletter/provider UAT remains blocked by the client's missing data and the prior TL-18 activation prerequisites.

Final decision: VISUAL FOUNDATION READY. Customer launch is NOT READY. See root `design-qa.md` for the three explicit review passes and outstanding external media findings.
