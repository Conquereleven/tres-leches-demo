# Closure Sprint 01 — final blocker follow-up

## Operations WebKit

Original job 118677806839 failed `oms.spec.ts:288` during `page.goto` after repeated order visits. The preceding job failed at a different `page.reload` in the address test. Neither original job retained a trace or native crash dump, so an exact native crash fingerprint cannot be recovered retroactively. No evidence establishes an application defect or out-of-memory condition.

The same current main `589a78387c9efb5f4abd6e495d3746435c00dde5` was archived into an isolated directory and its **own pinned dependencies** tested on the same Ubuntu runner/Node22 as each candidate. Five repetitions of each of the fulfilment and two address scenarios passed 15/15. The complete candidate Operations suite passed 46/46 WebKit on both diagnostic heads (PR50 2b3b4f9; PR52 64f2205). Maximum resident memory reported by `/usr/bin/time` was 1,134,032 / 1,040,100 KiB; browser launch processes exited0 without a reported signal. These passes do not prove the cause of the earlier failures.

Playwright's upstream [network-process defect #42803](https://github.com/microsoft/playwright/issues/42803) documents the same navigation error with bundled libsoup3.6.5, and the maintainer identifies1.64 as the corrected release. This patch pins the test toolchain to1.64.0 and verifies the actual Linux WebKit bundle contains libsoup>=3.6.6. It does not replace the application, downgrade WebKit, retry failed assertions, or swallow candidate failures. Attribution to that exact defect remains a supported hypothesis, not a recovered core-dump diagnosis.

Operations retains failure traces/screenshots, browser-process stderr, memory measurements and the equivalent-runner main comparison for subsequent investigation. Original business, direct navigation, refresh, RBAC and mutation assertions remain intact. Successful baseline comparisons are diagnostic evidence, not substitutes for candidate CI.

## Checkout transition

Job118670264977's retained trace shows the delivery time selected, CONTINUE TO DETAILS enabled, and Playwright's pointer click while scrolling continued (scroll944 at action,991 afterward). The application remained on Fulfillment; no details form rendered. No application exception or validation error was recorded. The failure occurred before any payment action. The first test now reuses the existing helper to center the target, verify stable geometry and hit target, issue **one ordinary click**, then explicitly assert the First name field. No force, delay, retry, timeout increase or business-rule change.

Eight original local repeats passed, demonstrating that local success alone was insufficient. Ten repeats after synchronization passed. Full checkout passed21/21 Chromium and21/21 WebKit locally, and both passed on diagnostic PR52 head64f2205. A later PR50 diagnostic job failed a different WebKit `goto('/cart')` beforeEach (20/21); its retained trace records a `/api/checkout/config` access-control page error immediately after replacing the still-hydrating homepage. The UX beforeEach now waits for the actual config response200 and completed body before seeding storage and navigating, matching the existing first checkout scenario. This is fixture lifecycle synchronization, not a CORS/payment-rule change. The upgraded-engine exact-head suites remain mandatory.

## Full-suite fixture regression

Final local combined commerce validation exposed an existing clock-boundary error in the synthetic coexistence duplicate-event test (709/710): it generated two different `Date.now()` timestamps for one provider event ID. The production idempotency guard correctly returned409. The test now replays the same frozen envelope, explicitly advancing the mocked reception clock across a second before replay. Its deduplication, assignment, unread, AI and no-job assertions remain. No Meta runtime/configuration changed. This demonstrated test defect is included rather than concealing a failed commercial suite.

## Product-first email fit

The approved serif identity, centered pink wordmark, rounded Product/Qty/Price panel, gold total and paired secondary information blocks remain. Only vertical whitespace and the duplicate customer introduction were removed; the customer remains in the address/contact block. Product names remain18px, quantities18px, original notes14px, address13px, and the Operations link44px high. Plain text, legacy recipients, frozen outbox data and transport behavior remain unchanged.

At390px in Chromium and WebKit:

|Fixture|Before|After|Native fit requirement|
|---|---:|---:|---|
|One individual|820px|722px|Usable email body height >=722px|
|Three individuals|952px|838px|Usable email body height >=838px|
|One six-piece box + three individuals|1135px|1013px|Usable email body height >=1013px|
|Multiple boxes|1378px|1260px|Scrolling expected|

The first two fit a raw390×844 browser; three products leave only6px, so browser fit must not be advertised as Apple Mail fit. The founder confirmed **iPhone18 Pro / Apple Mail**, but no physical iPhone or device-cloud Mail session is connected and no actual usable Mail viewport has been measured. No iPhone screen dimensions or toolbar deductions have been invented. Native screenshot acceptance remains OPEN. Long notes/warnings scroll and are never truncated.

[Three products](previews/product-first-three-webkit-390.png) · [Box and singles](previews/product-first-typical-webkit-390.png) · [Desktop](previews/compact-webkit-1024.png). All examples are synthetic. Offline `.eml` files are provided privately for native review; no messages were sent.

## Release boundaries

Existing PR50/52 only. No merge, deployment, Production read/write, Railway configuration, provider calls, real orders, emails or payments. Prices, catalog eligibility, accepted historical records and customer notification behavior were not changed by this follow-up. Exact final SHAs and CI outcomes are recorded in the PR descriptions and final readiness report after all jobs finish. Native Apple Mail validation remains a separate acceptance gap even when automated CI passes.
