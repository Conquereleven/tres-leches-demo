# Open blockers and owner actions

| ID | Severity / state | Evidence | Required closure |
|---|---|---|---|
| RG3-ROUTE-01 | **P0 CODE BLOCKER** | Four D1 routes404 in compiled Node, both engines | Reviewed isolated allowlist fix + compiled HTTP/login/refresh/RBAC rerun on final RC |
| RG3-BACKUP-01 | OWNER ACTION REQUIRED | Actual private DB/backup paths, timestamp, integrity and restore not accessed | Private operator verifies restorable live backup and custody; aggregate sign-off only |
| RG3-PIPELINE-01 | OWNER ACTION REQUIRED | main protected:false; private protection API403; connected Railway main | Resolve plan capability and approved enforcement/manual safeguards; verify autodeploy/Wait-for-CI actual switches before merge |
| RG3-RUNTIME-01 | OWNER ACTION REQUIRED | RAILPACK effective vs NIXPACKS repo; deployed Node version not read | Confirm effective runtime/native SQLite and approved artifact build |
| RG3-ROLLBACK-01 | RESIDUAL FINANCIAL RISK | Current rollback anchor lacks Checkout Safety | Owner approves tested safety-preserving rollback/forward fix and any needed financial pause |
| RG3-CI-01 | RELEASE GATE | Compiled route gate rejects demonstrated defect; first published-head WebKit CI also logged an access-control failure (18/19) | Revalidate exact final head; resolve any persistent WebKit failure without weakening assertions; keep compiled blocker |

No request for Production secrets, private records or backup uploads to chat. RPO/RTO remain unverified. Founder Release Approval does not exist for this candidate, and cannot be requested as ready while the P0 route regression remains. Print connectivity, Product Hub editing and native Tagalog wording review remain known deferred capabilities, not fake-completed features. INFRA-01 DNS is out of scope.

**Final RG3 decision: BLOCKED / NO-GO.** Stop after review artifacts; no merge, deploy, configuration, data or unrelated branch/PR mutation.
