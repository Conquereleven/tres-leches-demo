# Closure 01 — PR #50

Baseline main: `589a78387c9efb5f4abd6e495d3746435c00dde5`. Initial PR head: `b93978b75ff1c00c65b08dd7e862d59abcdd127e`.

CI run 39330152630 failed premium email assertions in both engines. Reproduced 2/2 locally: preview fixtures never opted in after recipient-scoped rollout was introduced, so they rendered legacy email. The fix opts only synthetic recipients into preview compact output. Runtime defaults remain legacy for every recipient.

Regression coverage proves the unselected HTML byte-identical to the stored original-renderer control, three selected fictional recipients compact/fourth legacy, unknown recipients rejected, and paid-event repeats cannot replay notifications. Recipients are selected once into frozen outbox payloads. No actual email addresses were configured or verified here; private allowlist confirmation is required before rollout.

Local: typecheck/lint/build; commerce 693/693; email browsers 24/24; premium 24/24; Tricolor 28/28; secrets/audit. Chromium and WebKit. Final GitHub results are recorded on the PR.

Shared Tricolor synchronization explicitly verifies controlled color state, stable centered button geometry and hit target before one normal click, then exact persisted cart lines. Five-line expectations remain. CI traces on #51 show smooth-scroll/header interference; main and email-only PR share storefront code. Original intermittent miss was not deterministically reproduced locally (main 40 standard passes plus six scroll diagnostics; candidate ten standard passes). New active-scroll regression passes both engines; no claim of a newly proven customer cart defect.

Compact previews remain in docs/email/previews. Browser screenshots do not certify native iPhone Gmail/Apple Mail rendering. No provider calls, historical replays, private recipient configuration or Production access. Review only; no merge/deploy.
