/**
 * Email reliability characterisation (audit/3l-email-reliability).
 *
 * These tests pin how the email outboxes behave today at the edges the
 * existing suite does not reach: provider failure classes, unknown outcomes,
 * several internal recipients, and the verified-payment condition. Everything
 * runs on in-memory or temporary stores with fake providers: no request ever
 * leaves the process.
 */
import { fixtureAddressGeo } from "../fixtures/website-address";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import {
  ResendEmailProvider,
  operationsEmailConfig,
} from "../../server/adapters/resend";
import { validateCatalog } from "../../server/domain/catalog";
import {
  createWebCheckout,
  dubaiToday,
  addDays,
  readWebCheckoutStatus,
} from "../../server/domain/web-checkout";
import { reconcileEmbeddedPayment } from "../../server/domain/embedded-checkout";
import {
  dispatchCustomerNotifications,
  recordCustomerEvent,
} from "../../server/domain/customer-notifications";
import { recordPaidOperationsEmail } from "../../server/domain/operations-email";
import { parseOperationsPath } from "../../src/commerce/order-view";
import type {
  Actor,
  CustomerNotification,
  Order,
} from "../../server/domain/model";

const sku = "conchas-traditional-chocolate-mini-40-g";
const admin: Actor = { id: "liza", role: "admin" };
const customer = {
  firstName: "Ana María",
  lastName: "López Ortega",
  phone: "0500000000",
  email: "ana@example.invalid",
};
const delivery = () => ({
  lines: [{ productId: sku, quantity: 6 }],
  delivery: {
    zoneId: "jlt-cluster-c",
    address: "Fixture street only",
    building: "Fixture Tower",
    date: addDays(dubaiToday(), 2),
    slot: "4:00 PM – 9:00 PM",
  },
  customer,
  billing: { sameAsDelivery: true },
});
const pickup = () => ({
  fulfillmentMethod: "pickup",
  lines: [{ productId: sku, quantity: 1 }],
  pickup: {
    pickupDate: addDays(dubaiToday(), 2),
    preferredTime: "4:00 PM – 9:00 PM",
  },
  customer,
  billing: {
    sameAsDelivery: false,
    name: "Ana María López Ortega",
    address1: "Fixture billing street",
    city: "Dubai",
    country: "AE",
  },
});

/** A fake Paymennt whose authoritative answer is whatever `provider.status` says. */
function fixture() {
  const store = new Store(":memory:", "test");
  store.write((s) => {
    s.catalog = validateCatalog(
      JSON.parse(readFileSync("data-imports/liza-current-menu.json", "utf8")),
    );
  });
  const seen = new Map<string, Record<string, unknown>>();
  const provider = { status: "PENDING" };
  const payment = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const id = `checkout-${body.requestId}`;
        seen.set(id, { ...body, id });
        return Response.json({
          success: true,
          result: {
            ...body,
            id,
            status: "PENDING",
            redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
          },
        });
      }
      const target = String(url);
      const found = target.includes("?requestId=")
        ? [...seen.values()].find((c) =>
            target.endsWith(`=${String(c.requestId)}`),
          )
        : seen.get(target.split("/").at(-1)!);
      const result = {
        ...found,
        status: provider.status,
        redirectUrl: `https://pay.test.paymennt.com/checkout/${found?.id}`,
      };
      return Response.json({
        success: true,
        result: target.includes("?requestId=")
          ? { totalPages: 1, content: [result] }
          : result,
      });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    payment,
    fixtureAddressGeo,
  );
  service.operationsOrigin = "https://3l.example";
  service.deliveryAddressMode = "legacy";
  service.operationsEmailRecipients = ["ops@example.invalid"];
  const place = async (input: unknown, key = randomUUID()) => {
    await createWebCheckout(
      service,
      input,
      key,
      "web",
      "https://test.example.invalid",
    );
    return key;
  };
  const reconcile = (key: string) => reconcileEmbeddedPayment(service, key);
  const order = (key: string) => {
    const id = readWebCheckoutStatus(service, key).orderId;
    return store.read().orders.find((o) => o.id === id)!;
  };
  const move = (key: string, state: Order["state"]) => {
    const c = store
      .read()
      .conversations.find((c) => c.id === order(key).conversationId)!;
    if (c.assignedAgent !== admin.id)
      service.command(
        { type: "assign", id: c.id, version: c.version, agent: admin.id },
        randomUUID(),
        admin,
      );
    const o = order(key);
    return service.command(
      { type: "transition", id: o.id, version: o.version, state },
      randomUUID(),
      admin,
    );
  };
  return { store, service, provider, place, reconcile, order, move };
}

