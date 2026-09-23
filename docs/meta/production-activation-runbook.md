# Meta WhatsApp production activation

## Verified 3L assets (2026-09-23)

- Business Portfolio: `3L Pastelerías Dubai`
- Portfolio ID shown by Business Settings: `196774801535754`
- WhatsApp Business Account: `Pasteleria 3L Dubai`
- WABA ID: `926440084538581`
- WA1: `+971585943319` (`+971 58 594 3319` in Meta)
- WA1 Phone Number ID: `767195727350479`
- Current Meta status: `Offline / Sin conexión`
- Quality rating: not available while the number is offline
- Apps attached to the portfolio: none at the time of audit
- Existing system user: a Conversions API user has full WABA access, but no app is installed and its token action is unavailable. Prefer a dedicated Commerce OS system user after the app exists.

The previously supplied 16-digit portfolio ID was not authoritative. Business Settings and WhatsApp Manager both use the 15-digit ID above.

## Application contract

The existing callback is:

`https://tres-leches-pasteleria-demo-production.up.railway.app/api/webhooks/whatsapp`

- `GET` implements Meta's verification challenge (`hub.mode=subscribe`, exact verify token and plaintext challenge response).
- `POST` verifies `X-Hub-Signature-256` over the exact raw request bytes with the app secret before JSON parsing.
- Subscribe the WABA to the `messages` field. That field carries inbound messages and message status updates.
- Unknown WABA/Phone Number IDs are rejected. Event IDs are persisted idempotently before acknowledgment.

## Values to obtain from Meta

1. App ID for the single 3L-owned Business app.
2. App Secret for webhook signature verification.
3. A dedicated system-user access token scoped to the app and WABA.
4. The Graph API version offered by the app dashboard at activation time.
5. Verify token generated privately for the callback handshake.
6. WABA and Phone Number IDs verified above.

The token needs `whatsapp_business_messaging` and `whatsapp_business_management`. Add `business_management` only if Meta requires it for the asset-assignment operation being performed.

## Railway production variables

Keep all values in Railway variables, never in source, browser bundles, documentation or logs:

- `META_ACCESS_TOKEN`
- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- `META_GRAPH_VERSION`
- `META_NUMBERS_JSON` with only WA1 initially:

```json
[{"id":"wa1","label":"Pasteleria 3L Dubai","phone":"+971585943319","phoneNumberId":"767195727350479","wabaId":"926440084538581"}]
```

Keep these safety controls unchanged:

- `PROVIDER_MODE=offline`
- `PAYMENNT_ENVIRONMENT=test`
- `META_OUTBOUND_ENABLED=false`
- `AI_ENABLED=false`
- `AI_AGENT_DEFAULT_MODE=copilot`
- `AI_AUTONOMOUS_ALLOWED=false`

The runtime does not require `META_APP_ID` or a separate `META_WABA_ID`; the App ID is retained in Meta/credential inventory and each WABA mapping is explicit inside `META_NUMBERS_JSON`.

## Controlled activation

1. Finish Meta for Developers registration for the authorized 3L administrator.
2. Create one Business app owned by the verified 3L portfolio and add WhatsApp. Do not create a duplicate WABA.
3. Link the existing `Pasteleria 3L Dubai` WABA and confirm the existing number appears.
4. Before registration changes, inspect Meta's onboarding screen for coexistence eligibility. If it says the WhatsApp Business mobile app will be disconnected, stop for explicit owner approval.
5. Create `3L Commerce OS Integration` as the dedicated system user, assign only the app and WABA, and generate the least-privileged token.
6. Set the Railway variables above with outbound still false. Redeploy the existing Production service.
7. Configure the callback and verify token in the app dashboard; subscribe `messages` and verify the challenge succeeds.
8. Run read-only Graph checks for the WABA and Phone Number ID. Record only IDs, display name, registration/messaging status and quality rating.
9. Send one inbound message from a separate test phone. Confirm HTTP 200, one durable event, WA1 routing, one canonical conversation and visibility in `/operations/inbox`. Confirm there is no outbound send.
10. Stop with outbound disabled. A separate explicit approval is required before one manual outbound test.

## WA2 and WA3

Add each only after Meta supplies its real E.164 number, Phone Number ID and WABA ID. Append a unique `wa2` or `wa3` object to `META_NUMBERS_JSON`, validate read-only Graph access, then repeat inbound-only UAT. Never use placeholder identifiers.

## Rollback

Set `META_ACCESS_TOKEN` absent (or remove the Meta group), retain `META_OUTBOUND_ENABLED=false`, and redeploy the existing service. This disables challenge/event processing without deregistering the number, deleting the WABA/app, removing the mobile registration or touching Paymennt. If Meta registration itself changed mobile-app availability, follow Meta's documented coexistence/migration rollback before making any destructive change.
