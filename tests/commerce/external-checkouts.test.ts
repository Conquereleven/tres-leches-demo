import test from "node:test";
import assert from "node:assert/strict";
import { Store, seed } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";

/**
 * One site order awaiting payment (checkout-1), one site payment whose
 * checkout has not been associated yet (payment-2), and a provider that
 * answers per checkout id like the real account does.
 */
function setup() {
  const state = seed();
  const at = new Date().toISOString();
  for (const n of [1, 2]) {
    state.orders.push({
      id: `order-${n}`,
      conversationId: "c",
      state: "Awaiting Payment",
      version: 0,
      lines: [],
      quote: null,
      paymentId: `payment-${n}`,
      audit: [],
    });
    state.payments.push({
      id: `payment-${n}`,
      orderId: `order-${n}`,
      amountFils: 3000,
      currency: "AED",
      provider: "paymennt",
      ...(n === 1 ? { providerReference: "checkout-1" } : {}),
      status: "pending",
      createdAt: at,
      updatedAt: at,
      timeline: [],
    });
  }
  const store = new Store(":memory:", "test", state);
  const checkouts = new Map<string, Record<string, unknown> | number>([
    // Site checkout, associated.
    [
      "checkout-1",
      {
        id: "checkout-1",
        requestId: "payment-1",
        orderId: "order-1",
        amount: 30,
        currency: "AED",
        status: "PAID",
      },
    ],
    // Site checkout whose reference has not been saved yet.
    [
      "checkout-2",
      {
        id: "checkout-2",
        requestId: "payment-2",
        orderId: "order-2",
        amount: 30,
        currency: "AED",
        status: "PAID",
      },
    ],
    // Created elsewhere on the same merchant account: foreign request id, no order id.
    [
      "external-link",
      {
        id: "external-link",
        requestId: "7b1d9c7e-0000-4000-8000-000000000001",
        orderId: null,
        amount: 374,
        currency: "AED",
        status: "PAID",
        branchName: "Counter",
      },
    ],
    // Created elsewhere, free-text order label.
    [
      "external-text",
      {
        id: "external-text",
        requestId: "7b1d9c7e-0000-4000-8000-000000000002",
        orderId: "Maria ",
        amount: 157,
        currency: "AED",
        status: "PAID",
      },
    ],
    // Inconsistent: foreign request id but one of our order ids.
    [
      "odd-order",
      {
        id: "odd-order",
        requestId: "7b1d9c7e-0000-4000-8000-000000000003",
        orderId: "order-1",
        amount: 30,
        currency: "AED",
        status: "PAID",
      },
    ],
    // The provider answers with a different checkout than the one asked for.
    [
      "wrong-id",
      {
        id: "someone-else",
        requestId: "x",
        orderId: null,
        amount: 1,
        currency: "AED",
        status: "PAID",
      },
    ],
    ["not-found", 404],
    ["provider-down", 500],
  ]);
  const gets: string[] = [];
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url) => {
      const id = decodeURIComponent(String(url).split("/").at(-1)!);
      gets.push(id);
      const found = checkouts.get(id);
      if (typeof found === "number" || !found)
        return new Response("private provider payload", {
          status: (found as number) ?? 404,
        });
      return new Response(JSON.stringify({ success: true, result: found }));
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
  );
  const business = () => {
    const { orders, payments } = store.read();
    return JSON.stringify({ orders, payments });
  };
  const receipt = (checkoutId: string) =>
    store
      .read()
      .paymentNotifications!.find((r) => r.checkoutId === checkoutId)!;
  return { store, service, gets, business, receipt };
}
const retry = (error: unknown) =>
  (error as { status?: number }).status === 503 &&
  /Checkout aún no asociado/.test((error as Error).message);

