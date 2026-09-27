/**
 * Website-first ecommerce checkout: cart → delivery → customer → direct
 * payment → ORDER_PAID → operations notification (never sent while outbound
 * is disabled). Real domain rules throughout; only Paymennt's transport is a
 * fixture.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { validateCatalog } from "../../server/domain/catalog";
import {
  addDays,
  createWebCheckout,
  dubaiToday,
  normalizeCheckout,
  normalizeUaeMobile,
  quoteWebCheckout,
} from "../../server/domain/web-checkout";
import {
  reconcileEmbeddedPayment,
  submitEmbeddedPayment,
} from "../../server/domain/embedded-checkout";
import {
  dispatchOperationsNotifications,
  OPERATIONS_RECIPIENT,
  type OperationsNotifier,
} from "../../server/domain/notifications";

const tomorrow = () => addDays(dubaiToday(), 1);
const cart = (quantity = 2, zoneId = "jlt-cluster-c") => ({
  lines: [{ productId: "pan-de-muerto", quantity }],
  delivery: {
    zoneId,
    address: "Jumeirah Lakes Towers, Cluster C",
    building: "Test Tower",
    unit: "1204",
    date: tomorrow(),
    slot: "Afternoon",
    notes: "Call on arrival",
  },
  customer: {
    name: "Test Customer",
    phone: "050 123 4567",
    email: "customer@example.com",
    instructions: "Birthday — no candles",
  },
});

function fixture(initial = "CAPTURED") {
  const store = new Store(":memory:", "test");
  store.write((s) => {
    s.catalog = validateCatalog(
      JSON.parse(readFileSync("data-imports/pan-de-muerto.json", "utf8")),
    );
  });
  let posts = 0,
    gets = 0,
    status = initial,
    checkout: Record<string, unknown> = {};
  const provider = new PaymenntProvider(
    { apiKey: "test-fixture", apiSecret: "test-secret", environment: "test" },
    async (_url, options) => {
      if (options?.method === "POST") {
        posts++;
        const body = JSON.parse(String(options.body));
        checkout = { ...body.checkoutDetails, id: "checkout-fixture" };
      } else gets++;
      return Response.json({
        success: true,
        result: {
          id: "payment-fixture",
          amount: 50,
          currency: "AED",
          status,
          redirectUrl:
            "https://pay.test.paymennt.com/frames/redirect/payment/payment-fixture",
          checkoutDetails: {
            ...checkout,
            status:
              status === "CAPTURED"
                ? "PAID"
                : status === "FAILED"
                  ? "FAILED"
                  : "PENDING",
          },
        },
      });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
  );
  service.operationsOrigin = "https://3l.example";
  return {
    store,
    service,
    counts: () => ({ posts, gets }),
    lastDebit: () => checkout,
    setStatus: (s: string) => {
      status = s;
    },
  };
}
async function pay(f: ReturnType<typeof fixture>, quantity = 2) {
  const key = randomUUID();
  const order = await createWebCheckout(f.service, cart(quantity), key, true);
  const result = await submitEmbeddedPayment(
    f.service,
    {
      key,
      orderId: order.orderId,
      email: "customer@example.com",
      token: "ptk_test_fixturetokenonly",
    },
    "https://3l.example",
  );
  return { key, order, result };
}
const notifications = (f: ReturnType<typeof fixture>) =>
  f.store.read().operationsNotifications ?? [];

// ── Cart and pricing ─────────────────────────────────────────────────────

test("cart pricing is exact in fils: 2 × AED 25 = 5000 fils, free JLT delivery", () => {
  const f = fixture();
  try {
    const q = quoteWebCheckout(f.service, {
      lines: [{ productId: "pan-de-muerto", quantity: 2 }],
      zoneId: "jlt-cluster-c",
    });
    assert.equal(q.subtotalFils, 5000);
    assert.equal(q.feeFils, 0);
    assert.equal(q.totalFils, 5000);
    assert.equal(q.eligible, true);
  } finally {
    f.store.close();
  }
});

test("multi-line carts price every line from the catalog", () => {
  const f = fixture();
  try {
    // A second approved line exists only inside this test's own store.
    f.store.write((s) => {
      s.catalog!.push({
        id: "test-item",
        name: "Test item",
        priceFils: 1250,
        active: true,
        availability: "available",
      });
    });
    const q = quoteWebCheckout(f.service, {
      lines: [
        { productId: "pan-de-muerto", quantity: 1 },
        { productId: "test-item", quantity: 3 },
      ],
      zoneId: "jlt-cluster-c",
    });
    assert.equal(q.subtotalFils, 2500 + 3 * 1250);
    assert.equal(q.totalFils, 6250);
  } finally {
    f.store.close();
  }
});

test("zone minimum is enforced: one Pan de Muerto (AED 25) is below AED 30", async () => {
  const f = fixture();
  try {
    const q = quoteWebCheckout(f.service, {
      lines: [{ productId: "pan-de-muerto", quantity: 1 }],
      zoneId: "jlt-cluster-c",
    });
    assert.equal(q.eligible, false);
    assert.equal(q.minimumMet, false);
    await assert.rejects(
      createWebCheckout(f.service, cart(1), randomUUID(), true),
      /mínimo/,
    );
    assert.equal(f.store.read().orders.length, 0);
  } finally {
    f.store.close();
  }
});

test("a zone without a confirmed delivery fee blocks checkout, never a fabricated fee", async () => {
  const f = fixture();
  try {
    const unresolved = f.store
      .read()
      .zones.find((z) => z.active && z.deliveryFeeAed == null)!;
    assert.ok(unresolved, "seed has zones pending fee confirmation");
    const q = quoteWebCheckout(f.service, {
      lines: [{ productId: "pan-de-muerto", quantity: 20 }],
      zoneId: unresolved.id,
    });
    assert.equal(q.eligible, false);
    assert.equal(q.feeFils, null);
    await assert.rejects(
      createWebCheckout(f.service, cart(20, unresolved.id), randomUUID(), true),
    );
    assert.equal(f.store.read().payments.length, 0);
  } finally {
    f.store.close();
  }
});

// ── Customer and delivery validation ─────────────────────────────────────

test("UAE mobile numbers are validated and normalised", () => {
  for (const ok of [
    "0501234567",
    "501234567",
    "+971 50 123 4567",
    "00971501234567",
    "971-55-123-4567",
  ])
    assert.match(normalizeUaeMobile(ok) ?? "", /^\+9715\d{8}$/, ok);
  for (const bad of ["0412345678", "12345", "+1 202 555 0100", "05012345"])
    assert.equal(normalizeUaeMobile(bad), null, bad);
  assert.equal(
    normalizeCheckout(cart()).phone,
    "+971501234567",
    "stored in E.164",
  );
});

test("checkout rejects invalid customer and delivery details", () => {
  const bad = (patch: (c: ReturnType<typeof cart>) => unknown) => {
    const c = structuredClone(cart());
    return () => normalizeCheckout(patch(c));
  };
  assert.throws(
    bad((c) => ({ ...c, customer: { ...c.customer, phone: "123" } })),
  );
  assert.throws(bad((c) => ({ ...c, customer: { ...c.customer, name: "A" } })));
  assert.throws(
    bad((c) => ({ ...c, customer: { ...c.customer, email: "not-an-email" } })),
  );
  assert.throws(
    bad((c) => ({ ...c, delivery: { ...c.delivery, date: "2020-01-01" } })),
    /date/,
  );
  assert.throws(
    bad((c) => ({ ...c, delivery: { ...c.delivery, building: "" } })),
  );
  // Email is required (payment receipt); instructions are optional.
  const noEmail = structuredClone(cart()) as {
    customer: Record<string, unknown>;
  };
  delete noEmail.customer.email;
  assert.throws(() => normalizeCheckout(noEmail));
  const optional = structuredClone(cart()) as {
    customer: Record<string, unknown>;
  };
  delete optional.customer.instructions;
  assert.doesNotThrow(() => normalizeCheckout(optional));
});

test("the browser cannot supply a price, amount, fee, currency or status", () => {
  for (const field of [
    "amountFils",
    "priceFils",
    "feeFils",
    "currency",
    "status",
    "total",
  ]) {
    assert.throws(() => normalizeCheckout({ ...cart(), [field]: 1 }), field);
    assert.throws(
      () =>
        normalizeCheckout({
          ...cart(),
          lines: [{ productId: "pan-de-muerto", quantity: 2, [field]: 1 }],
        }),
      field,
    );
  }
});

test("configured delivery slots are enforced; none are invented", () => {
  const env = { DELIVERY_SLOTS_JSON: JSON.stringify(["10:00–13:00"]) };
  assert.throws(() => normalizeCheckout(cart(), env), /delivery times/);
  const c = cart();
  c.delivery.slot = "10:00–13:00";
  assert.equal(normalizeCheckout(c, env).delivery?.slot, "10:00–13:00");
  // With nothing configured, the customer's stated preference is recorded.
  assert.equal(normalizeCheckout(cart(), {}).delivery?.slot, "Afternoon");
});

// ── Order creation ───────────────────────────────────────────────────────

test("order creation stores delivery and customer details; unpaid is not actionable", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    const order = await createWebCheckout(f.service, cart(), key, true);
    const s = f.store.read();
    const o = s.orders.find((o) => o.id === order.orderId)!;
    assert.equal(o.state, "Awaiting Payment");
    assert.equal(o.delivery?.zoneId, "jlt-cluster-c");
    assert.equal(o.delivery?.building, "Test Tower");
    assert.equal(o.delivery?.date, tomorrow());
    assert.equal(o.customerDetails?.email, "customer@example.com");
    assert.equal(
      s.payments.find((p) => p.id === o.paymentId)?.amountFils,
      5000,
    );
    const c = s.conversations.find((c) => c.id === o.conversationId)!;
    assert.equal(c.unread, false, "unpaid orders must not alert the team");
    assert.equal(c.phone, "+971501234567");
    assert.equal(notifications(f).length, 0, "no alert before payment");
    // Same key, same details: one order, one payment.
    await createWebCheckout(f.service, cart(), key, true);
    assert.equal(f.store.read().orders.length, 1);
    assert.equal(f.store.read().payments.length, 1);
    // Same key, altered details: refused.
    await assert.rejects(
      createWebCheckout(f.service, cart(3), key, true),
      /different/,
    );
  } finally {
    f.store.close();
  }
});

// ── Payment → ORDER_PAID → notification ─────────────────────────────────

test("CAPTURED confirms the order and queues exactly one alert for the team", async () => {
  const f = fixture("CAPTURED");
  try {
    const { result, order } = await pay(f);
    assert.equal(result.paymentStatus, "paid");
    assert.equal(result.status, "Confirmed");
    // The debit carried the full cart, priced by the server.
    assert.equal(f.lastDebit().amount, 50);
    const n = notifications(f);
    assert.equal(n.length, 1);
    assert.equal(n[0]!.event, "ORDER_PAID");
    assert.equal(n[0]!.kind, "notify_operations_whatsapp");
    assert.equal(n[0]!.status, "pending-whatsapp-delivery");
    assert.equal(n[0]!.recipient.phone, OPERATIONS_RECIPIENT.phone);
    const m = n[0]!.message;
    for (const expected of [
      "New paid order ✅",
      `Order: ${order.orderId}`,
      "Customer: Test Customer",
      "Phone: +971501234567",
      "2 × Pan de Muerto",
      "Subtotal: AED 50.00",
      "Delivery: AED 0.00",
      "Total paid: AED 50.00",
      tomorrow(),
      "Afternoon",
      "Unit 1204, Test Tower, Jumeirah Lakes Towers, Cluster C",
      "Call on arrival",
      "Payment: PAID",
      `https://3l.example/operations/orders?order=${order.orderId}`,
    ])
      assert.ok(m.includes(expected), `message missing: ${expected}`);
    const o = f.store.read().orders.find((o) => o.id === order.orderId)!;
    assert.ok(o.paidAt);
  } finally {
    f.store.close();
  }
});

test("a failed payment confirms nothing and alerts no one", async () => {
  const f = fixture("FAILED");
  try {
    const { result } = await pay(f);
    assert.equal(result.paymentStatus, "failed");
    assert.notEqual(result.status, "Confirmed");
    assert.equal(notifications(f).length, 0);
  } finally {
    f.store.close();
  }
});

test("3DS: pending until the authoritative GET; the alert follows confirmation only once", async () => {
  const f = fixture("REDIRECT");
  try {
    const { key, result } = await pay(f);
    assert.equal(result.paymentStatus, "pending");
    assert.equal(
      notifications(f).length,
      0,
      "a redirect is not proof of payment",
    );
    f.setStatus("CAPTURED");
    const confirmed = await reconcileEmbeddedPayment(f.service, key);
    assert.equal(confirmed.status, "Confirmed");
    assert.equal(notifications(f).length, 1);
    // Returning to the page again (repeat reconcile) changes nothing.
    await reconcileEmbeddedPayment(f.service, key);
    await reconcileEmbeddedPayment(f.service, key);
    assert.equal(notifications(f).length, 1);
    assert.equal(f.counts().posts, 1, "never debited twice");
  } finally {
    f.store.close();
  }
});

test("a duplicate provider confirmation cannot pay twice or alert twice", async () => {
  const f = fixture("CAPTURED");
  try {
    const { order } = await pay(f);
    const s = f.store.read();
    const payment = s.payments.find(
      (p) => p.id === s.orders.find((o) => o.id === order.orderId)!.paymentId,
    )!;
    const authoritative = {
      checkoutId: payment.providerReference!,
      requestId: payment.id,
      orderId: payment.orderId,
      amountFils: payment.amountFils,
      currency: payment.currency,
      status: "paid" as const,
      rawStatus: "PAID",
    };
    // As if the signed webhook and an admin reconcile both arrived afterwards.
    f.service.applyCheckout(payment.id, authoritative, "webhook");
    f.service.applyCheckout(payment.id, authoritative, "reconcile");
    const after = f.store.read();
    assert.equal(notifications(f).length, 1);
    assert.equal(
      after.orders.filter((o) => o.id === order.orderId).length,
      1,
      "no duplicate order",
    );
    assert.equal(
      after.orders
        .find((o) => o.id === order.orderId)!
        .audit.filter((a) => (a as { to?: string }).to === "Paid").length,
      1,
      "marked paid once",
    );
  } finally {
    f.store.close();
  }
});

// ── Outbound guard ───────────────────────────────────────────────────────

test("outbound disabled: the dispatcher never calls a provider and the alert stays pending", async () => {
  const f = fixture("CAPTURED");
  try {
    await pay(f);
    let calls = 0;
    const spy: OperationsNotifier = {
      async send() {
        calls++;
        return { providerId: "x" };
      },
    };
    const result = await dispatchOperationsNotifications(f.store, {
      outboundEnabled: false,
      notifier: spy,
    });
    assert.equal(result.attempted, 0);
    assert.equal(calls, 0);
    assert.equal(notifications(f)[0]!.status, "pending-whatsapp-delivery");
    // No notifier configured is equally inert even if the flag were on.
    await dispatchOperationsNotifications(f.store, {
      outboundEnabled: true,
      notifier: null,
    });
    assert.equal(notifications(f)[0]!.status, "pending-whatsapp-delivery");
  } finally {
    f.store.close();
  }
});

test("once outbound is enabled later, each paid order is sent exactly once", async () => {
  const f = fixture("CAPTURED");
  try {
    await pay(f);
    let calls = 0;
    const spy: OperationsNotifier = {
      async send() {
        calls++;
        return { providerId: "wamid.test" };
      },
    };
    await dispatchOperationsNotifications(f.store, {
      outboundEnabled: true,
      notifier: spy,
    });
    await dispatchOperationsNotifications(f.store, {
      outboundEnabled: true,
      notifier: spy,
    });
    assert.equal(calls, 1);
    assert.equal(notifications(f)[0]!.status, "sent");
  } finally {
    f.store.close();
  }
});

test("a failed send is not retried automatically", async () => {
  const f = fixture("CAPTURED");
  try {
    await pay(f);
    let calls = 0;
    const failing: OperationsNotifier = {
      async send() {
        calls++;
        throw new Error("provider down");
      },
    };
    await dispatchOperationsNotifications(f.store, {
      outboundEnabled: true,
      notifier: failing,
    });
    await dispatchOperationsNotifications(f.store, {
      outboundEnabled: true,
      notifier: failing,
    });
    assert.equal(calls, 1);
    assert.equal(notifications(f)[0]!.status, "failed");
  } finally {
    f.store.close();
  }
});
