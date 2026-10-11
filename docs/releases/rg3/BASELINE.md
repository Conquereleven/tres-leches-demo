# Verified baseline

Revalidated 11 October 2026 (UTC timestamps in evidence; user timezone Asia/Dubai).

| Component | SHA | Result |
|---|---|---|
| main / Production | `e2a82387549d5861e110178d6b9c8b8ae7f84f10` | unchanged |
| PR #7 Catalog Foundation | `b65be4915327f74ef54325bf7793bc15f54596da` | OPEN, individual checks SUCCESS |
| PR #9 Checkout Safety | `ff1b9565c1d03f51191cb3bfa4200186cbe3aa06` | OPEN, individual checks SUCCESS |
| PR #10 Operations V2 | `dcf4c9c23827721e79981ec491040aa55597d936` | OPEN, individual checks SUCCESS |
| Gate 2 primary published anchor | `0d2ab0256c49f13c8ae69a1b5f8b627d123f2197` | #7 + #9, NOT #10 |
| Existing separate combined smoke | `b478d78c62a27f331034af2d688b675c342983bb` | #7 + #9 + #10, verified locally |
| RG3 application integration | `58d44483cddab3ecc72555b135454e63f85c6913` | Gate 2 primary + unchanged #10, no conflicts |

Canonical repository `/Users/rodrigom./code/tres-leches-demo` remains on its unrelated existing branch. RG3 worktree is isolated under `worktrees/3l-rg3-release-candidate`; branch `integration/3l-rg3-release-candidate`.

Gate 2 was clean before work. Ancestry tests prove #7/#9 are ancestors of its primary SHA, and #10 is an ancestor of the separate smoke. The latter was never mislabeled as the former. Published `integration/3l-gate-2` preserves the exact original SHA, report and safe historical transcripts. No force-push or original feature rewrite occurred.

The RG3 merge retains all three component SHAs in ancestry. Against `e2a82387549d5861e110178d6b9c8b8ae7f84f10`, approved import/menu/price policy/SQL schema/dependency lock are unchanged; PR #7 adds only its catalog CLI package script and isolated foundation types/reads. RG3 adds no application fix or business data change. The secret scan of Gate 2 found 0 findings; transcripts use fixtures, not private records or merchant checkout links.

Historical Gate 2 observations remain explicitly historical. Current source-of-truth evidence is this report plus the review PR's exact-head checks.
