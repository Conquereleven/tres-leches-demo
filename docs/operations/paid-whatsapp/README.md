# Paid-order WhatsApp manager alert

Status: code prepared for review. **Outbound remains disabled; Meta activation blocked.** No live message, registration, template creation, production variable change or deployment performed.

## Existing flow and safety contract

Reuse `CommerceService.applyCheckout → recordOrderPaid → operationsNotifications → dispatchOperationsNotifications → MetaWhatsAppProvider`. Authoritative reconciliation remains the sole payment authority. The payment/order transition code is unchanged. The recorder also refuses anything except the matching, reconciled payment on a newly Confirmed order. Existing per-order event key remains durable.

Four immutable template values are stored in the existing outbox at confirmation: reference, paid AED amount, delivery/community or pickup/date/time summary, and HTTPS Operations URL. The URL contains only the internal order ID; no session, bearer token or public checkout capability. Existing staff login and RBAC protect Operations.

Runtime dispatch allows only `WHATSAPP_MANAGER_PHONE`, normalized E.164. Existing legacy Liza rows remain in the outbox for compatibility but are not a runtime recipient fallback. Duplicate recipients are collapsed; a source number cannot receive its own alert. Missing/invalid manager, sender alias, template or cutoff cannot enable dispatch.

`OPERATIONS_WHATSAPP_ACTIVATION_SINCE` is a fixed approved UTC timestamp, never inferred from boot. Both frozen `paidAt` and outbox creation must be strictly later. Old rows without frozen `paidAt` cannot qualify. A 15-minute maximum row age prevents delayed backlog release, including after an outage. Ineligible rows become `suppressed` without provider calls. Without outbound/notifier/cutoff, dispatch is inert. No historical backfill or migration occurs.

Claim `sending` is committed before the call. A crash leaves the row claimed for manual review; it never becomes eligible again. Provider acceptance stores ID, `acceptedAt` and compatibility `sentAt` with status `sent` (accepted, not proof of delivery). Signed Meta status callbacks use the existing idempotent inbound transaction and update `delivered` / `read` / `failed`, without regressing delivered/read to failure or modifying orders. Unknown/early receipts follow existing inbound retry behavior. A failure or timeout is terminal for automatic dispatch: **no blind retry**. Reconcile provider evidence manually; this PR introduces no reset/resend endpoint.

Before every actual alert the existing adapter makes GET-only checks: selected WABA contains exact phone-number ID, actual display phone matches configured phone, `code_verification_status=VERIFIED`, `platform_type=CLOUD_API`, `status=CONNECTED`; exact template name/language is `APPROVED`, `UTILITY`, with the single BODY below. Missing/unsupported fields, auth failures, unexpected components or changed text fail closed. Pagination beyond the first 100 is conservative: if required entries are absent, no send. These reads do not prove the token has messaging scope; explicit verified permission sign-off is also required.

## Template draft — NOT claimed Meta-approved

Suggested name: `three_l_paid_order_ops_v1`. Language: `en_US`. Proposed category: `UTILITY`. Internal transaction notification, no promotions. Meta determines admissibility/category; if reclassified or rejected, do not activate. Manager consent to receive WhatsApp operations alerts must be confirmed. No template was submitted by this work.

Exact BODY (same constant used by remote validation):

> New paid order {{1}}. Total paid: AED {{2}}. Fulfillment: {{3}}. View in Operations (staff login required): {{4}}.

Body examples, synthetic only:

```json
{
  "name": "three_l_paid_order_ops_v1",
  "language": "en_US",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "New paid order {{1}}. Total paid: AED {{2}}. Fulfillment: {{3}}. View in Operations (staff login required): {{4}}.",
      "example": {
        "body_text": [
          [
            "#001",
            "108.00",
            "PICKUP at 3L Pastelerías; When: 2026-10-15, 4 PM",
            "https://www.3ldubai.ae/operations/orders?order=synthetic"
          ]
        ]
      }
    }
  ]
}
```

