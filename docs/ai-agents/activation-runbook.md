# TL-26 activation runbook

Local foundation and copilot behavior are tested with isolated providers. Real AI, Meta and Paymennt account validation remains an external-input gate. Existing release production/deployment restrictions remain in force.

## Configuration

Set server-only `AI_PROVIDER=openai`, `AI_API_KEY` via a secret manager, an explicitly selected `AI_MODEL` supporting structured outputs, and `AI_ENABLED=true`. Never use VITE-prefixed keys. No key/model means NOT_CONFIGURED; disabled means no inference. Keep `AI_AGENT_DEFAULT_MODE=copilot` and `AI_AUTONOMOUS_ALLOWED=false`.

Limits: `AI_TIMEOUT_MS=10000` (100–30000), `AI_MAX_TURNS_PER_INBOUND=3` (1–5), `AI_MAX_TOOL_CALLS=6` (1–8), `AI_RATE_PER_MINUTE=6` (1–20). Each inference allows at most 1600 output tokens. Invalid configuration fails closed. Provider failures require human review; no automatic repeated inference retry.

Readiness exposes configured/model/enabled/default mode/autonomous permission, approved knowledge count, catalog, Meta and Paymennt readiness, last successful inference and recent errors. It reports configuration, not proof of a successful real account call.

## External prerequisites

- Owner-approved model/account, server key, data-handling policy and spending limits.
- Approved imported catalog and commercial rules; no invented or test products in runtime.
- Approved English/Spanish FAQ, especially allergens, lead times, hours and cancellations.
- Three real Meta number mappings, credentials and approved templates where applicable.
- Existing Paymennt TEST credentials, registered webhook secret and signed GET reconciliation setup; real-payment activation is not part of this sprint.

## Controlled acceptance

With a designated test recipient and approved outbound authorization, verify inbound WA2, private order suggestion, human-approved reply from WA2, draft/items, GPS delivery rule, eligible quote, human-approved payment request, signed Paymennt TEST reconciliation and Confirmed. Then test custom wedding enquiry and takeover during inference/queued send. Check audit correlation, token use, timeouts and no unintended sends. Keep copilot until these account-level tests and operator training are signed off.

Local validation commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:sites`, `PLAYWRIGHT_BROWSERS_PATH=./work/browsers npm run test:e2e:build`, `npm run audit`, `npm run scan:secrets`. Browser fixtures are isolated from release runtime. Screenshots and accessibility checks cover 390, 768, 1024 and 1440 px.

Rollback: disable `AI_ENABLED` and restart the server. Final dispatch guards reject queued AI messages when automation is disabled. Existing human Inbox, order and payment workflows remain usable. Preserve the database/audit and normal backups; do not reset live data.
