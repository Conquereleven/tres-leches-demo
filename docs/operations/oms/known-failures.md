# Known failing test outside TL-OMS-01

One test in the required `npm run test:e2e:build` gate fails. It is a customer-storefront test, it fails the same way on a clean `main`, and this branch does not touch the files it exercises. It has **not** been skipped, edited or weakened.

|                             |                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Test                        | `tests/e2e/brand.spec.ts:94` · "unavailable video never blocks the poster, content or catalog" |
| Assertion                   | `.ref-hero video` has `poster="/brand/approved/packaging-poster.webp"`                         |
| Actual                      | `poster="/brand/approved/story-desktop-poster.webp"`                                           |
| Suite result on this branch | 12 passed, 1 failed                                                                            |

## Evidence on clean `main`

Fresh detached worktree of `origin/main` at `5aaa33dba3483061d9688fabdf0fee9203d3c833`, no local changes, `npm run build` exit 0, then:

```
E2E_BUILD=true npx playwright test tests/e2e/brand.spec.ts -g "unavailable video"

  1) tests/e2e/brand.spec.ts:94:1 › unavailable video never blocks the poster, content or catalog
    Error: expect(locator).toHaveAttribute(expected) failed
    Locator:  locator('.ref-hero video')
    Expected: "/brand/approved/packaging-poster.webp"
    Received: "/brand/approved/story-desktop-poster.webp"
  1 failed
```

Run twice (first implementation pass and this refinement pass), same result both times.

## Why it is unrelated

- The test covers the homepage hero video. This branch changes only `src/commerce/**`, one static route in `server/http.ts`, tests and docs: `git diff --stat origin/main -- src/brand src/styles.css public` is empty.
- Likely cause, not verified further: the homepage serves the story film at widths of 1024px and above and the packaging video below (recorded in `AGENTS.md`, 9 October 2026), while the test runs at 1440px and still expects the packaging poster.

## Not covered by CI

The `commerce-ci` workflow runs typecheck, lint, build, unit tests, Sites test, secret scan and audit. It does not run Playwright, so this failure does not appear in the pull request's checks. It needs its own fix by whoever owns the storefront hero.
