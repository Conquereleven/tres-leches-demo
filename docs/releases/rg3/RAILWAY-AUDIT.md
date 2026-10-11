# Railway and GitHub — read-only audit

| Item | Observed |
|---|---|
| Project | `1f9a94c1-0574-49a9-b579-bf6af3aad601` |
| Production environment | `142de30a-4879-4d04-85b9-12e79aa51bda` |
| Service | `fe8c1417-39ca-4038-b94e-68659ab1c659` |
| Source | `Conquereleven/tres-leches-demo`, main, `e2a82387549d5861e110178d6b9c8b8ae7f84f10` |
| Live deployment | `bde0ce90-50d7-4a3b-a10e-2750613a398e`, SUCCESS |
| Build/start | RAILPACK V3, `npm run build`, `npm start` |
| Runtime | Railway V2, sfo, one replica; exact deployed Node version not read |
| Health | `/api/health`, timeout 120 seconds; HTTPS www health 200 with matching SHA, mode live |
| Volume | `/data`, 5000 MB, existing persistent volume |
| Staged changes | none |
| Rollback metadata | live anchor and `fb78d470-a648-4fd6-a6f5-3fdc86fdc857` report canRollback/canRedeploy true |
| Repository config difference | railway.json says NIXPACKS; effective live metadata says RAILPACK |
| main protection | GitHub protected:false; protection API 403 explicitly requires plan upgrade/private repo feature |

Do not equate Railway runtime V2 with a Node version. Native SQLite must remain supported; local rehearsal uses Node 26.4.0, CI pins 22.23.1. Effective production Node/runtime and builder resolution require owner/operator validation before release.

**Merge is a release risk.** Production source is main and recent deployments correspond to main commits. Railway documents connected-branch pushes as autodeploy triggers. The API read did not expose the active autodeploy-disable/Wait-for-CI switches; they are **not independently verified**, not assumed disabled. Treat any main change as an immediate deploy trigger until the owner verifies the actual switches. No config/source change was made.

Before a merge authorization, owner must separately approve environment-scoped suspension/gating of Production autodeploy and show its actual state; inspect staged diff and verify nothing applies to other environments. A connected main merge must not be used as a harmless preparatory operation. Wait for CI protects checks but is not Founder approval and does not replace a deployment gate. Persistent-volume deployments may have downtime; plan a staffed window.

Recommended protection after plan capability is addressed: PR-only main, at least one independent approval, dismiss stale approvals, resolve conversations, enforce `checks` from GitHub Actions and relevant browser/compiled release gates, require up-to-date branch, forbid force-push/deletion and unauthorized bypass. Current account/private-repo plan prevents enforcing the inspected protection feature. Upgrade privately or use a specifically approved manual release process; making the repository public is NOT proposed as an automatic workaround. No protection change occurred.

Sources checked 11 October 2026: [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches), [Railway autodeploy](https://docs.railway.com/deployments/github-autodeploys), [Railway rollback / volumes](https://docs.railway.com/guides/roll-back-bad-deploy). Aggregate observations: [metadata](evidence/production-metadata.json). No private variable values or creator identity is included.
