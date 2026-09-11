# TL-26: AI customer service foundation

The existing authenticated Commerce Inbox remains the only operator workspace. AI proposes; CommerceService owns orders, delivery eligibility, payment requests, number routing and fulfilment. No runtime fixtures or alternative inbox were added.

## Boundaries

- `server/agents/model.ts`: strict structured plans, model port and domain gateway port. The model selects intent, language, response kind and allowlisted tools. It cannot supply prices, actor, order identity, payment state or outbound number.
- `orchestrator.ts`: one bounded inference per run, validated tool sequence, policy and deterministic response composition. It imports no database, Meta, Paymennt or React modules.
- `provider.ts`: server-only OpenAI Responses adapter; replace `AgentModelProvider` for another service. Uses structured JSON schema output, abort signal, bounded output and `store:false`. Configuration is injected by `server/http.ts`. [Official structured-output contract](https://developers.openai.com/api/docs/guides/structured-outputs).
- `context.ts`: recent 16 messages (1,000 characters each), compact structured summary, up to eight relevant catalog references, scoped order/delivery/payment facts and approved language-specific FAQ. Emails and long phone numbers are redacted before model submission. User messages may still contain personal information; configure provider handling before activation.
- `policy.ts` and `replies.ts`: mandatory handoff rules, narrow automatic-response allowlist, grounded bilingual response templates. Deliberate pilot tradeoff: no arbitrary model-written customer prose. Operators may edit private proposals.
- `server/domain/agent-gateway.ts`: tool authorization, handoff/control, approval and audit implementation behind the gateway port. Domain commands retain validation, receipts and audit. Every commercial tool creates a proposal, never an unapproved mutation.
- Existing durable SQLite state gains optional `ai` sessions/runs/knowledge/enquiries. Older snapshots read without migration; new AI state is initialized lazily. Existing backups and integrity checks include it.

## Concurrency and truth

A run captures conversation version, owner, originating number, control epoch and a commercial-data fingerprint. Completion, approval and final queued dispatch recheck freshness. Takeover, pause, assignment or a newer run invalidates pending automation. A message already handed to the network before takeover cannot be recalled.

Inbound identity deduplicates automatic inference, with one active run per conversation. Manual regeneration has per-inbound and per-minute limits. Expired in-flight runs after a restart require human review, avoiding automatic repeated spend. Failed inference is not silently retried. Existing provider outbox retry policy remains authoritative.

AI-approved messages reuse the conversation's original WhatsApp number. No general-purpose approved template is assumed: outside the service window, AI text is blocked. The existing approved payment-template path remains within CommerceService.

Payment preparation shows a domain quote and requires explicit human approval. Only existing signed Paymennt notification verification plus provider GET reconciliation can mark payment paid. AI has no such tool.

## Audit and costs

Persisted run records include correlation ID, provider/model/mode, intent/confidence, typed tool outcomes, proposal, disposition, handoff reason, timestamps, latency, usage when reported and approval counts. The outbound message stores the delivered text/status; conversation audit identifies human approvals. No chain of thought, raw provider response, API key or private headers are persisted. Cost is optional when a provider supplies it; token counts are recorded without inventing a dollar estimate.

Automatic runs are bounded to 100 candidate conversations per tick, one inference each, configured timeout/tool count and per-conversation rate. Production capacity should be load-tested before widening supervised mode. Tests inject mocks only through isolated test harnesses; absent runtime configuration yields NOT_CONFIGURED.
