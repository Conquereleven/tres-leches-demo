# 3L-META-003 — Direct Cloud API readiness and activation plan

Audit date: 16 October 2026 (Asia/Dubai). Decision: **direct Meta only**. No onboarding, Graph mutation, registration, token generation, subscription change, real message, Production write or deployment performed. Existing sender gates remain off. This plan authorizes nothing by itself.

## Current verdict

**GO: review PR #35's direct receiver and local regressions. NO-GO: link this Business App number or activate outbound today.** Business verification is complete; coexistence eligibility/launcher entitlement is not proven. Lisa's iPhone alone cannot resolve those Meta-side gates.

The code uses the existing direct Graph adapter and durable inbound outbox/worker; there is no permanent third-party dashboard or messaging provider dependency. Native Meta usage charges may still apply: direct integration does not mean free Cloud API messages. No third-party subscription is needed or proposed.

## Fresh evidence (not historical assumptions)

Graph v26.0 read-only audit: `2026-10-16T08:59:05Z` (12:59 Dubai). Authenticated Developers screens inspected the same day. Sanitized evidence is retained in the task's `artifacts/meta-direct-2026-10-16/`; no bearer token, app secret, verification token or customer data is included.

| Question | Confirmed finding | Meaning / remaining uncertainty |
|---|---|---|
| Business | Developers Verification shows portfolio `196774801535754`, 3L Pastelerías Dubai, **Verificado** | Registered entity supplied by founder is GOLOSITALIA FZCO; display name is not a new legal-entity audit |
| Application | `979058461878284`, 3L Pastelerías Dubai, **Publicada** | Live status alone is not coexistence permission |
| WABA/account | `926440084538581`, Pasteleria3LDubai, `account_review_status=APPROVED`, `business_verification_status=verified` | Existing account retained; do not create/transfer another WABA |
| Number | `767195727350479`, +971 58 594 3319, `is_on_biz_app=true` | `ON_PREMISE / DISCONNECTED / NOT_VERIFIED`, quality UNKNOWN. Not Cloud-connected; not proof of ineligibility; eSIM is not a documented blocker |
| Token | Valid SYSTEM_USER for the correct app; effective `whatsapp_business_management`, `whatsapp_business_messaging`, `public_profile` | Token scopes are not proof of Advanced Access approval or v4 launch entitlement; expiry=0 does not make it irrevocable |
| Portfolio Graph read | GET business verification fields returned HTTP403/code200 | Missing portfolio inventory permission on this token; UI verifies business. Do not claim this means business verification failed |
| App ↔ WABA | Existing subscribed app is the correct app | Do not create a duplicate relationship |
| Callback | Active Graph subscription to `whatsapp_business_account`, callback `https://tres-leches-pasteleria-demo-production.up.railway.app/api/webhooks/whatsapp` | App subscription exists, but per-field switches are off |
| Fields | Developers UI: `messages`, `history`, `smb_app_state_sync`, `smb_message_echoes`, `account_update` all **No suscritos**, v26.0 | Real inbound cannot be certified until separately authorized subscriptions and UAT |
| Facebook Login for Business | Configurations screen offers Create configuration / Create from template; no existing configuration row | No usable existing v4 CONFIG_ID observed; creation/SDK authorization not executed |
| App Review | **No enviada**, with an existing draft; WhatsApp permission rows say **Listo para la prueba** | Advanced Access approval not evidenced. Do not submit/delete/expand unrelated draft permissions |
| Official Embedded Signup Manager | **v4** and session information **3** are visibly available; login/Meta-hosted test disabled without a configuration. UI explicitly says Production hosting requires **App Review and Access Verification**; integrity is authorized | Official v4 exists in this app, but is not currently usable for Production coexistence. No launch attempted |
| Access Verification | Current detail screen asks to verify 3L as a Tech Provider, blank form, deadline **15/12/2026** | This is today's displayed date, superseding older captured dates. It describes service to other businesses; relevance to own-business use needs written Meta clarification; do not misdescribe GOLOSITALIA or use CornerTech's identity |
| Templates | WABA GET returned no templates | Approved manager alert template still absent; not a prerequisite for receiving a customer text |
| Safety | META_OUTBOUND_ENABLED, OPERATIONS_WHATSAPP_ENABLED, AI_ENABLED, AI_AUTONOMOUS_ALLOWED all false | No change made. Only WA1 mapped; WA2/WA3 identifiers were not invented |

## What official Meta documentation proves

