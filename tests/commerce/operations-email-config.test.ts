import test from "node:test";
import assert from "node:assert/strict";
import { operationsEmailConfig } from "../../server/adapters/resend";
import {
  deliveryStreet,
  deliveryBuilding,
} from "../../server/domain/delivery-address-input";
import {
  dispatchCustomerNotifications,
  recoverInterruptedCustomerNotifications,
  CUSTOMER_EMAIL_MAX_AGE_MS,
} from "../../server/domain/customer-notifications";
import { Store } from "../../server/db/store";
test("internal email requires explicit enable, private recipients and sender; no invented recipient", () => {
  assert.equal(operationsEmailConfig({}), null);
  assert.throws(() =>
    operationsEmailConfig({ OPERATIONS_EMAIL_ENABLED: "true" }),
  );
  const env = {
    OPERATIONS_EMAIL_ENABLED: "true",
    OPERATIONS_EMAIL_TO: "ops@example.invalid, ops@example.invalid",
    RESEND_API_KEY: "fixture-only-key",
    CUSTOMER_EMAIL_FROM: "3L <sender@example.invalid>",
  };
  assert.deepEqual(operationsEmailConfig(env)?.recipients, [
    "ops@example.invalid",
  ]);
  assert.throws(() =>
    operationsEmailConfig({ ...env, OPERATIONS_EMAIL_TO: "invalid" }),
  );
  assert.deepEqual(operationsEmailConfig(env)?.compactRecipients, []);
  assert.deepEqual(
    operationsEmailConfig({
      ...env,
      OPERATIONS_EMAIL_COMPACT_TO: "ops@example.invalid",
    })?.compactRecipients,
    ["ops@example.invalid"],
  );
  assert.throws(() =>
    operationsEmailConfig({
      ...env,
      OPERATIONS_EMAIL_COMPACT_TO: "not-in-operations@example.invalid",
    }),
  );
  assert.throws(() =>
    operationsEmailConfig({ ...env, OPERATIONS_EMAIL_COMPACT_TO: "invalid" }),
  );
});
test("manual complete address accepted independently of verification; absent or placeholder fields rejected", () => {
  assert.equal(deliveryStreet.parse("  Amsa 2  "), "Amsa 2");
  assert.equal(deliveryBuilding.parse("Amsa 2"), "Amsa 2");
  for (const v of ["", "     ", "-----"]) {
    assert.equal(deliveryStreet.safeParse(v).success, false);
    assert.equal(deliveryBuilding.safeParse(v).success, false);
  }
});
test("internal email dispatcher expires old pending events and refuses ambiguous restart resend", async () => {
  const store = new Store(":memory:", "test");
  let sends = 0;
  const provider = {
    name: "fixture",
    async send() {
      sends++;
      return { messageId: "fixture" };
    },
  };
  try {
    store.write((s) => {
      s.operationsEmailNotifications = [
        {
          id: "old",
          event: "ORDER_PAID",
          paymentId: "fixture",
          channel: "email",
          orderId: "fixture",
          recipient: "ops@example.invalid",
          subject: "fixture",
          body: "fixture",
          status: "pending",
          attemptCount: 0,
          createdAt: new Date(
            Date.now() - CUSTOMER_EMAIL_MAX_AGE_MS - 1000,
          ).toISOString(),
        },
        {
          id: "interrupted",
          event: "ORDER_PAID",
          paymentId: "fixture",
          channel: "email",
          orderId: "fixture",
          recipient: "ops@example.invalid",
          subject: "fixture",
          body: "fixture",
          status: "sending",
          attemptCount: 1,
          createdAt: new Date().toISOString(),
        },
      ];
    });
    recoverInterruptedCustomerNotifications(
      store,
      "operationsEmailNotifications",
    );
    await dispatchCustomerNotifications(
      store,
      provider,
      "operationsEmailNotifications",
    );
    assert.equal(sends, 0);
    assert.ok(
      store
        .read()
        .operationsEmailNotifications!.every((n) => n.status === "failed"),
    );
    assert.deepEqual(store.read().customerNotifications, undefined);
  } finally {
    store.close();
  }
});
