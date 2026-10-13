# Paid-order WhatsApp manager alert — activation notes

Updated 13 October 2026. Continue existing PR #20; no separate sprint or PR. Code prepared, **internal sending disabled and actual activation blocked**. No Meta/phone/account edits, live messages, production changes, transactions, merge into main or deployment performed.

## Independent activation and private configuration

`OPERATIONS_WHATSAPP_ENABLED=false` controls only the internal notifier. It neither depends on nor changes `META_OUTBOUND_ENABLED`; leave the latter false to keep customer conversations and AI outbound disabled. Both use the existing Meta adapter, with different caller gates. Resend keeps its existing independent configuration/worker/outbox.

`WHATSAPP_MANAGER_PHONE` is the only recipient; absent/malformed means no recipient and no new alert row. Lisa's number is private configuration, never a source-code default. No fallback recipient, duplicate list or automatic first-number selection. `OPERATIONS_WHATSAPP_PHONE_NUMBER_ID` must match an explicit `phoneNumberId` in existing private `META_NUMBERS_JSON`. Recipient equal to sender is refused.

Required internal settings:

- `OPERATIONS_WHATSAPP_ENABLED` — false until separate founder activation approval.
- `WHATSAPP_MANAGER_PHONE` — approved recipient entered privately.
- `OPERATIONS_WHATSAPP_PHONE_NUMBER_ID` — exact existing registered Cloud sender ID, not an alias.
- `OPERATIONS_WHATSAPP_ACTIVATION_SINCE` — fixed founder-approved UTC ISO timestamp. No date is invented or inferred from startup. Choose a new boundary whenever reactivating, so disabled-period rows are not released.
- `OPERATIONS_WHATSAPP_SEND_PERMISSION_CONFIRMED` — false until actual token/asset/sending authorization has been verified.
- `OPERATIONS_WHATSAPP_TEMPLATE_POLICY_CONFIRMED` — false until founder confirms content/category/recipient consent and Meta suitability is established.
- `OPERATIONS_WHATSAPP_TEMPLATE_JSON` — exact approved name, `en_US` language and explicit `category` (`UTILITY` or `MARKETING`). No default category. Example shape uses synthetic approval placeholders only; copy actual Meta-approved metadata after review, never treat the local candidate as approved.