const pendingRow = (id: string): CustomerNotification => ({
  id,
  event: "ORDER_PRODUCTION_STARTED",
  channel: "email",
  orderId: "TL-FIXTURE1",
  recipient: "ana@example.invalid",
  subject: "fixture subject",
  body: "fixture body",
  status: "pending",
  attemptCount: 0,
  createdAt: new Date().toISOString(),
});

/** The real Resend adapter over a scripted transport; nothing reaches a network. */
function scriptedResend(answer: (call: number) => Response | Promise<never>) {
  const calls: { key: string; to: string[] }[] = [];
  const provider = new ResendEmailProvider(
    { apiKey: "re_fixture_key_000", from: "3L <orders@example.invalid>" },
    (async (_url: string, init: RequestInit) => {
      calls.push({
        key: (init.headers as Record<string, string>)["Idempotency-Key"]!,
        to: JSON.parse(String(init.body)).to,
      });
      return answer(calls.length);
    }) as unknown as typeof fetch,
  );
  return { provider, calls };
}

// ---- Provider failures ------------------------------------------------------

test("a rate limit, a provider outage and a timeout each end as failed after one request, and no later pass retries", async () => {
  const cases: [string, () => Response | Promise<never>][] = [
    ["429", () => new Response("{}", { status: 429 })],
    ["500", () => new Response("{}", { status: 500 })],
    [
      "timeout",
      () => Promise.reject(new DOMException("timed out", "TimeoutError")),
    ],
  ];
  for (const [name, answer] of cases) {
    const store = new Store(":memory:", "test");
    try {
      store.write((s) => {
        s.customerNotifications = [pendingRow(`row-${name}`)];
      });
      const mail = scriptedResend(answer);
      for (let pass = 0; pass < 3; pass++)
        await dispatchCustomerNotifications(store, mail.provider);
      const row = store.read().customerNotifications![0]!;
      assert.deepEqual(
        [row.status, row.attemptCount, row.provider, mail.calls.length],
        ["failed", 1, "resend", 1],
        name,
      );
      // The outbox row id is what the provider would deduplicate on.
      assert.equal(mail.calls[0]!.key, `row-${name}`);
      assert.ok(row.lastAttemptAt && !row.sentAt && !row.providerMessageId);
      // Today the stored reason is generic: the HTTP status is not kept.
      assert.equal(row.lastError, "Delivery failed; review before resending");
    } finally {
      store.close();
    }
  }
});

test("an accepted request whose answer cannot be read is recorded as failed without a message id, and is not sent again", async () => {
  const store = new Store(":memory:", "test");
  try {
    store.write((s) => {
      s.customerNotifications = [pendingRow("row-unknown")];
    });
    // HTTP 200, but no message id: the provider may well have sent it.
    const mail = scriptedResend(() => Response.json({}));
    await dispatchCustomerNotifications(store, mail.provider);
    await dispatchCustomerNotifications(store, mail.provider);
    const row = store.read().customerNotifications![0]!;
    assert.equal(mail.calls.length, 1);
    assert.equal(row.status, "failed");
    assert.equal(row.providerMessageId, undefined);
    assert.equal(row.sentAt, undefined);
  } finally {
    store.close();
  }
});

test("a failed row does not hold back the rows queued after it", async () => {
  const store = new Store(":memory:", "test");
  try {
    store.write((s) => {
      s.customerNotifications = [pendingRow("first"), pendingRow("second")];
    });
    const mail = scriptedResend((call) =>
      call === 1
        ? new Response("{}", { status: 503 })
        : Response.json({ id: "resend-message-2" }),
    );
    const result = await dispatchCustomerNotifications(store, mail.provider);
    assert.equal(result.attempted, 2);
    assert.deepEqual(
      store
        .read()
        .customerNotifications!.map((n) => [n.status, n.providerMessageId]),
      [
        ["failed", undefined],
        ["sent", "resend-message-2"],
      ],
    );
  } finally {
    store.close();
  }
});

// ---- Internal recipients ----------------------------------------------------

