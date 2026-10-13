import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../server/db/store";
import {
  recordOrderPaid,
  dispatchOperationsNotifications,
  operationsRecipients,
  applyOperationsReceipt,
  createWhatsAppOperationsNotifier,
  PAID_ALERT_BODY,
  parseNotificationCutoff,
} from "../../server/domain/notifications";
import { MetaWhatsAppProvider } from "../../server/adapters/meta";
import type { Order, Payment } from "../../server/domain/model";
const at = new Date(Date.now() - 1000).toISOString();
const cutoff = new Date(Date.now() - 60000).toISOString();
function fixture() {
  const store = new Store(":memory:", "test");
  store.write((s) => {
    const order = {
      id: "synthetic",
      conversationId: "fixture",
      state: "Confirmed",
      version: 0,
      lines: [],
      quote: null,
      audit: [],
      paymentId: "p",
      paidAt: at,
      fulfillmentMethod: "pickup",
      pickup: { pickupDate: "2026-10-15", preferredTime: "4 PM" },
    } as Order;
    const payment = {
      id: "p",
      orderId: order.id,
      status: "paid",
      amountFils: 10800,
      paidAt: at,
      lastReconciledAt: at,
    } as Payment;
    s.orders.push(order);
    s.payments.push(payment);
    recordOrderPaid(s, order, payment, "https://3l.example", "+971500000001");
    recordOrderPaid(s, order, payment, "https://3l.example", "+971500000001");
  });
  return store;
}
const spy = (sent: string[]) => ({
  send: async (n: { id: string }) => {
    sent.push(n.id);
    return { providerId: `wamid-${n.id}` };
  },
});
test("recipient normalization deduplicates and malformed cutoff fails", () => {
  assert.equal(operationsRecipients("+971 50 000 0001").length, 1);
  assert.throws(() => parseNotificationCutoff("yesterday"));
});
test("disabled/missing cutoff never calls a provider; historical rows are suppressed", async () => {
  const store = fixture(),
    sent: string[] = [];
  try {
    await dispatchOperationsNotifications(store, {
      outboundEnabled: false,
      notifier: spy(sent),
      activationSince: cutoff,
    });
    await dispatchOperationsNotifications(store, {
      outboundEnabled: true,
      notifier: spy(sent),
    });
    assert.equal(sent.length, 0);
    await dispatchOperationsNotifications(store, {
      outboundEnabled: true,
      notifier: spy(sent),
      activationSince: at,
    });
    assert.equal(sent.length, 0);
    assert.ok(
      store
        .read()
        .operationsNotifications!.every(
          (n) => n.status === "suppressed" && n.attempts === 0,
        ),
    );
  } finally {
    store.close();
  }
});
test("concurrent dispatch is once-only; template has frozen total, pickup and authenticated link", async () => {
  const store = fixture(),
    sent: string[] = [];
  try {
    assert.equal(store.read().operationsNotifications!.length, 1);
    const args = {
      outboundEnabled: true,
      notifier: spy(sent),
      activationSince: cutoff,
      recipientPhones: ["+971500000001"],
    };
    await Promise.all([
      dispatchOperationsNotifications(store, args),
      dispatchOperationsNotifications(store, args),
    ]);
    assert.equal(sent.length, 1);
    const row = store
      .read()
      .operationsNotifications!.find((n) => n.status === "accepted")!;
    assert.deepEqual(row.templateParameters, [
      "synthetic",
      "108.00",
      "PICKUP at 3L Pastelerías; When: 2026-10-15, 4 PM",
      "https://3l.example/operations/orders?order=synthetic",
    ]);
    store.write((s) => {
      applyOperationsReceipt(s, row.providerId!, "delivered");
      applyOperationsReceipt(s, row.providerId!, "failed");
      applyOperationsReceipt(s, row.providerId!, "sent");
    });
    assert.equal(
      store.read().operationsNotifications!.find((n) => n.id === row.id)!
        .status,
      "delivered",
    );
  } finally {
    store.close();
  }
});
test("unreconciled, self recipient, legacy row and interrupted sends never dispatch", async () => {
  for (const reason of ["unreconciled", "self", "legacy", "interrupted"]) {
    const store = fixture(),
      sent: string[] = [];
    try {
      store.write((s) => {
        if (reason === "unreconciled")
          s.payments[0]!.lastReconciledAt = undefined;
        if (reason === "legacy")
          for (const n of s.operationsNotifications!) n.paidAt = undefined;
        if (reason === "interrupted")
          for (const n of s.operationsNotifications!) n.status = "sending";
      });
      await dispatchOperationsNotifications(store, {
        outboundEnabled: true,
        notifier: spy(sent),
        activationSince: cutoff,
        recipientPhones: ["+971500000001"],
        sourcePhone: reason === "self" ? "+971500000001" : undefined,
      });
      assert.equal(sent.length, 0, reason);
    } finally {
      store.close();
    }
  }
});
test("ambiguous failure is not retried", async () => {
  const store = fixture();
  let calls = 0;
  try {
    const options = {
      outboundEnabled: true,
      activationSince: cutoff,
      notifier: {
        send: async () => {
          calls++;
          throw new Error("uncertain");
        },
      },
    };
    await dispatchOperationsNotifications(store, options);
    await dispatchOperationsNotifications(store, options);
    assert.equal(calls, 1);
    assert.ok(
      store.read().operationsNotifications!.every((n) => n.status === "failed"),
    );
  } finally {
    store.close();
  }
});
test("Meta preflight verifies WABA membership, actual phone, Cloud registration and exact approved template; no POST", async () => {
  for (const mismatch of [
    "none",
    "phone",
    "registration",
    "platform",
    "disconnected",
    "category",
    "language",
    "status",
    "body",
  ]) {
    const calls: string[] = [];
    const meta = new MetaWhatsAppProvider(
      {
        token: "synthetic-token",
        version: "v25.0",
        verifyToken: "x".repeat(24),
        numbers: [
          {
            id: "wa1",
            label: "synthetic",
            phone: "+971500000009",
            phoneNumberId: "123",
            wabaId: "456",
          },
        ],
      },
      (async (url, init) => {
        assert.equal(init?.method, "GET");
        calls.push(String(url));
        return Response.json({
          data: String(url).includes("phone_numbers")
            ? [
                {
                  id: "123",
                  display_phone_number:
                    mismatch === "phone" ? "+971500000008" : "+971500000009",
                  code_verification_status:
                    mismatch === "registration" ? "NOT_VERIFIED" : "VERIFIED",
                  platform_type:
                    mismatch === "platform" ? "ON_PREMISE" : "CLOUD_API",
                  status:
                    mismatch === "disconnected" ? "DISCONNECTED" : "CONNECTED",
                },
              ]
            : [
                {
                  name: "order_paid",
                  language: mismatch === "language" ? "es" : "en_US",
                  status: mismatch === "status" ? "PENDING" : "APPROVED",
                  category: mismatch === "category" ? "MARKETING" : "UTILITY",
                  components: [
                    {
                      type: "BODY",
                      text: mismatch === "body" ? "Other" : PAID_ALERT_BODY,
                    },
                  ],
                },
              ],
        });
      }) as typeof fetch,
    );
    if (mismatch === "none")
      await meta.validateOperationsConfiguration(
        "wa1",
        { name: "order_paid", language: "en_US" },
        PAID_ALERT_BODY,
        "UTILITY",
      );
    else
      await assert.rejects(
        meta.validateOperationsConfiguration(
          "wa1",
          { name: "order_paid", language: "en_US" },
          PAID_ALERT_BODY,
          "UTILITY",
        ),
      );
    assert.ok(calls.length >= 1);
  }
});
test("notifier sends all four body parameters through the existing adapter", async () => {
  const store = fixture();
  let parameters: string[] = [];
  try {
    const notifier = createWhatsAppOperationsNotifier(
      {
        send: async (input: { template: { parameters: string[] } }) => {
          parameters = input.template.parameters;
          return { providerId: "accepted" };
        },
      } as never,
      { id: "wa1", phone: "+971500000009" },
      { name: "order_paid", language: "en_US" },
    );
    await dispatchOperationsNotifications(store, {
      outboundEnabled: true,
      activationSince: cutoff,
      notifier,
      recipientPhones: ["+971500000001"],
    });
    assert.equal(parameters.length, 4);
    assert.equal(parameters[1], "108.00");
  } finally {
    store.close();
  }
});