1. [Business App coexistence onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/) (updated 26 June 2026, inspected authenticated): launcher must be a Solution Partner or Tech Provider, with Embedded Signup/session logging and compatible webhook processing. Existing Business App minimum 2.24.17. The converted account retains the same account ID and portfolio. Number-specific eligibility is determined by Meta's flow, not the generic Graph fields we can read today.
2. [Embedded Signup v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4) (updated 3 September 2026): v2/v3 deprecated 15 October 2026; a new Facebook Login for Business configuration selects the Embedded Signup variation/Cloud API product and its CONFIG_ID. Cloud API v4 configuration requires Advanced Access to `whatsapp_business_management` and `whatsapp_business_messaging`. Coexistence remains selected with `featureType: "whatsapp_business_app_onboarding"` in the documented SDK extras. The app's official manager currently displays Embedded Signup v4 and session information3 separately; its generated Meta-hosted landing URL includes v4 extras. Use the actual approved configuration/generated flow, not a stale v2/v3 link or invented configuration values.
3. [WhatsApp App Review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review/) (updated 16 June 2026): own-developer/own-business API use does not generally require App Review/Advanced Access; third-party business access does. This exemption for ordinary own-asset API use does **not** document an exception to the coexistence launch role/v4 configuration requirements above.

**Unresolved, not assumed:** whether Meta can enable a direct own-business coexistence path for this existing 3L app without provider-role onboarding. No documented own-business exception or usable enabled configuration was found. We must obtain that answer from Meta before promising a linking appointment. Do not conclude CornerTech's future approval is mandatory for 3L's ordinary own-WABA API; those are different uses and legal entities.

## Exact missing approvals/configuration

- Meta confirmation of the permitted **own-business coexistence launcher route for GOLOSITALIA FZCO / existing 3L app**. If the documented v4 route applies, its role entitlement and both WhatsApp Advanced Access permissions must be available on the actual launching app. Do not claim the current standard token proves this.
- A real v4 Facebook Login for Business configuration/CONFIG_ID scoped to the agreed direct route. The official manager explicitly blocks Production Embedded Signup until App Review and Access Verification are complete; its login and hosted test buttons are currently disabled. If the own-business exemption is applicable, Meta must confirm how to enable that route. Nothing created today.
- Written resolution of the 3L Access Verification notice for own-business use. If Meta requires an application, complete it truthfully for the relevant legal entity only. CornerTech's registration remains separate; no identity substitution or ownership transfer.
- Meta number-specific coexistence eligibility and authorized Lisa consent, unavailable from read-only Graph today. No QR/code flow was launched to test it.
- Separately approved receiver release, field subscriptions, and real signed inbound UAT. No direct webhook has been observed from this still-disconnected number during this audit.
- Later outbound-only gates: connected Cloud sender proof, approved template/category/language/parameters, billing/payment method confirmation, manager recipient consent, fixed activation cutoff and outbox review. Existing paid-order notification safeguards remain mandatory. No historical replay or blind retries.

Do not request unrelated permissions such as ads/email merely because they appear in an existing review draft. `business_management` may be needed for a separately agreed portfolio inventory/onboarding path, but its absent scope is not proof that own-number messaging requires it.

## Prepared official workflow — do not execute without approval

### Before Lisa's appointment

1. Ask Meta the own-business route question below under **WABiz: Onboarding → Embedded Signup - Coexistence Onboarding** (or TechProvider: Onboarding only if Meta confirms that actually applies to the launching legal entity). This task prepares the message; it does not send it.
2. Resolve entitlement/Advanced Access/configuration requirements for the actual app. If Meta says own-business direct coexistence is unavailable, stop and report that exact restriction; do not substitute a BSP, create a new business, or register the number conventionally.
3. After separate founder authorization: review/merge/deploy PR #35 with a verified backup/healthcheck and rollback; keep every outbound flag false. Existing Production code does not yet include this receiver extension.
4. After separate authorization: enable only documented fields `messages`, `history`, `smb_app_state_sync`, `smb_message_echoes`, `account_update` on the existing callback. Validate raw-byte signature/challenge privately; preserve existing WABA subscription. Do not use the unrelated `message_echoes` field as a substitute for `smb_message_echoes`.
5. Prefer the official Meta-hosted landing generated in the existing app's Embedded Signup Manager after its gates/configuration are resolved; no external dashboard or custom public launcher is required to start that official route. Select v4, session information3 and the documented Business App coexistence feature only after authorization. Preserve the real CONFIG_ID, authenticated admin and exact existing portfolio/account; verify the generated flow supports coexistence before opening it. If an embedded SDK launcher is required instead, review trusted-origin checks, session logging and one-time server-side code handling before exposing it. A success event is `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`; record its actual waba_id, then read the actual account/phone IDs. Do not assume every success event includes a phone ID. Do not expose a generic token exchange endpoint now while entitlement is unresolved.
6. Agree continuity: linked-device inventory, staff maintenance window, backups/privacy/history choice, expected Meta usage charges, support path and cancellation point. Same WABA/account retention is documented; verify returned IDs before accepting any asset change.

