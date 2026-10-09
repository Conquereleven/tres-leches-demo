# TL-26 validation — 2026-09-11

Decision: **AI COPILOT READY / EXTERNAL INPUT REQUIRED**. Foundation and narrowly supervised behavior pass local fixture validation. This is not certification of a real model, Meta account, Paymennt account, live payments or production load. Release posture remains copilot, autonomous permission false, inference disabled until configured.

Baseline verified: `release/3l-provider-activation-final` at `0a7c7141b8683d52d67bebf3eceffe938cd4714b`. Work is isolated on `feature/3l-ai-agents`.

| Check | Result |
| --- | --- |
| Lint | PASS |
| Strict TypeScript | PASS |
| AI/tool/policy/domain/Meta/Paymennt/HTTP/DB | 143/143 PASS; includes 35 new TL-26 tests |
| Production build | PASS; Node backend and preserved static Sites packaging |
| Sites regression | 4/4 PASS |
| Browser E2E against build | 11/11 PASS |
| Dependency audit | 0 vulnerabilities |
| Secret scan | 0 findings; heuristic source and frontend bundle scan |
| Inbox responsive | 390/768/1024/1440: no horizontal overflow |
| Accessibility | axe smoke: 0 violations on AI Inbox at four widths |
| Browser console | No errors in AI scenario; prior brand/Commerce checks also pass |
| Visual inspection | Reviewed generated 390 and 1440 screenshots; warm workspace styling retained |
| Local empty preview | Health and canonical Inbox return HTTP 200 on port 5191 |

Browser checks exposed and fixed a small-button contrast issue and unnamed duplicate landmarks in the existing workspace. No legacy inbox or demo runtime was reintroduced.

## Golden paths

A: WA2 inbound order intent → authoritative catalog lookup → private suggestion → human-approved response routed through WA2. Tested in browser and HTTP.

B: AI proposes draft/items → separate human approvals → inbound GPS → domain eligibility → prepared payment → explicit approval → Paymennt TEST adapter → same-number WhatsApp → signed notification and authoritative GET → Paid/Confirmed. Real adapter contracts are exercised against isolated HTTP fixtures; no external account or actual payment was used.

C: Wedding cake for 120 people → structured enquiry and quotation handoff → human takeover/pause prevents automation. Browser validates enquiry; unit tests hold inference and queued sends across takeover.

Additional coverage: empty/unknown catalog, low confidence, FAQ approval and optimistic edit invalidation, Spanish product response, unresolved zone, below minimum, 24-hour guards, duplicate inbound, stale regeneration, inference timeout, safe tool failure, structured-output rejection, forbidden tools/arguments, price/payment/role prompt injections and loop/rate bounds. Existing durable payment and message regressions remain green.

## External inputs only

Configure an owner-approved AI account/key/model; obtain Lisa's approved catalog and language-specific business knowledge; connect the three Meta numbers; complete the existing Paymennt TEST account/webhook configuration for payment UAT. Then perform explicitly authorized account-level tests in copilot. No real outbound, paid reconciliation, deployment, push or merge was performed in TL-26.

Audit and screenshots use clearly isolated test identities/products. The operator preview has an empty database and providers disabled. The code includes no mock fallback for missing runtime credentials.