Existing Meta settings remain `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `META_NUMBERS_JSON`; canonical `APP_ORIGIN` supplies the authenticated Operations URL. Do not invent identifiers or recreate sealed variables. Invalid internal template/cutoff disables the channel rather than crashing checkout. Missing Meta credentials cannot produce a notifier.

## Durable safety contract

Reuse `CommerceService.applyCheckout → recordOrderPaid → operationsNotifications → dispatcher → MetaWhatsAppProvider`. No payment/order system rebuild. The existing authoritative new-paid transaction owns the event; recorder also validates reconciled matching payment, `paidAt`, order/payment IDs and Confirmed state. Per-order durable event prevents requeue on duplicate callbacks or later configuration changes.

The outbox freezes four values: reference, paid AED amount, delivery/community or pickup/date/time summary and HTTPS Operations order URL. No credentials/capability in that URL; staff authentication and existing RBAC protect it. No provider or mutable catalog data can alter a frozen alert.

Both frozen payment time and row creation must be strictly after the fixed cutoff. Legacy rows lacking evidence and rows older than 15 minutes are suppressed with zero send calls. Dispatcher rechecks current paid identity and configured recipient/source before claiming. Disabled or incomplete configuration never releases a backlog. No historical migration/backfill/reset endpoint.

Claim `sending` is committed before network activity. Concurrent workers and SQLite connections cannot claim twice. An interrupted/uncertain send is never automatically reset/retried; human provider reconciliation is required. API success stores `providerId`, `acceptedAt`, status `accepted`, **not delivered or sent**. Signed Meta receipts populate sent/delivered/read/failed; delivery/read never regress to failure. Existing idempotent raw-signature inbound transaction owns receipts; unknown/early receipts use the existing inbound retry queue. Receipt/send failure cannot change orders/payments.

Before every alert, GET-only adapter validation checks actual WABA membership, phone ID/display number, verified Cloud platform and CONNECTED state, then exact approved template name/language/category/body. Approval/category mismatch, unsupported components, auth errors and unexpected responses fail closed. The first 100 records are checked conservatively; absence never falls back. Management GET access is not proof of messaging permission: manual token/asset evidence is also required.

## Template candidate — NOT submitted or Meta-approved

Name: `3l_new_paid_order_alert`. Language: `en_US`. Four BODY parameters retain the previously required fulfillment summary; final parameter is the authenticated Operations URL. Exact candidate text lives in `PAID_ALERT_BODY` and [template-candidate.json](./template-candidate.json). Samples are synthetic only. No category is preselected in the candidate.

[WhatsApp's current messaging policy](https://whatsappbusiness.com/policy/) requires recipient permission and approved templates for business-initiated conversations. Its [Utility page](https://whatsappbusiness.com/products/conversation-categories/utility/) describes customer order/account updates, and does not establish that an employee receiving someone else's order qualifies. Therefore **staff Utility suitability is unconfirmed**. Obtain Meta clarification / category decision and founder content/category approval before submitting. Do not silently classify as Utility, switch to Marketing, use free-text outside the window, or infer approval from an example/template name. Authentication templates are not appropriate for this alert. Detailed developer-category guideline retrieval was rate-limited; no undocumented exception is claimed.

The current Business App account UI exposes no template list. No existing approved suitable template was verifiable there. Prepared candidate can be copied into the appropriate existing Cloud WABA form only after authorized Cloud access and content/category sign-off. Do not create a substitute WABA or migrate staff numbers.

## Activation checklist and rollback

1. Review [actual Meta/Railway audit](./PRODUCTION_READINESS.md). Business verification now shows Verified; actual Cloud connection/scopes remain unproven.
2. Resolve the visible Business App/Cloud distinction and contradictory connection labels; prove `platform_type=CLOUD_API`, registered sender and coexistence compatibility if staff continue using the Business App. Do not register/migrate in this task.
3. Verify existing token expiry/scopes and system-user assignments securely. Confirm `whatsapp_business_messaging` and `whatsapp_business_management`; review whether App Review / access verification is necessary for this actual own-business use. No automatic extra permission grants.
4. Get template suitability/category clarification, founder content/category approval, recipient consent and actual Meta APPROVED metadata. No submission occurred here.
5. Approve changes to callback/subscriptions only as a separate action. `messages` must be subscribed and the app subscribed to the chosen WABA. Existing callback is the Railway hostname; canonical desired endpoint is `https://www.3ldubai.ae/api/webhooks/whatsapp`. Both targets need to be confirmed as the intended deployed service before changing anything. Optional template-status/category subscriptions aid monitoring; every send still revalidates actual approval.
6. Privately configure missing internal settings with both activation/permission flags false. Choose the exact founder-approved cutoff at activation. Confirm Graph API version (dashboard subscription v26.0; Railway value is redacted) without changing it speculatively.
7. Obtain separate release/configuration approval and one controlled real-alert approval. Activate only the internal flag, keeping customer `META_OUTBOUND_ENABLED=false`. Use one new synthetic reconciled order; never replay a real paid order/backlog. Check acceptance, signed delivery and duplicate handling; no transaction is authorized by this document.
8. Rollback: `OPERATIONS_WHATSAPP_ENABLED=false` / permission sign-off false. Preserve outbox/provider IDs for manual review; no reset/resend, payment mutation or DB restore. Customer and Resend channels are unaffected.

## Integration coordination

PR #19 head `0f31eb77c48197b962949fe77e47796ff45597b2` merged into main `5aaa33dba3483061d9688fabdf0fee9203d3c833`; internal email remains unchanged. This continuation integrates current main/OMS PR #21 (`cd3c6d9`, full SHA in QA) into the already published branch by normal merge, preserving history without force-push. Locale conflicts combine all OMS entries with notification labels. The old workspace and current OMS detail view both distinguish API acceptance, delivery/read and suppressed/review outcomes. No operational state transitions changed. Original PR branches/worktrees are untouched.