Four positional BODY text parameters, consecutive placeholders, fixed meaningful text before/after variables, no header/button dependencies. Exact content and language are compared with Meta, rather than trusting a locally labelled “approved” flag. Sources: [Meta template retrieval](https://www.postman.com/meta/whatsapp-business-platform/request/f7o759z/fetch-message-templates), [Meta Cloud API reference](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api), [Meta template documentation](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview). Direct developer documentation retrieval was rate-limited during this task; remote approval validation is still pending, not certified from those unavailable pages.

## Precise activation gaps

Same-day read-only business audit found portfolio `196774801535754`, app `979058461878284` Live, business verification Incomplete and access verification blocked. The portfolio's WhatsApp Business App asset `926440084538581` was owned correctly, but +971 58 594 3319 was **Disconnected**. That is not evidence of registered Cloud API sender availability. No number/ownership change is proposed or performed here. These findings are from the recovery audit; no runtime secrets were inspected and no live Graph permission probe was made in this implementation task.

Before approval to activate, obtain/confirm:

- Business verification recovery and actual access eligibility; do not interpret app Live/WABA Approved as completed business verification.
- Chosen existing Cloud sender's actual `phone_number_id`, WABA ID, E.164 and alias. Populate the existing private `META_NUMBERS_JSON`; this PR never invents IDs or picks the first number. Confirm existing registration/coexistence and CONNECTED status externally, without changing numbers in this sprint.
- Valid server-side `META_ACCESS_TOKEN` assigned to that WABA/phone with `whatsapp_business_messaging` (sending) and `whatsapp_business_management` (phone/template reads); confirm granted scopes, expiry and business/system-user asset permissions. `business_management` only if needed for separate portfolio discovery; do not expand privileges automatically. Actual messaging permission is **not** proven by management GET access.
- `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_GRAPH_VERSION` and correct app/WABA webhook subscription to `messages`, so signed status receipts reach existing `/api/webhooks/whatsapp`. Retain current webhook/signature configuration; no changes here.
- Exact template approval, category and locale with the BODY above. Manager E.164, consent and separation from source.
- Canonical HTTPS `APP_ORIGIN`; existing Operations authentication/users/RBAC. No credentials in message URL.
- Explicit approved activation timestamp and separate sending authorization. Private env: `WHATSAPP_MANAGER_PHONE`, `OPERATIONS_WHATSAPP_SOURCE_ID`, `OPERATIONS_WHATSAPP_TEMPLATE_JSON`, `OPERATIONS_WHATSAPP_ACTIVATION_SINCE`, `OPERATIONS_WHATSAPP_SEND_PERMISSION_CONFIRMED`. Keep `META_OUTBOUND_ENABLED=false` and permission-confirmed false until all evidence is reviewed.

Setting global Meta outbound may also enable other existing customer-conversation/AI workers. Review those independently before any global activation; this PR does not change them. Only then approve a controlled live synthetic paid-order UAT as a separate action; never revive historical rows. Rollback is disabling outbound/permission sign-off, leaving rows intact for review (no resend/reset).

## PR #19 coordination contract

Initial baseline: `04526fe69a5ec61134622ac5bca5c6b1f03d2357`. PR #19 merged during this task; final baseline is `5aaa33dba3483061d9688fabdf0fee9203d3c833`. Reviewed PR #19 exact head `0f31eb77c48197b962949fe77e47796ff45597b2`, branch `fix/3l-order-address-paid-email`. No edits to its original branch/worktree, email adapter, internal-email outbox or delivery-address rules. After #19 merged, only the WhatsApp notification status labels in the shared workspace were extended.

Shared files: `.env.example`, `server/domain/model.ts`, `server/domain/service.ts`, `server/http.ts`, `tests/commerce/order-experience.test.ts`. Preserve both additions during integration: #19's internal email recording alongside the existing paid WhatsApp hook; #19's worker email dispatch alongside this dispatch's cutoff/source/recipient options; distinct outbox types/config. This branch changes only the WhatsApp status branch in `service.ts`, **not** the payment-confirmed block that #19 extends. Tests add HTTPS fixture origin and explicit cutoff to existing WhatsApp send scenarios; keep #19 test cases. This isolated branch was rebased onto main after #19 merged elsewhere. Conflicts in the environment example and service imports were resolved by retaining both channels; other shared files auto-merged. Original PR branches were not modified.

Workspace labels now distinguish delivered, read, suppressed and sending/review without changing operational order states or #19 internal-email rendering. EN/TL resources contain the three new notification labels.