### What Lisa specifically must do on her primary iPhone

7. Confirm Business App is current (at least 2.24.17), owns this exact line and opens normally. Keep the app installed/logged in. Confirm iCloud/chat backup and understand companion-device impact; eSIM need not be replaced based on current evidence.
8. During the separately authorized official coexistence session, approve Meta's Business App linking/code/QR prompt on the primary iPhone and explicitly choose whether to share contacts/history. Stop at unexpected registration, terms, access, cost, replacement-account or transfer prompts. Never delete the WhatsApp account, uninstall the app or invoke `/register` to bypass coexistence.
9. Keep Business App open during agreed sync; verify original chats and normal phone operation, then relink supported companion devices. Meta documents initial unlinking of all companions; Windows/WearOS are unsupported for coexistence in the reviewed documentation. Groups are not Cloud history mirrors. Disappearing/view-once/live-location features and broadcasts have documented restrictions; discuss these with Lisa before consent.

### After an authorized successful connection

10. Use read-only Graph to confirm the actual retained IDs, Business App flag and connected Cloud state. A success modal is insufficient. Do not force ordinary registration to satisfy a preflight.
11. If consented, explicitly request `smb_app_state_sync` and `history` through documented `/{PHONE_NUMBER_ID}/smb_app_data` **within 24 hours**; each sync type may be requested only once. Persist the returned request_id securely; never retry an ambiguous POST blindly. This is a separately authorized data synchronization, not performed by the receiver automatically. Error2593109 means sharing declined, not successful empty import.
12. Observe native history phases/chunks/IDs and separate media metadata; chunk delivery order is not guaranteed. Do not infer complete history from one progress=100 chunk. Existing receiver supports ingestion and durable retries, but does not implement a full export/progress dashboard, media playback/download or guaranteed complete historical migration. Those are optional follow-up scope, not a prerequisite for inbound text and later manager alerts.
13. Authorize one synthetic customer inbound from a separate test phone, verify actual signature→durable queue→same-source Inbox once with outbound off. Separately authorize a mobile reply/media test if needed. Verify history cannot open the 24-hour window; only a new post-onboarding customer inbound does. Preserve human takeover and AI guards.
14. Stop with sends off. Manager alert template review and activation require separate explicit approval. Meta's own usage pricing applies; no third-party messaging fees are introduced.

## Recovery

Before linking, cancel and leave the Business App untouched. After partial onboarding, retain IDs/error/request evidence, stop further writes and obtain Meta support guidance. Do not invoke `/register`, remove the account, clear durable queues or restore Production SQLite to replay events. Code rollback is a separately authorized release, preserving queued observations. Business App Settings → Account → Business Platform → Disconnect is a consequential offboarding action requiring Lisa/founder approval and a continuity plan, never an automatic rollback.

## Prepared Meta question (English, not sent)

> We operate GOLOSITALIA FZCO's own Tres Leches business. Portfolio196774801535754 is verified; app979058461878284 is Live; existing WABA926440084538581 and phone767195727350479 (+971585943319) must be retained. The number is used in WhatsApp Business App on the owner's primary iPhone; Graph currently shows is_on_biz_app=true, ON_PREMISE, DISCONNECTED, NOT_VERIFIED. We need direct Cloud API coexistence for our own backend, without a BSP or third-party subscription, while preserving Business App operation. Does our existing own-business app have an official direct coexistence onboarding route? Your App Review guide exempts own-business API use from Advanced Access, while the Business App onboarding/v4 guides state launcher-role and Advanced Access requirements. Please identify the exact permission/approval/configuration path for our own legal entity and app, number-specific eligibility checks, retained account IDs, supported-device impacts, and the relevance of our Access Verification notice currently due15December2026. CornerTech's separate future Tech Provider process is not this business's use case. Please do not initiate migration, conventional registration, number removal or new assets. We request written guidance only.

Next executable action: founder-authorized official Meta support clarification of this specific route, citing the existing app manager's explicit App Review/Access Verification Production block and the own-business exemption. Independently, PR #35 can be reviewed; no need to wait for Lisa to inspect code/tests. Do not represent the query as submitted or a case as opened.
