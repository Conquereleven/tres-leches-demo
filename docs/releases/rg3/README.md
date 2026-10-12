# RG3 — Production release gate

**BLOCKED / NO-GO. Review only; NOT APPROVED FOR MERGE.**

The integrated application commit `58d44483cddab3ecc72555b135454e63f85c6913` combines verified Gate 2 with PR #10. This review branch adds reproducible QA scripts, isolated head-pinned CI and this release dossier only. The exact final review SHA and its CI run URLs are recorded in the PR; check the PR head rather than assuming the application integration SHA is the final review head.

The Node Production-profile rehearsal confirms four D1 direct routes return 404. The Vite/browser and commercial passes do not override this code blocker. Live backup verification and repository/deployment safeguards also require owner action. Gate 2's earlier approval-request verdict is superseded by this RG3 gate.

- [Baseline and ancestry](BASELINE.md)
- [Fresh CI and browser evidence](CI-EVIDENCE.md)
- [Backup / recovery](BACKUP-RECOVERY.md)
- [Railway / GitHub audit](RAILWAY-AUDIT.md)
- [Commercial safety](COMMERCIAL-SAFETY.md)
- [Compiled routing QA](ROUTING-QA.md)
- [Release strategy](RELEASE-STRATEGY.md)
- [Operator / post-deploy checklist](RELEASE-CHECKLIST.md)
- [Rollback](ROLLBACK-RUNBOOK.md)
- [Open blockers](OPEN-BLOCKERS.md)

No main merge, deployment, Production filesystem/config/data mutation, provider call, DNS change or unfinished feature activation was performed. Original PRs/worktrees are preserved. This is a review artifact, not a live release.
