# Release strategy comparison

| | A: sequential | B: one integrated candidate |
|---|---|---|
| Tested sequence | #9 stage 5a73028…; +#7 6858a26… plus d359b72 interaction tests; +#10 isolated smoke b478d78… (historical evidence only) | RG3 combination `58d44483cddab3ecc72555b135454e63f85c6913` plus review-only evidence commits, fresh combined gates |
| Production deployments | 3, possibly extra when fixing routing | 1 after routing fix and all prerequisites |
| Intermediate compatibility | New main squash SHAs and each intermediate artifact need fresh independent gates; combined QA is insufficient | No user exposure to a partially integrated set |
| Data | No new SQL schema/import required; private baseline each stage | No new SQL schema/import required; one private baseline |
| Backup/rollback | Verified backup, exact code anchor and monitoring at each stage | Verified backup and one compatibility-reviewed code anchor |
| Customer exposure | Three volume restarts/windows, partial admin functionality risk | One staffed window; combined change set larger |
| Disable unfinished features | Preserve catalog read/edit restrictions, print preview, provider flags throughout | Same; no activation bundled |
| Railway trigger | Every main change potentially deploys without verified gating | One main change still potentially deploys; must gate first |

**Recommend B after clearing routing and owner controls**, because the exact combined candidate is tested together, introduces no commercial/schema migration and avoids unvalidated intermediate versions and three potential autodeploys. Neither strategy is authorized or ready now.

A is viable only if the owner prefers smaller change sets and each exact resulting SHA independently passes compiled routing, financial, backup and browser gates before its own approved deploy. Prior Gate 2 stage counts do not authorize those releases. #9 must precede dynamic catalog integration in either strategy. Do not land the feature PRs separately merely because their individual checks are green.

For B, prefer a separately authorized integration merge retaining ancestry once the branch contains the corrective route SHA and green gates. Whichever allowed merge method the owner selects, record the actual resulting main SHA; a squash changes the SHA and requires verification/rebuild/testing before an explicitly controlled deployment. Do not reuse the review SHA as a presumed squash SHA. No Git or Railway command that releases is executed in RG3.
