# Production code release — providers pending

The user authorized updating the existing Railway production service to the current TL-24/TL-25/TL-26 code while keeping all external providers offline. This supersedes earlier notes that unconditionally blocked production boot; it does not authorize LIVE payments or autonomous AI.

Production now requires the hosted HTTPS/auth/backup contract plus PROVIDER_MODE=offline, META_OUTBOUND_ENABLED=false, AI_ENABLED=false, AI_AGENT_DEFAULT_MODE=copilot and AI_AUTONOMOUS_ALLOWED=false. INTEGRATION_MODE must not be true. Omit STAGING_SEED entirely. PAYMENNT_ENVIRONMENT remains test solely as a safety guard; no payment credentials are configured. Runtime data initialize empty, with only the existing approved/explicitly incomplete zone configuration.

The production database uses profile release-production. It rejects staging, test, demo and legacy databases even if they appear empty. The catalog importer accepts explicit production apply/rollback against that profile and retains mandatory backup; no catalog is imported as part of deployment.

Admin readiness GET is available with authentication. Provider probes remain staging-only, so production cannot accidentally activate providers through diagnostics. `/api/health` is public liveness; `/api/ready` checks storage. The Node listener honors PORT first. Build tooling embeds the full BUILD_SOURCE_SHA into `/api/health` at compilation, independently of later runtime-variable changes. Upload only an immutable archive of the recorded clean Git HEAD and provide that same SHA at build time.

Deployment target:
- Project 1f9a94c1-0574-49a9-b579-bf6af3aad601
- Production environment 142de30a-4879-4d04-85b9-12e79aa51bda
- Service fe8c1417-39ca-4038-b94e-68659ab1c659
- Domain tres-leches-pasteleria-demo-production.up.railway.app
- New volume ac1b35e4-12c2-4878-9ed0-6d3583b076b8 at /data
- DB /data/3l-production.sqlite; backups /data/backups

Previous deployment retained for emergency rollback: 42a49861-c9f9-46cd-a5cd-70eef3a750b1 (2026-09-02). Original config had no service variables or volumes and no explicit healthcheck. If the new release fails health/auth/storage/UI acceptance, restore the previous deployment using Railway's rollback workflow and restore the recorded previous routing/healthcheck settings as necessary. Keep the new persistent data volume intact; never delete data as a rollback shortcut. The previous UI is a temporary recovery target, not the desired final release. Do not modify or delete paymennt-test.

Acceptance requires public route checks, secure login, zero fabricated runtime records, backup success, DB/volume persistence across redeploy, matching compiled SHA, startup logs and desktop/mobile visual smoke. Backups on the same volume are not off-volume disaster recovery. This release is PRODUCTION CODE DEPLOYED / PROVIDERS PENDING only after those checks, not full GO-LIVE.