for (const id of ["external-link", "external-text"])
  test(`confirmed external checkout ${id} is acknowledged once and touches no order or payment`, async () => {
    const f = setup();
    try {
      const before = f.business();
      assert.deepEqual(
        await f.service.acceptPaymentNotification({ id, status: "PAID" }),
        { duplicate: false },
      );
      assert.equal(f.receipt(id).outcome, "external");
      assert.ok(f.receipt(id).completedAt);
      assert.equal(f.business(), before);
      // Idempotent: the provider's retries are duplicates and cost no lookup.
      const lookups = f.gets.length;
      assert.deepEqual(
        await f.service.acceptPaymentNotification({ id, status: "PAID" }),
        { duplicate: true },
      );
      assert.equal(f.gets.length, lookups);
      assert.equal(f.store.read().paymentNotifications!.length, 1);
    } finally {
      f.store.close();
    }
  });

test("a website checkout awaiting association is never mistaken for external: retry, then reconcile", async () => {
  const f = setup();
  try {
    await assert.rejects(
      f.service.acceptPaymentNotification({ id: "checkout-2", status: "PAID" }),
      retry,
    );
    assert.equal(f.receipt("checkout-2").completedAt, undefined);
    assert.equal(f.receipt("checkout-2").outcome, undefined);
    assert.equal(f.store.read().payments[1]!.status, "pending");
    // The association lands; the provider's retry now settles the order.
    f.store.write((s) => {
      s.payments[1]!.providerReference = "checkout-2";
    });
    assert.deepEqual(
      await f.service.acceptPaymentNotification({
        id: "checkout-2",
        status: "PAID",
      }),
      { duplicate: false },
    );
    assert.equal(f.store.read().payments[1]!.status, "paid");
    assert.equal(f.receipt("checkout-2").outcome, undefined);
  } finally {
    f.store.close();
  }
});

for (const id of [
  "odd-order",
  "wrong-id",
  "not-found",
  "provider-down",
  "never-heard-of-it",
])
  test(`unknown or inconsistent reference ${id} keeps the retry answer and stays open`, async () => {
    const f = setup();
    try {
      const before = f.business();
      await assert.rejects(
        f.service.acceptPaymentNotification({ id, status: "PAID" }),
        retry,
      );
      assert.equal(f.receipt(id).completedAt, undefined);
      assert.equal(f.receipt(id).outcome, undefined);
      assert.equal(f.receipt(id).attempts, 1);
      assert.equal(f.business(), before);
    } finally {
      f.store.close();
    }
  });

test("matched website checkouts reconcile exactly as before, with no ownership lookup", async () => {
  const f = setup();
  try {
    await f.service.acceptPaymentNotification({
      id: "checkout-1",
      status: "PAID",
    });
    assert.equal(f.store.read().payments[0]!.status, "paid");
    assert.equal(f.store.read().orders[0]!.state, "Confirmed");
    assert.equal(f.receipt("checkout-1").outcome, undefined);
    assert.deepEqual(f.gets, ["checkout-1"]);
  } finally {
    f.store.close();
  }
});

test("the worker closes stored external receipts and leaves unknown ones for retry", async () => {
  const f = setup();
  try {
    // Receipts as they sit in Production today: open, already retried many times.
    f.store.write((s) => {
      s.paymentNotifications = [
        "external-link",
        "external-text",
        "provider-down",
      ].map((checkoutId, i) => ({
        id: `stored-${i}`,
        checkoutId,
        status: "PAID",
        receivedAt: "2026-10-02T11:19:51.136Z",
        nextAt: 0,
        attempts: 179,
      }));
    });
    const before = f.business();
    await f.service.drain();
    assert.equal(f.receipt("external-link").outcome, "external");
    assert.equal(f.receipt("external-text").outcome, "external");
    assert.equal(f.receipt("provider-down").completedAt, undefined);
    assert.equal(f.receipt("provider-down").attempts, 180);
    assert.equal(f.business(), before);
    // A second pass has nothing left to do for the closed ones.
    const lookups = f.gets.length;
    f.store.write((s) => {
      for (const r of s.paymentNotifications!) r.nextAt = 0;
    });
    await f.service.drain();
    assert.deepEqual(f.gets.slice(lookups), ["provider-down"]);
  } finally {
    f.store.close();
  }
});
