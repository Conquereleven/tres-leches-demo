# 3L direct Meta coexistence receiver

16 October 2026. **DIRECT META CLOUD API ONLY.** This supersedes the earlier META-002 provider-selection proposal. No BSP, external dashboard dependency, intermediary subscription or alternate transport is proposed or implemented. CornerTech's future Tech Provider registration is a separate business process.

Current baseline is deployed main `8f5cc785fe408b0288a3b8403983787cf57721ec`. PR #35 integrates that baseline without rewriting its original branch history. Paymennt, Resend, Product Hub, personalized packs and historical commercial snapshots remain unchanged.

**Read [direct-cloud-readiness.md](../direct-cloud-readiness.md) before any activation.** Business verification and a Live app are confirmed; the Business App number is not Cloud-connected. The official coexistence/v4 launch entitlement is not established. Code readiness is not onboarding eligibility or permission to send.

## Documented direct contracts

| Meta field | Implemented behavior | Deliberate limits |
|---|---|---|
| `messages` | Live text/GPS/contact profile, image/audio/video/document/sticker metadata, sent/delivered/read/failed receipts | Unsupported types remain review placeholders; no media download/playback/transcription |
| `smb_message_echoes` | Validate original business sender and counterparty; outgoing provenance; pause AI and invalidate queued AI send guards | Does not invent a staff assignment or open a customer-service window |
| `history` threads | Chronological original IDs, direction, receipt evidence and imported provenance; deduplicate against live/echo messages | No automatic export request, complete-sync claim, or progress UI; history does not open a 24-hour API window or affect order GPS |
| `history` separate `value.messages` | Enrich original media placeholder using same source/counterparty/wamid; durable retry if placeholder has not arrived | Direction comes from original message, not media update's `from`; URLs discarded; incompatible original text/media rejected |
| `smb_app_state_sync` | Timestamp-ordered contact `add` (also edits) / `remove`; normalized phone identity | No empty chats, reset unread/assignment or deletion of history |
| `account_update` | Bounded, idempotent diagnostic observations of `PARTNER_REMOVED`, `ACCOUNT_OFFBOARDED`, `ACCOUNT_RECONNECTED`; documented envelope may omit phone metadata | Does not register, disconnect, enable sends or assert account readiness. Other lifecycle fields acknowledged/ignored |
| `history` error 2593109 | Record history-sharing-declined observation once | Never report fabricated history or successful sync |

## Security and persistence

- Existing plaintext GET challenge verifies the configured token. POST verifies `X-Hub-Signature-256` HMAC-SHA256 hex against the Meta App Secret and exact raw request bytes **before parsing**. Invalid signature 401, invalid payload/source 400, oversized body 413.
- Configured WABA/phone/source mapping is mandatory. No first-number or synthetic fallback. A phone-specific lifecycle event must match the configured phone; WABA-only observations remain WABA-scoped.
- Commit the durable inbound batch before HTTP acknowledgement; transactional event digests and original message IDs suppress duplicates across retries/restarts. Early statuses/media retry through the existing bounded queue rather than making transport calls.
- Preserve receipt monotonicity, original message direction, human assignment and live-only API windows. Mobile echoes pause queued AI before transport; history cannot trigger AI or outgoing jobs.
- WhatsApp-only raw body limit 8 MiB, bounded arrays and at most 10,000 normalized events; other endpoints keep their original 64 KiB limit. Oversized batches are rejected, never silently truncated.
- Media observations contain allowlisted metadata only, never fetched URLs. React renders message text; logs do not print bodies, phones, location, headers or secrets.
- Additive optional JSON-state observations need no migration/backfill. No startup rewriting of conversations, orders or payments. Lifecycle observations retain the last 1,000 events; they are diagnostic evidence, not an account-control subsystem.

## Local evidence and activation boundary

[QA.md](QA.md) separates historical META-002 evidence from the current META-003 baseline/results. Synthetic fixtures exercise the HTTP signature, queue, SQLite, Inbox, mobile takeover and commercial regression boundaries without external provider calls.

Keep `META_OUTBOUND_ENABLED=false`, `OPERATIONS_WHATSAPP_ENABLED=false`, AI disabled. Real subscriptions, onboarding, sync requests, token exchange, linking, deployment and messages each require the separately authorized activation session described in the readiness runbook. No onboarding launcher or public token-exchange endpoint has been exposed while Meta eligibility/configuration remains unresolved. Ordinary `/register` is not the coexistence procedure.
