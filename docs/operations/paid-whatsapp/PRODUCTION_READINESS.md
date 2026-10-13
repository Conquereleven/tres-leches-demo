# Meta / Railway production readiness audit

13 October 2026, Asia/Dubai. Authenticated Meta dashboards and read-only Railway metadata. No edits, registrations, migrations, templates submitted, tokens generated/revoked, messages or deployment. No secret value read from Railway (OAuth returned names only).

## Actual Meta findings

| Area                             | Evidence / actual state                                                                                                                                   | Limit or remaining action                                                                                                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App 979058461878284              | Developers navigation: Published / Live                                                                                                                   | Publication is not proof of Cloud send permission.                                                                                                                                                                              |
| Portfolio 196774801535754        | Developers Verification and WABA summary show **Verified**                                                                                                | Security Center initially displayed an older In Review state; current two independent views show verified. No resubmission performed.                                                                                           |
| Access verification              | Details offer Start verification and show deadline **12/12/2026**                                                                                         | Not completed in inspected view. Confirm applicability for this own-business integration; do not represent bakery as a technology provider without evidence.                                                                    |
| App Review                       | Requests: **Not submitted**; messaging, management and other permissions listed in draft                                                                  | Nothing submitted here.                                                                                                                                                                                                         |
| `whatsapp_business_messaging`    | Permissions table: Ready for testing, API calls 0                                                                                                         | Production grant/effective token scope not established.                                                                                                                                                                         |
| `whatsapp_business_management`   | Ready for testing, API calls 1                                                                                                                            | One read does not prove production sending.                                                                                                                                                                                     |
| `business_management`            | Ready for testing, API calls 0                                                                                                                            | Not needed for the alert send itself; avoid unnecessary permission expansion.                                                                                                                                                   |
| Visible WABA / messaging account | Only `Pasteleria 3L Dubai`, **926440084538581**, owned by the requested portfolio; labelled WhatsApp Business App, account Approved and business Verified | Manager account selector and portfolio inventory expose only this account. Do not infer other two staff numbers do not exist elsewhere.                                                                                         |
| Visible phone                    | **+971 58 594 3319**, `phone_number_id` **767195727350479**, name Pasteleria 3L Dubai                                                                     | WhatsApp Manager shows **Connected**; Business Settings phone tab shows **Disconnected**. Neither label alone proves registered `CLOUD_API` or safe coexistence. Profile is Business App with editing disabled.                 |
| Other two operational numbers    | Not present in inspected account/selector                                                                                                                 | Need existing account/phone IDs and states for them; do not add/migrate/register substitutes.                                                                                                                                   |
| System user                      | Conversions API System User, Employee role; app installed; partial app access (develop/view/test); full access to existing WhatsApp account               | No token value/expiry/scope list exposed in inspected tabs. Generate/Revoke actions were not used. Need secure inspection of existing token metadata.                                                                           |
| Message templates                | Current Business App Manager exposes no template list; no approved suitable template verifiable                                                           | Candidate prepared only. Category/approval pending, not presumed Utility.                                                                                                                                                       |
| Webhook callback                 | Existing Developers URL: `https://tres-leches-pasteleria-demo-production.up.railway.app/api/webhooks/whatsapp`                                            | Requested canonical URL: `https://www.3ldubai.ae/api/webhooks/whatsapp`. Confirm routing before separately approved change.                                                                                                     |
| Webhook subscription             | `messages`: **Not subscribed**; selected subscription version **v26.0**                                                                                   | Required for inbound/status receipts. Template status/category/quality update fields also not subscribed. App→WABA subscribed-app relationship not independently verified. No toggles changed or provider test buttons clicked. |
| API version                      | Dashboard webhook selectors v26.0; Railway `META_GRAPH_VERSION` variable exists, value redacted                                                           | Cannot claim runtime version equals UI version. Confirm existing configured version privately; adapter supports explicit `vN.0`.                                                                                                |

