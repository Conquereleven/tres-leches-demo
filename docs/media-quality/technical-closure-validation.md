# Technical media closure — validation

Baseline: GitHub main `d0a94663404930ad0b90595cecad409256eb3f2c` (PR #61 merged). Its application source and lockfile match the audited candidate `223a36778609d26e3433ea28187abc1a39c6b8c7`; the older visual findings are reused, not attributed as new regressions.

## Decision

**GO for technical PR review.** No merge/deployment/catalog publication performed. Founder-approved temporary image exceptions remain unchanged. This is not unconditional acceptance of all catalog photography.

The loading-only CSS reservation removes the large initial footer displacement in the measured route `/menu?product=conchas-tricolor-pack`. Loaded card/detail/checkout geometry, media references, prices and SKU definitions are unchanged. A narrowly scoped update to the existing geometry guard recognizes exactly this one new loading rule and continues comparing all other declarations against the approved baseline.

## Results

| Check | Result |
|---|---|
| TypeScript strict typecheck | PASS |
| ESLint | PASS |
| Build, i18n and customer-copy audits | PASS |
| Commerce/domain/HTTP | 723/723 PASS |
| Sites packaging | 4/4 PASS |
| Offline media gate | 22/22 PASS |
| Loading/retry/empty browser tests | 12/12 PASS, Chromium + WebKit, 390/1440 |
| Existing checkout browser suite | 21/21 Chromium + 21/21 WebKit, separate disposable databases |
| Dependency security audit | 0 vulnerabilities |
| Secret scan | 0 findings; heuristic source/client scan |
| Metadata proposal | 8 fields / 4 assets; source revision and hash retained; no products/prices/pack rules changed |

The 22 gate tests include a new regression: zero-height inventory fails closed with INVALID_DIMENSIONS rather than dividing by zero while producing the review queue. The reviewed implementation was reused and formatted, not replaced by a new media system.

## Controlled stability — actual integrated CSS

Fresh contexts, reduced motion, no input or scroll, recorded catalog/config and local images. Three repeats per normal/delayed-catalog condition, two widths, Chromium/WebKit: 24 runs. Compare with the 48 recorded baseline measurements from the preceding audit; same route, snapshot and dimensions. This is local laboratory evidence, not field Core Web Vitals.

| Chromium | Before, session-window CLS | Integrated correction |
|---|---:|---:|
| 390, normal | 0.189468–0.239013 | 0 in 3 runs |
| 390, catalog +900ms | 0.189468 | 0 in 3 runs |
| 1440, normal | 0.001288 | 0.001247–0.001288 |
| 1440, catalog +900ms | 0.237882 | 0.001288 in 3 runs |

F6's large initial menu-loading displacement is resolved in this tested scope. Small navigation/font-related movement remains; no claim of global zero shift. WebKit 27.2 does not expose the LayoutShift API here: scores are null/unsupported, not zero. Its visual geometry and loading/error/recovery tests pass.

F2 remains a documented commercial exception for the pack; the individual is not implicitly approved. F3's photo backlog and static-gallery interaction decision remain outside this technical PR. No new photography or crop is applied.

## Test instrumentation notes

The initial commerce/Sites invocation overlapped build completion and observed missing dist artifacts; final suites ran after the build and all passed. An initial broad checkout invocation included an uninstalled Firefox and shared a fixture database between Chromium/WebKit, advancing a test that assumes public order #001 to #003. Final Chromium and WebKit commands ran separately with fresh fixture databases, passing 21 each. No application/payment changes were made to accommodate those harness conditions.

A manual fixture startup initially placed its fake webhook file under the worktree; the existing secret-path guard refused startup. Final startup used a disposable temporary directory outside the checkout. No guard was changed and no real credential was used.

Existing build warnings remain: large customer bundle and previously documented business-information placeholders. They are unrelated to this loading-only correction. Do not invent missing business content or expand this PR into a bundle/SEO redesign.

## Evidence and rollback

`loading-validation.webp` shows local fixture loading/loaded states in both browsers at both widths. Original eight screenshots, browser logs, 24-run measurement JSON and hashes are retained in the task's local artifact folder, alongside the previous audit. These are not Production screenshots or a new catalog publication.

Rollback the loading rule by reverting this PR. Offline gate files have no runtime hook. No database, provider or catalog rollback is involved. Release still requires founder merge and deployment approval.
