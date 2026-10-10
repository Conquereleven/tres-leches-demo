# GitHub validation CI

`Commerce validation` runs on pull requests to `main` and pushes to `main`.
The `checks` job uses Node 22.23.1, the npm lockfile, full Git history (catalog regression tests read historical commits), and actions pinned to immutable commit SHAs.

It runs typecheck, lint, build, all commerce unit/HTTP/payment integration tests, preserved Sites worker tests, a source/client-bundle secret scan and npm audit. Provider tests use mocks and disposable databases. No provider credentials, Railway tokens, deployment commands or merchant API probes are configured.

The build embeds the GitHub event SHA. This workflow validates code only; it never releases it. Chromium/WebKit checkout regressions remain part of the separately verified release gate and can be added as a dedicated mock browser job later.

After this independent PR is approved and merged, enable branch protection with the `checks` status required and the desired review policy. That settings change requires separate authorization and is not performed by this PR. Do not supply Production secrets to CI.