test("receipt webhook is idempotent in the canonical inbound transaction and does not change order state", async () => {
  const { CommerceService } = await import("../../server/domain/service");
  const store = fixture(),
    sent: string[] = [];
  try {
    await dispatchOperationsNotifications(store, {
      outboundEnabled: true,
      notifier: spy(sent),
      activationSince: cutoff,
    });
    const providerId = store.read().operationsNotifications![0]!.providerId!;
    const before = JSON.stringify(store.read().orders);
    const service = new CommerceService(
      store,
      {} as never,
      {} as never,
      {} as never,
    );
    const receipt = {
      type: "status",
      eventId: "receipt-synthetic",
      providerId,
      status: "delivered",
    };
    service.inbound(receipt);
    assert.deepEqual(service.inbound(receipt), { duplicate: true });
    assert.equal(store.read().operationsNotifications![0]!.status, "delivered");
    assert.equal(JSON.stringify(store.read().orders), before);
  } finally {
    store.close();
  }
});
test("an expired post-cutoff backlog cannot dispatch", async () => {
  const store = fixture(),
    sent: string[] = [];
  try {
    store.write((s) => {
      for (const n of s.operationsNotifications!)
        n.createdAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    });
    await dispatchOperationsNotifications(store, {
      outboundEnabled: true,
      activationSince: new Date(Date.now() - 3600000).toISOString(),
      notifier: spy(sent),
    });
    assert.equal(sent.length, 0);
  } finally {
    store.close();
  }
});
test("accepted outbox state survives SQLite restart without resend", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = mkdtempSync(join(tmpdir(), "3l-alert-restart-"));
  const path = join(directory, "state.sqlite");
  const source = fixture();
  let disk = new Store(path, "test");
  const sent: string[] = [];
  try {
    disk.write((s) => Object.assign(s, source.read()));
    source.close();
    const peer = new Store(path, "test");
    try {
      const options = {
        outboundEnabled: true,
        activationSince: cutoff,
        notifier: spy(sent),
      };
      await Promise.all([
        dispatchOperationsNotifications(disk, options),
        dispatchOperationsNotifications(peer, options),
      ]);
    } finally {
      peer.close();
    }
    disk.close();
    disk = new Store(path, "test");
    await dispatchOperationsNotifications(disk, {
      outboundEnabled: true,
      activationSince: cutoff,
      notifier: spy(sent),
    });
    assert.equal(sent.length, 1);
    assert.ok(
      disk
        .read()
        .operationsNotifications!.every((n) => n.providerId && n.acceptedAt),
    );
  } finally {
    disk.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
