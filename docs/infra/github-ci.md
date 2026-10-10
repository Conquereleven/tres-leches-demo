# GitHub validation CI

`Commerce validation` runs on pull requests to `main` and pushes to `main`.
The `checks` job uses Node 22.23.1, the npm lockfile, full Git history (catalog regression tests read historical commits), and actions pinned to immutable commit SHAs.

It runs typecheck, lint, build, all commerce unit/HTTP/payment integration tests, preserved Sites worker tests, a source/client-bundle secret scan and npm audit. Provider tests use mocks and disposable databases. No provider credentials, Railway tokens, deployment commands or merchant API probes are configured.

The build embeds the GitHub event SHA. This workflow validates code only; it never releases it. Chromium/WebKit checkout regressions remain part of the separately verified release gate and can be added as a dedicated mock browser job later.

After this independent PR is approved and merged, enable branch protection with the `checks` status required and the desired review policy. That settings change requires separate authorization and is not performed by this PR. Do not supply Production secrets to CI.

## Enable protection after explicit approval

No protection settings are changed by this PR. For this private repository, confirm that the account plan supports protected branches and the actor has repository administration or edit-rules permission; stop if either is unavailable.

1. Approve and merge this CI PR separately. Verify `checks` succeeds on the final reviewed head and on `main`; never rely on a check from a superseded head.
2. Open repository **Settings → Branches → Add classic branch protection rule** (or edit the existing rule for `main`, avoiding conflicting rules).
3. Set branch name pattern to exactly `main`.
4. Enable **Require a pull request before merging**, with at least one approval; enable stale approval dismissal and conversation resolution according to the approved team policy.
5. Enable **Require status checks to pass before merging** and select the exact check context **`checks`**, supplied by **GitHub Actions**. The workflow name is `Commerce validation`; it is not the required check name. A recent successful run makes the context available. If the selector is missing, run the workflow and investigate; do not replace the requirement with a guessed name or fabricated status.
6. Recommend **Require branches to be up to date before merging** and **Do not allow bypassing the above settings**. Keep force pushes/deletions disabled. Do not require a Production deployment as a merge prerequisite.
7. Save only after explicit authorization for the repository settings change. Verify the rule requires `checks` from GitHub Actions and protects `main`; inspect a normal PR's merge gate without actually merging it. Do not intentionally push to main to test rejection.

Do not add another job named `checks`. Keep the workflow triggered for every pull request to main; path filters can leave a required status pending. A future merge queue needs a separately reviewed `merge_group` event before enforcement. This workflow does not establish a release authorization or connect Railway source.

Sources: [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule), [required check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks), [expected status source](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## Proposed future Chromium/WebKit job — not enabled

Add an independent `checkout-browsers` matrix with `needs: checks`, browser `[chromium, webkit]`, `fail-fast: false`, Ubuntu runner and a finite timeout. Reuse immutable checkout/setup-node action references, read-only permissions, Node 22.23.1 and the npm lockfile.

For each browser:

```sh
npm ci
npx playwright install --with-deps chromium
npx playwright test --config playwright.checkout.config.ts --browser chromium --workers 1
```

Use `webkit` in both commands for that matrix entry. The existing checkout config launches a local fixture server and disposable SQLite database; keep its fixed test clock, fake credentials and mock provider. Do not point it at the public website, Railway, real customer data or Paymennt TEST/LIVE. Keep the prior release expectation of 19 checkout cases per browser; investigate failures rather than weakening assertions or silently skipping cases.

A later PR can retain failure-only traces/screenshots with short retention and a pinned artifact action, after checking they contain only fixture data. Record retried failures rather than hiding flakiness. Do not make this new browser context required before it has been validated successfully. The existing `checks` context must retain its name.

Source: [Playwright CI installation and execution](https://playwright.dev/docs/ci).