test("each internal recipient gets its own row, key and single-recipient request; one refusal affects only that recipient", async () => {
  const f = fixture();
  const recipients = [
    "first@example.invalid",
    "second@example.invalid",
    "third@example.invalid",
  ];
  f.service.operationsEmailRecipients = recipients;
  try {
    const key = await f.place(delivery());
    f.provider.status = "PAID";
    await f.reconcile(key);
    const rows = f.store.read().operationsEmailNotifications!;
    assert.deepEqual(
      rows.map((r) => r.recipient),
      recipients,
    );
    assert.equal(new Set(rows.map((r) => r.id)).size, 3);
    assert.equal(new Set(rows.map((r) => r.body)).size, 1);
    const mail = scriptedResend((call) =>
      call === 2
        ? new Response("{}", { status: 422 })
        : Response.json({ id: `resend-message-${call}` }),
    );
    for (let pass = 0; pass < 2; pass++)
      await dispatchCustomerNotifications(
        f.store,
        mail.provider,
        "operationsEmailNotifications",
      );
    // Never a shared "to": recipients do not see each other.
    assert.deepEqual(
      mail.calls.map((c) => c.to),
      recipients.map((r) => [r]),
    );
    assert.deepEqual(
      mail.calls.map((c) => c.key),
      rows.map((r) => r.id),
    );
    assert.deepEqual(
      f.store.read().operationsEmailNotifications!.map((r) => r.status),
      ["sent", "failed", "sent"],
    );
  } finally {
    f.store.close();
  }
});

test("internal recipients: at most twenty valid addresses, and an invalid list never reports the address it rejected", () => {
  const env = {
    OPERATIONS_EMAIL_ENABLED: "true",
    RESEND_API_KEY: "fixture-only-key",
    OPERATIONS_EMAIL_FROM: "3L <alerts@example.invalid>",
  };
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => `ops${i}@example.invalid`).join(",");
  assert.equal(
    operationsEmailConfig({ ...env, OPERATIONS_EMAIL_TO: many(20) })!.recipients
      .length,
    20,
  );
  assert.throws(() =>
    operationsEmailConfig({ ...env, OPERATIONS_EMAIL_TO: many(21) }),
  );
  assert.throws(
    () =>
      operationsEmailConfig({
        ...env,
        OPERATIONS_EMAIL_TO: "ops@example.invalid, private-person-at-nowhere",
      }),
    (error: Error) => !error.message.includes("private-person-at-nowhere"),
  );
  // A dedicated sender wins; without one the customer sender is reused.
  assert.equal(
    operationsEmailConfig({
      ...env,
      OPERATIONS_EMAIL_TO: "ops@example.invalid",
      CUSTOMER_EMAIL_FROM: "3L <orders@example.invalid>",
    })!.from,
    "3L <alerts@example.invalid>",
  );
  // The flag alone decides: a complete configuration left disabled is inert.
  assert.equal(
    operationsEmailConfig({
      ...env,
      OPERATIONS_EMAIL_ENABLED: "false",
      OPERATIONS_EMAIL_TO: "ops@example.invalid",
    }),
    null,
  );
});

// ---- Verified-payment condition ---------------------------------------------

test("no email is queued by placing an order, by the return page or by a paid notification the provider does not confirm", async () => {
  const f = fixture();
  const none = () => {
    const s = f.store.read();
    assert.equal(s.operationsEmailNotifications?.length ?? 0, 0);
    assert.equal(s.customerNotifications?.length ?? 0, 0);
  };
  try {
    const key = await f.place(delivery());
    none();
    // The customer comes back from the hosted page: a redirect proves nothing.
    readWebCheckoutStatus(f.service, key);
    await f.reconcile(key);
    none();
    // A notification saying PAID while the authoritative lookup still says PENDING.
    const payment = f.store
      .read()
      .payments.find((p) => p.orderId === f.order(key).id)!;
    await f.service
      .acceptPaymentNotification({
        id: payment.providerReference ?? payment.providerCheckoutId!,
        status: "PAID",
      })
      .catch(() => undefined);
    assert.equal(f.order(key).state, "Awaiting Payment");
    none();
    // Calling the recorder directly with an unpaid payment is refused too,
    // and leaves no marker that would block the real paid transition.
    f.store.write((s) => {
      const o = s.orders.find((o) => o.id === f.order(key).id)!;
      const p = s.payments.find((p) => p.id === payment.id)!;
      assert.deepEqual(
        recordPaidOperationsEmail(s, o, p, ["ops@example.invalid"]),
        [],
      );
      assert.equal(s.events[`operations-email-paid:${o.id}`], undefined);
    });
    f.provider.status = "PAID";
    await f.reconcile(key);
    assert.equal(f.store.read().operationsEmailNotifications!.length, 1);
    // Repeating the verified reconciliation queues nothing more.
    await f.reconcile(key);
    assert.equal(f.store.read().operationsEmailNotifications!.length, 1);
  } finally {
    f.store.close();
  }
});

