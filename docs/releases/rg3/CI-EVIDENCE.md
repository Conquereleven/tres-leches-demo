# Reproducible validation

Fresh initial combined run after `npm ci`: local Node v26.4.0 / npm 11.17.0; application integration SHA `58d44483cddab3ecc72555b135454e63f85c6913`. No old passing run was substituted for these results. Final review-head checks and local reruns are linked in the PR after publication.

| Gate | Fresh result |
|---|---|
| npm ci | PASS, 176 packages; existing npm allow-scripts notices |
| Typecheck / lint / build | PASS |
| Full commerce / unit / HTTP / integration / payment | 487 passed |
| Sites | 4 passed |
| Operations Chromium + WebKit | 34 passed, EN/TL × 390/768/1440 |
| Existing workflow / storefront entry / auth / RBAC | 7 passed |
| Checkout Chromium | 19 passed |
| Checkout WebKit | 19 passed |
| Historical ticket browser regressions | 16 passed, INCLUDED in Operations 34 |
| Synthetic backup / restore | PASS, integrity and full-state equivalence |
| Compiled Node Production routing | **FAIL: four D1 routes 404 in both engines** |
| Secret scan / dependency audit | 0 findings / 0 vulnerabilities |

No retries, failures or skips in the passing initial suites. Compiled routing failure is retained as a release blocker, not excluded to make CI green. Counts describe runs, not additive unique coverage. Existing public-brand legacy video smoke is excluded: its old desktop packaging-poster expectation disagrees with unchanged main's story poster; no public code or assertion was rewritten. Broad unrelated visual/Meta suites are outside RG3. Existing chunk-size/business-content build notices remain.

The existing `checks` workflow runs checkout/typecheck/lint/build/full unit/sites/scan/audit without deploy commands or Production secrets. Added `.github/workflows/rg3-release-gates.yml` runs only RG3 review PRs: `browsers` reproduces combined browser gates; `compiled-routing` fails closed on the Node route defect. It checks out `github.event.pull_request.head.sha` explicitly, fetches required history, pins Node 22.23.1 and known checkout/setup action commits, grants contents:read only and has no secret inputs, provider probes, database exports or artifact upload. It does not run deployments or enable automerge.

Reproduce from the exact review head:

```sh
npm ci
npm run typecheck
npx tsc --project scripts/rg3/tsconfig.json --noEmit
npm run lint
npm run build
npm test
npm run test:sites
npm run scan:secrets
npm run audit
npx playwright install --with-deps chromium webkit
mkdir -p work/e2e work/rg3
npx playwright test --config playwright.operations.config.ts
npx playwright test tests/e2e/operations-entry.spec.ts tests/e2e/commerce.spec.ts tests/e2e/ai.spec.ts tests/e2e/shell.spec.ts tests/e2e/staging.spec.ts
npx playwright test --config playwright.checkout.config.ts --browser chromium
npx playwright test --config playwright.checkout.config.ts --browser webkit
node --import tsx scripts/rg3/backup-rehearsal.ts
node --import tsx scripts/rg3/compiled-routing.ts
```

Serialize suites sharing a port. Routing exits 2 for the demonstrated defect. Local logs under ignored `work/rg3/` contain only fixtures. Safe aggregate JSON is in [evidence](evidence/); its subject SHA is explicit. The final PR checks independently bind the final head, even when it includes documentation beyond the initial application merge.

## First published-head CI observation

Head `998aa8cd39cfd7be1eb40b52549e184dc9404c61`: standard `checks` SUCCESS. Combined CI passed 487 units, 4 Sites, 34 Operations, 7 workflows and 19 Chromium checkout. WebKit finished 18 passed / 1 failed: `checkout.spec.ts:128` captured an access-control error for `/api/checkout/config` around the mocked external checkout navigation; functional flow reached its expected page. This is unresolved CI evidence, not ignored or relabeled as PASS. Both local full WebKit runs passed 19. One browser-job rerun was requested on that head; final attempt/head results are retained in the PR.

Compiled CI independently reproduced all four route404 failures on the exact head with exit2. Safe logs: [browser run](https://github.com/Conquereleven/tres-leches-demo/actions/runs/38160996856), [standard checks](https://github.com/Conquereleven/tres-leches-demo/actions/runs/38160996775).

An additional strict check exposed missing required nextAt/attempts fields in the synthetic backup receipt, outside the repository's top-level script include. RG3 corrects only that fixture and adds a scoped scripts/rg3/tsconfig.json plus its CI command. No application or original feature change is involved. The new final head must pass its own gates; older results are supplementary evidence only.
