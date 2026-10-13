import test from "node:test";
import assert from "node:assert/strict";
import { operationsWhatsAppConfig } from "../../server/domain/operations-whatsapp-config";
import { operationsRecipients } from "../../server/domain/notifications";
const numbers = [
  {
    id: "wa2" as const,
    label: "Synthetic WA2",
    phone: "+971500000009",
    phoneNumberId: "222",
    wabaId: "333",
  },
];
const env = {
  OPERATIONS_WHATSAPP_ENABLED: "true",
  META_OUTBOUND_ENABLED: "false",
  WHATSAPP_MANAGER_PHONE: "+971500000001",
  OPERATIONS_WHATSAPP_PHONE_NUMBER_ID: "222",
  OPERATIONS_WHATSAPP_ACTIVATION_SINCE: "2026-01-01T00:00:00.000Z",
  OPERATIONS_WHATSAPP_SEND_PERMISSION_CONFIRMED: "true",
  OPERATIONS_WHATSAPP_TEMPLATE_POLICY_CONFIRMED: "true",
  OPERATIONS_WHATSAPP_TEMPLATE_JSON: JSON.stringify({
    name: "3l_new_paid_order_alert",
    language: "en_US",
    category: "UTILITY",
  }),
};
test("independent internal gate does not enable or depend on customer messaging", () => {
  const config = operationsWhatsAppConfig(env, numbers, true);
  assert.equal(config.enabled && config.configured, true);
  assert.equal(env.META_OUTBOUND_ENABLED, "false");
  assert.equal(config.sender?.id, "wa2");
  assert.equal(
    operationsWhatsAppConfig(
      {
        ...env,
        OPERATIONS_WHATSAPP_ENABLED: "false",
        META_OUTBOUND_ENABLED: "true",
      },
      numbers,
      true,
    ).enabled,
    false,
  );
});
test("every required field and credential proof fails closed for the channel", () => {
  for (const key of [
    "WHATSAPP_MANAGER_PHONE",
    "OPERATIONS_WHATSAPP_PHONE_NUMBER_ID",
    "OPERATIONS_WHATSAPP_ACTIVATION_SINCE",
    "OPERATIONS_WHATSAPP_SEND_PERMISSION_CONFIRMED",
    "OPERATIONS_WHATSAPP_TEMPLATE_POLICY_CONFIRMED",
    "OPERATIONS_WHATSAPP_TEMPLATE_JSON",
  ]) {
    assert.equal(
      operationsWhatsAppConfig({ ...env, [key]: undefined }, numbers, true)
        .configured,
      false,
      key,
    );
  }
  assert.equal(operationsWhatsAppConfig(env, numbers, false).configured, false);
  assert.equal(
    operationsWhatsAppConfig(
      { ...env, OPERATIONS_WHATSAPP_PHONE_NUMBER_ID: "wa2" },
      numbers,
      true,
    ).configured,
    false,
  );
  assert.equal(
    operationsWhatsAppConfig(
      { ...env, WHATSAPP_MANAGER_PHONE: numbers[0]!.phone },
      numbers,
      true,
    ).configured,
    false,
  );
});
test("bad template/cutoff configuration cannot crash payment or server startup", () => {
  for (const value of [
    "not-json",
    JSON.stringify({ name: "x", language: "es", category: "UTILITY" }),
    JSON.stringify({ name: "x", language: "en_US" }),
    JSON.stringify({
      name: "x",
      language: "en_US",
      category: "AUTHENTICATION",
    }),
  ])
    assert.equal(
      operationsWhatsAppConfig(
        { ...env, OPERATIONS_WHATSAPP_TEMPLATE_JSON: value },
        numbers,
        true,
      ).configured,
      false,
    );
  assert.equal(
    operationsWhatsAppConfig(
      { ...env, OPERATIONS_WHATSAPP_ACTIVATION_SINCE: "invalid" },
      numbers,
      true,
    ).configured,
    false,
  );
  assert.equal(
    operationsWhatsAppConfig(
      {
        ...env,
        OPERATIONS_WHATSAPP_ACTIVATION_SINCE: "2999-01-01T00:00:00.000Z",
      },
      numbers,
      true,
    ).configured,
    false,
  );
});
test("category is explicit and requires separate founder policy sign-off", () => {
  const marketing = {
    ...env,
    OPERATIONS_WHATSAPP_TEMPLATE_JSON: JSON.stringify({
      name: "3l_new_paid_order_alert",
      language: "en_US",
      category: "MARKETING",
    }),
  };
  assert.equal(
    operationsWhatsAppConfig(marketing, numbers, true).template?.category,
    "MARKETING",
  );
  assert.equal(
    operationsWhatsAppConfig(
      { ...marketing, OPERATIONS_WHATSAPP_TEMPLATE_POLICY_CONFIRMED: "false" },
      numbers,
      true,
    ).configured,
    false,
  );
});
test("private recipient only, no implicit Lisa/source recipient or duplicate fallback", () => {
  assert.deepEqual(operationsRecipients(), []);
  assert.deepEqual(operationsRecipients("invalid"), []);
  assert.deepEqual(operationsRecipients("+971 50 000 0001"), [
    { name: "3L Manager", phone: "+971500000001" },
  ]);
});
