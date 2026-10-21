# Tricolor CI release blocker

## Finding

The failed Analytics PR run 39272201949 / job 118127506112 reported three cart rows instead of five at Chromium 1440px EN. Its original trace cannot be inspected: GitHub reports zero artifacts and the workflow did not upload traces. Do not describe that original trace as reviewed.

The pack page had only a negative readiness assertion (no colour selector). That assertion succeeds while the dynamic catalog is loading. `locator('option').evaluateAll()` does not wait for matches, so it can return `[]`; both fixed-pack additions are silently skipped. The three previously persisted coloured singles remain. This is an omitted interaction, not demonstrated loss of accepted cart lines or an application pricing defect.

A loopback fixture reproduction held the published-catalog response with a promise (no sleeps): the old immediate read returned zero options in Chromium and WebKit; releasing it rendered exactly two. Local traces were inspected and retained under ignored `work/qa/tricolor-ci/readiness-traces`. Ten unmodified runs per browser otherwise passed; this alone was not treated as proof of flakiness.

## Focused correction

- Await exactly two published pack options before enumerating either format.
- Assert selected size, component summary and approved authoritative prices: singles AED 11/13, fixed packs AED 33/39.
- Assert the exact persisted SKU, colour, quantity and complete cart after each click and before navigation; retain before/after attachments.
- Keep the five-row cart and checkout expectations, colour edit/reload coverage and screenshots.
- Add a controlled delayed-catalog regression for both browsers, checking both pack identities through navigation/reload and browser page errors.
- Upload synthetic browser traces on CI failures (seven-day retention). No production credentials or real customer fixtures are used.

No application, commercial catalog, payment, notification or Production changes are part of this fix. PR #48 remains separate.

## Local validation

- Targeted corrected scenario + controlled delayed-catalog case: 20/20 (five repetitions of each in Chromium and WebKit).
- Full Tricolor: 26/26 (both browsers; EN/ES/AR; 390/768/1440px; fictional kitchen preview and synthetic checkout/OMS).
- Typecheck, lint, build: pass.
- Commerce: 684/684; secret scan: zero findings; npm audit: zero vulnerabilities.

CI on the final pushed head and the fresh Production backup remain independent release gates. Do not merge or deploy under this follow-up authorization.