test("a payment confirmed after its checkout expired is held for review and announces nothing by email", async () => {
  const f = fixture();
  try {
    const key = await f.place(delivery());
    f.provider.status = "EXPIRED";
    await f.reconcile(key);
    assert.equal(f.order(key).state, "Building");
    f.provider.status = "PAID";
    await f.reconcile(key);
    const s = f.store.read();
    const payment = s.payments.find((p) => p.orderId === f.order(key).id)!;
    // Money was received, the order is not confirmed…
    assert.equal(payment.status, "paid");
    assert.equal(f.order(key).state, "Building");
    assert.ok(payment.timeline.some((t) => /Pago tardío/.test(t.action)));
    // …and today nobody is emailed about it: the only trace is the timeline.
    assert.equal(s.operationsEmailNotifications?.length ?? 0, 0);
    assert.equal(s.customerNotifications?.length ?? 0, 0);
  } finally {
    f.store.close();
  }
});

// ---- Customer events --------------------------------------------------------

test("a customer event exists once per order and event, and an order without an email address records none", async () => {
  const f = fixture();
  try {
    const key = await f.place(pickup());
    f.provider.status = "PAID";
    await f.reconcile(key);
    f.move(key, "Production");
    const id = f.order(key).id;
    f.store.write((s) => {
      const o = s.orders.find((o) => o.id === id)!;
      // The same announcement asked for again: refused by the (order, event) key.
      assert.equal(recordCustomerEvent(s, o, "Confirmed", "Production"), null);
      // No address on file: nothing recorded, and no key consumed.
      const anonymous = structuredClone(o);
      anonymous.id = "TL-NOEMAIL1";
      anonymous.customerDetails = undefined;
      assert.equal(
        recordCustomerEvent(s, anonymous, "Confirmed", "Production"),
        null,
      );
      assert.equal(
        s.events["customer-event:ORDER_PRODUCTION_STARTED:TL-NOEMAIL1"],
        undefined,
      );
    });
    assert.deepEqual(
      f.store.read().customerNotifications!.map((n) => n.event),
      ["ORDER_PRODUCTION_STARTED"],
    );
  } finally {
    f.store.close();
  }
});

// ---- Content ----------------------------------------------------------------

test("customer emails carry the order number and schedule but no address, phone or surname; the internal link opens the order page", async () => {
  const f = fixture();
  try {
    const key = await f.place(delivery());
    f.provider.status = "PAID";
    await f.reconcile(key);
    f.move(key, "Production");
    f.move(key, "Ready");
    f.move(key, "Out for Delivery");
    const pickupKey = await f.place(pickup());
    await f.reconcile(pickupKey);
    f.move(pickupKey, "Production");
    f.move(pickupKey, "Ready");
    const s = f.store.read();
    const emails = s.customerNotifications!;
    assert.deepEqual(
      emails.map((n) => n.event),
      [
        "ORDER_PRODUCTION_STARTED",
        "ORDER_OUT_FOR_DELIVERY",
        "ORDER_PRODUCTION_STARTED",
        "ORDER_READY_FOR_PICKUP",
      ],
    );
    for (const email of emails) {
      assert.equal(email.recipient, customer.email);
      assert.match(email.subject, /^Your 3L order #00[12] /);
      assert.match(email.body, /^Hi Ana María,\n/);
      for (const personal of [
        "Fixture street only",
        "Fixture Tower",
        "Fixture billing street",
        customer.phone,
        customer.email,
        customer.lastName,
        "TL-",
        "http",
      ])
        assert.ok(!email.body.includes(personal), personal);
    }
    // The internal alert is the opposite: complete, and addressed to staff only.
    const internal = s.operationsEmailNotifications![0]!;
    assert.equal(internal.recipient, "ops@example.invalid");
    const link = new URL(internal.body.trim().split("\n").at(-1)!);
    assert.equal(link.origin, "https://3l.example");
    // The alert still uses the earlier `?order=` form, which the app rewrites
    // to the dedicated order page.
    assert.deepEqual(parseOperationsPath(link.pathname, link.search), {
      view: "orders",
      orderId: f.order(key).id,
      legacy: true,
    });
  } finally {
    f.store.close();
  }
});
