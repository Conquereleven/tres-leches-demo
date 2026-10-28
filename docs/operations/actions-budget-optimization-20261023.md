# GitHub Actions budget efficiency (proposal, no release)

## Why
October 2026 saw 408 Tres Leches workflow runs, including 79 Personalized Packs runs. The old Personalized Packs workflow launched three browser jobs for every match: a broad Packs suite plus Chromium and WebKit Operations; a successful representative run occupied ~30 runner-minutes. Separate SEO, Analytics and Conchas workflows can also execute at the same time.

## Changes proposed
- Keep all original Packs/checkout/email/Premium/Tricolor/Product Hub/dynamic-storefront assertions in the unchanged Packs browser job.
- Move both Operations browser matrix jobs into an independent, path-filtered `Operations mobile regression` workflow. The full candidate Operations suites remain required on related source/backend changes; no assertions are skipped.
- Drop only the historical 5x WebKit comparison against an older main baseline, which was a troubleshooting diagnostic, **not** the candidate release test. Failures still keep logs/traces.
- Narrow Analytics's general `src/commerce/**` trigger to actual Analytics, workspace routing, API and i18n files; keep `server/analytics/**` and Analytics tests triggers.
- Preserve the always-running `Commerce validation` baseline (typecheck, lint, build, unit tests, security audit, secret scan) and all live commerce/payment code and infrastructure unchanged.

## Gate verification prior to merge
- Workflow syntax and path matching must be reviewed. Test path cases: a Workspace-only change runs Operations (not Packs); a pack pricing or checkout change runs Packs and relevant Operations/other workflows; Analytics-only change runs Analytics and Operations if workspace integration changes; docs-only changes do not launch Playwright.
- Verify checks on an isolated test PR with a meaningful file change. Do not conflate GitHub's workflow trigger paths with actual correctness of all dependencies.
- Check required status names before merging: old `operations-browsers` checks will now be emitted by another workflow. Update protected rulesets first if any are configured.
- Observe 2-3 PRs' billable job minutes; rollback is a Git revert of these workflow files.

No merge, deploy, Product Hub writes, payments or production changes are authorized by this draft.