Sources inspected: [Developers verification](https://developers.facebook.com/apps/979058461878284/verification/?business_id=196774801535754), app WhatsApp use-case Permissions/Features and production configuration, [Access verification](https://developers.facebook.com/196774801535754/access-verification/), [Portfolio WhatsApp accounts](https://business.facebook.com/latest/settings/whatsapp_account?business_id=196774801535754), [WhatsApp Manager](https://business.facebook.com/latest/whatsapp_manager/phone_numbers/?business_id=196774801535754&asset_id=926440084538581), portfolio System Users.

**Sender decision:** existing number above is a candidate, not an authorized Cloud sender. No evidence yet that it can send API alerts while preserving staff's Business App behavior. Require exact registered Cloud platform/connection, consent/permissions and coexistence evidence. No change to any of the three staff numbers is part of this PR.

## Webhook and HTTPS audit

Canonical public HTTPS endpoint answered **403** to a GET verification challenge with no verify token. Request used only `hub.mode=subscribe` and a synthetic challenge. This confirms TLS/routing and rejection, not valid secret matching or a signed production delivery.

Source and local tests: GET returns exact challenge only for matching configured token; POST verifies `X-Hub-Signature-256` using App Secret, HMAC-SHA256 hexadecimal `sha256=` signature and original raw bytes before JSON parsing. The new HTTP fixture exercises matching challenge, altered bytes rejected 401, signed status accepted 200, duplicate receipt and unchanged synthetic order/payment state. Existing authentication tests remain intact. No real webhook payload or paid order was used.

Live signed delivery, effective token grants, actual `platform_type`, expiry and app/WABA subscription remain unproven. Do not enable sending based on this GET smoke or business approval alone.

## Railway: exact variable-name inventory

Project `1f9a94c1-0574-49a9-b579-bf6af3aad601`, service `fe8c1417-39ca-4038-b94e-68659ab1c659`, environment **production** `142de30a-4879-4d04-85b9-12e79aa51bda`. Read-only connector returned `valuesRedacted=true`.

Present names: `APP_ORIGIN`, `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_GRAPH_VERSION`, `META_NUMBERS_JSON`, `META_OUTBOUND_ENABLED`, `META_VERIFY_TOKEN`; Resend/internal email names include `RESEND_API_KEY`, `OPERATIONS_EMAIL_ENABLED`, `OPERATIONS_EMAIL_FROM`, `OPERATIONS_EMAIL_TO`. Presence does not certify values, expiry, scopes or activation; no changes made.

**Absent internal variable names:**

- `WHATSAPP_MANAGER_PHONE`
- `OPERATIONS_WHATSAPP_ENABLED`
- `OPERATIONS_WHATSAPP_PHONE_NUMBER_ID`
- `OPERATIONS_WHATSAPP_ACTIVATION_SINCE`
- `OPERATIONS_WHATSAPP_SEND_PERMISSION_CONFIRMED`
- `OPERATIONS_WHATSAPP_TEMPLATE_POLICY_CONFIRMED`
- `OPERATIONS_WHATSAPP_TEMPLATE_JSON`

No separate `META_APP_ID` or `META_WABA_ID` runtime variable is required by this alert code: WABA comes from the existing explicit `META_NUMBERS_JSON` mapping. Do not add duplicate invented configuration. Runtime IDs must be cross-checked with the account found, not inferred from an alias. Do not recreate or overwrite existing secrets. Configure only through private Railway settings after approval; values never belong in code, PR, logs or chat.

## Before one real authorized test

1. Obtain secure actual token/asset metadata, registered Cloud/coexistence proof and clarification of conflicting connection labels. Resolve actual permissions/review requirements.
2. Confirm template category/suitability for a staff recipient (not automatically a customer's transaction), founder content/category and recipient opt-in. Then separately authorize submission and wait for Meta approval. Candidate and policy sources: [README](./README.md).
3. Separately approve required subscription/callback corrections and verify a signed receipt reaches the intended deployed backend.
4. Review/merge/deploy PR #20 only with separate approval. Privately configure missing fields with internal flag false; leave customer `META_OUTBOUND_ENABLED=false`. Verify Resend unchanged.
5. Founder supplies/approves exact cutoff and expressly authorizes internal activation and **one** new synthetic real alert. No historic paid order replay or actual payment charge is authorized here. Observe API acceptance and subsequent signed delivery; uncertain outcome goes to manual review, never resend blindly.

**Verdict: implementation can proceed locally; live internal activation still blocked by the concrete items above. Business verification is now approved, not the current blocker.**
