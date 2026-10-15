# 3L-META-002 — Coexistence and inbound-only activation

15 October 2026. Baseline `a75a0fa1637f4511ed0237e2b4fff621489e619a`; isolated branch `feature/3l-meta-coexistence-inbound`. No Production/Meta changes, onboarding, message, payment, token generation, merge or deployment is authorized by this document. Keep `META_OUTBOUND_ENABLED=false`, `OPERATIONS_WHATSAPP_ENABLED=false`, AI disabled. PR #20's paid-order outbox, Paymennt, Resend, historical orders and commercial rules are preserved.

## A. Coexistence decision

Use an **eligible Solution Partner/Tech Provider's current Embedded Signup v4 Business App onboarding**, not ordinary Cloud registration. 3L is the own-business customer; do not enroll it as a technology reseller or involve another business. Our existing Live app/token does not prove eligibility to host that onboarding directly. A partner may preserve our own Graph adapter, but must confirm asset access, event delivery and signatures in writing first. No partner contract or subscription was started.

The read-only status audit immediately preceding this sprint confirmed Verified portfolio, Live app, valid SYSTEM_USER token with both WhatsApp scopes, existing app/WABA subscription, one Business App number still ON_PREMISE/DISCONNECTED/NOT_VERIFIED, messages off, no templates and both outbound flags false. It also confirmed the Access Verification notice now says **14 December 2026**. A targeted final GET refreshed the number state (unchanged) and privately reconfirmed both outbound flags false; no entire repeat audit was performed. Main was refreshed and the scope was developed separately. These account observations are dated evidence, not live activation proof.

**Number eligibility: NOT YET CONFIRMED.** Business App use on Lisa's primary iPhone satisfies a prerequisite, but age/quality/provider acceptance are unproven. ON_PREMISE/NOT_VERIFIED prevents the current internal sender preflight from passing; it does not prove the number is ineligible for coexistence or justify calling `/register`. The eSIM is not a documented reason to replace the number.

Meta documents retaining the account ID/portfolio and Business App, with optional history sharing and companion-device disruption. Require partner confirmation for the exact assets below and preservation of the existing staff operation. Lisa needs her active primary iPhone and current Business App (documented minimum 2.24.17), control of the line, backup, and time to approve the official linking prompt/code; the partner flow starts on the onboarding surface, not by deleting/re-registering the iPhone app. No code, QR or account connection was initiated here.

Known impacts: companion devices are initially unlinked and only supported clients can be relinked; some mobile features change. History is an explicit consent/synchronization operation, not automatic Inbox population. Groups are not a complete Cloud chat mirror. The existing account's messages are not proof of an API 24-hour window. Arrange a supported-device/continuity plan with Lisa. New Cloud messages are separately billable; provider plans may add fees.

360dialog is a **candidate with documented coexistence support**, not a verified integration for this number. Its documentation ties eligibility to account tenure/quality, requires a plan, and warns against uninstalling Business App; obtain a written precheck, costs and transport/ownership terms before choosing it. No claim that its webhook transport is the same as direct Meta Graph. If its contract lacks verifiable raw Meta signatures/compatible routing, a separate reviewed BSP adapter is required; do not disable verification or paste an API key into this adapter. Decline any provider route that requires deleting the Business App account; use a confirmed coexistence provider instead.

For own assets, Meta's App Review guide distinguishes own-developer use from access to other businesses; missing Advanced Access approval is not by itself proof that 3L cannot use its own WABA. The outstanding Access Verification warning still needs written Meta clarification without falsely declaring 3L a Tech Provider. No App Review/access submission is part of this sprint.

Sources reviewed:

- [Meta Business App onboarding and payloads](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/): authenticated documentation inspected 15 October; v2/v3 retirement is **15 October 2026**, so do not reuse an old onboarding link. Includes history, state_sync and message_echoes envelopes used by the fixtures.
- [Meta App Review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review/): own-use versus Advanced Access distinction.
- [360dialog coexistence](https://docs.360dialog.com/docs/resources/phone-numbers/coexistence): provider eligibility/operational limitations; no individual precheck result.
- [WhatsApp messaging policy](https://whatsappbusiness.com/policy/): consent, templates and API customer-service window.

## B. Implemented contract

### Accepted direct Meta fields

| Field | Supported result | Limits |
|---|---|---|
| messages | Text, GPS, identifiers/time, contact profile; image/audio/video/document/sticker metadata; sent/delivered/read/failed receipts | No media fetch, playback, URL fetch or transcription. Unknown message types remain an explicit review placeholder |
| smb_message_echoes | Business App sent messages, with exact from/to identity, outgoing placement and source badge | Invalid sender/counterparty rejected; mobile activity pauses AI and invalidates queued send guards without inventing an assigned staff identity |
| history | Documented chunks/threads, original IDs/time, in/out direction, available receipt evidence, explicit imported label | No request for a history export; no promise that all history arrived or that a sync is complete |
| smb_app_state_sync | Add/update/remove contact observations, timestamp order, normalized phone lookup; update existing chat name | Contact sync never creates an empty chat, resets unread/assignment or erases a conversation |

`account_update` and template lifecycle fields are deliberately **not operational lifecycle handlers** here. Unknown non-conversation fields from a configured WABA are ignored/acknowledged; they never change assets, credentials, sending flags or account readiness. A partner must handle/account for its onboarding lifecycle. History errors/denied sharing yield no fabricated messages; there is no sync-progress/completion UI or automatic recovery request. Do not subscribe extra lifecycle fields assuming a complete account synchronizer.

Contact updates use the documented `add` action with a newer timestamp; only `add`/`remove` are accepted on the wire. No undocumented `update` payload is claimed.

### Reliability and security

- Existing GET verification challenge and App Secret/raw-byte X-Hub-Signature-256 verification are reused. Parsing/normalization occurs only after signature verification. Invalid signatures 401; invalid origins/payloads return safe 400; oversized WhatsApp payloads 413.
- Direct Meta envelope must match a configured WABA and Phone Number ID. Echo sender and history thread/counterparty are cross-checked. Events from WA1 stay WA1. No new operational numbers or fallback sender.
- Receipt IDs are namespaced, bounded hashes; original provider message IDs are retained. Same provider message seen in live/history/echo surfaces is one chat message. Overlapping chunks cannot regress delivery/read status. A history-first message can gain live evidence without duplicate display; a delayed mobile echo still pauses AI.
- Existing durable inbound queue commits the batch before HTTP acknowledgment. Idempotent message application and queue completion recover across retry/restart. Early status receipts wait for their message. No blind transport retries were added.
- Phone matching tolerates an existing leading `+`. Contact removals retain chat history. Imported timestamps sort chronologically; future/invalid times are rejected. History does not reopen chats, set unread, apply GPS to orders, establish API windows or become an AI candidate.
- WhatsApp raw-body cap is 8 MiB only for that endpoint, with bounded arrays/10,000 normalized events and the existing rate limiter. Financial and other request limits remain 64 KiB. Larger provider chunks require explicit transport agreement; they are not silently truncated.
- Queued AI guards reuse version/epoch/origin checks. A mobile operator produces a human-readable pause warning in Inbox. Imported history may be context for a subsequent live request, but cannot initiate inference/send on its own.
- Media metadata is an observation only. No provider URL is persisted or exposed as a download link; message text is rendered as React text. Logging remains allowlisted counts/status, never message bodies, names, phones, coordinates, headers, tokens or secrets.
- Optional additive JSON-state fields require no SQL schema migration/backfill. No old message/order/payment row is rewritten by a startup migration. The fixtures use synthetic SQLite only.

See [QA](QA.md) for commands/results and screenshots. New EN/TL labels follow existing Operations localization; new Tagalog wording remains subject to native-language review.

## C. Activation checklist — execute only after explicit authorization

### Before connecting anything

1. Founder selects/authorizes a provider after the written precheck: coexistence for +971585943319; portfolio `196774801535754`; app `979058461878284`; WABA `926440084538581`; phone ID `767195727350479`. Confirm ownership, exact returned IDs, costs, supported devices, rollback, own-app permissions and signed event transport. Stop if the proposal substitutes assets or conventional registration.
2. Resolve the Access Verification notice with Meta for this own-business use. Do not create new apps/WABAs/users/tokens or submit unrelated draft permissions merely to bypass it.
3. Review/merge/release this PR separately. Verify deployed SHA, health, backups and both outbound flags false. This task does not authorize those operations. A release of the new code is required before real coex events reach it.
4. Test the selected transport against documented fixtures: direct Graph uses Meta App Secret and unmodified bytes. Provider-specific authentication/envelopes need an independently reviewed adapter if incompatible. No signature bypass.
5. Lisa confirms primary iPhone/app version, line control, backup, linked-device inventory, privacy consent/history choice, maintenance time and support contact. Identify the provider's receiver for lifecycle/history/contact/echo events before the time-limited sync phase.

### Authorized coexistence session

6. Provider launches **v4 existing Business App account coexistence**. Lisa approves the official Business App connection prompt and code/QR step on her iPhone only during the separately approved session. Do not use `/register`, delete the mobile account, uninstall WhatsApp, rename/transfer assets or disconnect other numbers. Stop at any unexpected agreement, cost or access request.
7. Compare returned IDs/ownership. Verify is_on_biz_app=true, platform_type=CLOUD_API and actual connection status using read-only Graph. Clarify any code-verification discrepancy with the provider; never force a standard registration to satisfy an internal gate.
8. Lisa confirms her original Business App still opens and retains existing conversations; relink supported companion devices with the agreed procedure. Any manual test message from the phone is a separately authorized action. Confirm other staff numbers remain untouched.
9. If Lisa consents to history/contact sync, the provider initiates the documented sync promptly within Meta's stated window (24 hours). That POST/sync request is not done by this code or authorized here. Verify chunk processing and any declined/error outcome; do not claim complete synchronization from a progress=100 chunk alone.

### Reception-only UAT

10. Authorize the minimal `messages` field subscription on the existing app/WABA. Existing callback: `https://tres-leches-pasteleria-demo-production.up.railway.app/api/webhooks/whatsapp`; canonical route also works at `https://www.3ldubai.ae/api/webhooks/whatsapp`. Changing the callback is optional and requires its own approval/handshake. Do not duplicate the already confirmed app↔WABA relationship.
11. Privately validate challenge/token and configure the approved echo/history/contact routing. Keep META_OUTBOUND_ENABLED=false, OPERATIONS_WHATSAPP_ENABLED=false and AI disabled. Only subscribe additional fields to the verified compatible receiver; no catch-all forwarding assumption.
12. An approved separate test phone sends one synthetic inbound text to WA1. Confirm signed POST, HTTP 200 after persistence, one durable event, correct source/customer and one message in Operations → Inbox. Confirm no outgoing jobs/provider sends and no order/payment changes. Observe event replay idempotency without another real message if permitted.
13. Separately authorize a synthetic media message/mobile reply if desired. Check metadata/Business App badge, no duplicate echo and AI paused. Verify delayed delivery/read status safely when an actually authorized prior message exists; do not create one just to obtain a receipt.
14. Stop with outbound off. Inbox replies, staff alerts, templates/billing and customer notification activation are different later approvals. PR #20 cutoff/template/recipient requirements remain mandatory; no historic alert replay.

### Recovery / rollback

- Before onboarding: cancel the flow and leave existing phone/Business App registration intact.
- On failed/partial onboarding: preserve IDs/error/case evidence privately, keep API sends off and contact the provider; do not retry standard registration, remove the WABA, or rotate tokens speculatively.
- On webhook/UAT failure: stop further test traffic, retain queued events for diagnosis and fix/roll back code through the approved release process. Any subscription change needs approval. Do not clear the queue or restore Production SQLite to retry a message.
- To stop sending, keep both flags false; disconnecting the phone is unnecessary. If an actual coexistence offboarding becomes necessary, Meta documents Business App Settings → Account → Business Platform → Disconnect. That can affect integration/history and requires Lisa/founder/provider approval and a continuity plan; it is not executed here and not an automatic rollback.

## D. Outstanding blockers and owners

| Blocker | Owner |
|---|---|
| Number-specific coexistence eligibility, retained assets and transport contract | Meta / authorized provider |
| Provider selection, costs/terms and any asset-access grant | Founder |
| iPhone backup/consent, actual linking and companion-device recovery | Lisa |
| Access Verification warning interpretation before 14 December | Meta; founder approves any response |
| Any provider-specific adapter if direct Meta contract/signature is not available | Codex, after provider evidence |
| PR review and authorized release of this tested code | Founder; Codex executes only when approved |
| Actual webhook subscription/callback handshake and real inbound UAT | Founder authorizes; Codex/provider performs |
| Complete real history import/contact sync, media retrieval, lifecycle/progress monitoring | Not certified here; provider/Codex scope must be agreed |
| Future internal template, billing, consent and cutoff configuration | Separate founder/Meta activation sprint; not required for inbound-only text |

## E. GO / NO-GO

**GO — local implementation and synthetic inbound/Inbox validation.** The direct Meta receiver is prepared for documented conversation events, with isolated regression evidence and both outgoing channels disabled.

**NO-GO — current Production inbound-only UAT.** Minimum sequence: written coexistence/transport precheck → approved release → Lisa-authorized onboarding retaining Business App → authorized messages/routing configuration → one authorized synthetic inbound test. Real eligibility, operational coexistence and end-to-end signed delivery remain unproven. This PR is not permission to connect the number or change Production.
