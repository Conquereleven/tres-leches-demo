import test from "node:test";
import assert from "node:assert/strict";
import type { CustomerNotification, Order, State } from "../../server/domain/model";
import {
  dispatchCustomerNotifications,
  renderCustomerEmail,
} from "../../server/domain/customer-notifications";

const fixtureOrder = (pickup: boolean, firstName = "Alex"): Order =>
  ({
    id: "TL-FAKE0001",
    publicOrderNumber: 42,
    fulfillmentMethod: pickup ? "pickup" : "delivery",
    customerDetails: {
      firstName,
      lastName: "PrivateSurname",
      email: "customer@example.invalid",
      phone: "+971500000000",
    },
    delivery: pickup
      ? undefined
      : { date: "2026-10-21", slot: "4:00 PM – 9:00 PM", address: "Private Street", building: "Private Building" },
    pickup: pickup
      ? { pickupDate: "2026-10-21", preferredTime: "4:00 PM – 9:00 PM" }
      : undefined,
  }) as unknown as Order;

test("all three real customer events have branded accessible HTML and unchanged text", () => {
  for (const [event, pickup, status] of [
    ["ORDER_PRODUCTION_STARTED", false, "PREPARING YOUR ORDER"],
    ["ORDER_READY_FOR_PICKUP", true, "READY FOR PICKUP"],
    ["ORDER_OUT_FOR_DELIVERY", false, "OUT FOR DELIVERY"],
  ] as const) {
    const mail = renderCustomerEmail(event, fixtureOrder(pickup), {
      zoneName: "JLT Cluster C",
    });
    assert.ok(mail.subject.startsWith("Your 3L order #042"));
    assert.ok(mail.body.startsWith("Hi Alex,\n"));
    assert.match(mail.html, /<!doctype html><html lang="en"/);
    assert.match(mail.html, /<h1\b/);
    assert.match(mail.html, /role="presentation"/);
    assert.ok(mail.html.includes("3L Pastelerías"));
    assert.ok(mail.html.includes("#042"));
    assert.ok(mail.html.includes(status));
    assert.ok(mail.html.includes("#F6DFE0"));
    assert.ok(mail.html.includes("#A28D5B"));
    assert.ok(mail.html.includes("#27242D"));
    assert.ok(mail.html.includes("#A93C68"));
    for (const forbidden of [
      "PrivateSurname",
      "customer@example.invalid",
      "+971500000000",
      "Private Street",
      "Private Building",
      "TL-FAKE",
    ]) {
      assert.ok(!mail.html.includes(forbidden), forbidden);
      assert.ok(!mail.body.includes(forbidden), forbidden);
    }
    assert.ok(!/href=/i.test(mail.html), "No unapproved customer action or tracking link");
    assert.ok(!/<img/i.test(mail.html), "No unapproved or remote image assets");
  }
});

test("customer email details are event specific and private", () => {
  const ready = renderCustomerEmail("ORDER_READY_FOR_PICKUP", fixtureOrder(true));
  assert.ok(ready.html.includes("Retail Shop C6/A"));
  assert.ok(ready.html.includes("Golositalia JLT"));
  const delivery = renderCustomerEmail("ORDER_OUT_FOR_DELIVERY", fixtureOrder(false), {
    zoneName: "JLT Cluster C",
  });
  assert.ok(delivery.html.includes("DELIVERY AREA"));
  assert.ok(delivery.html.includes("JLT Cluster C"));
  assert.ok(!delivery.html.includes("Retail Shop C6/A"));
  assert.ok(!delivery.html.includes("4:00 PM"));
  const preparing = renderCustomerEmail("ORDER_PRODUCTION_STARTED", fixtureOrder(false));
  assert.ok(preparing.html.includes("4:00 PM"));
  assert.ok(preparing.html.includes("DELIVERY"));
});

test("customer HTML escapes free-form input without polluting the text fallback", () => {
  const malicious = '<img src=x onerror="alert(1)">&';
  const mail = renderCustomerEmail("ORDER_OUT_FOR_DELIVERY", fixtureOrder(false, malicious), {
    zoneName: 'JLT <script>alert(1)</script> & "quote"',
  });
  assert.ok(mail.html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;"));
  assert.ok(mail.html.includes("JLT &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quote&quot;"));
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(!mail.html.includes("<img"));
  assert.ok(mail.body.includes(malicious));
});

test("outbox freezes and delivers customer HTML with text fallback, including historical text-only rows", async () => {
  const sent: Array<{ to: string; text: string; html?: string; idempotencyKey: string }> = [];
  const state = {
    customerNotifications: [
      {
        id: "visual-fixture",
        event: "ORDER_PRODUCTION_STARTED",
        channel: "email",
        orderId: "test-order-1",
        recipient: "test@example.invalid",
        subject: "Visual test",
        body: "original text",
        html: "<html>visual</html>",
        status: "pending",
        attemptCount: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: "historical-fixture",
        event: "ORDER_PRODUCTION_STARTED",
        channel: "email",
        orderId: "test-order-2",
        recipient: "test@example.invalid",
        subject: "Historical test",
        body: "historical text",
        status: "pending",
        attemptCount: 0,
        createdAt: new Date().toISOString(),
      },
    ] as CustomerNotification[],
  } as unknown as State;
  const store = {
    read: () => state,
    write: <T>(cb: (s: State) => T): T => cb(state),
  };
  const provider = {
    name: "fixture-provider",
    send: async (email: { to: string; text: string; html?: string; idempotencyKey: string }) => {
      sent.push(email);
      return { messageId: "no-real-send" };
    },
  };
  await dispatchCustomerNotifications(store, provider);
  assert.equal(sent.length, 2);
  assert.equal(sent[0]?.html, "<html>visual</html>");
  assert.equal(sent[0]?.text, "original text");
  assert.equal(sent[0]?.idempotencyKey, "visual-fixture");
  assert.equal(sent[1]?.html, undefined);
  assert.equal(sent[1]?.text, "historical text");
  assert.ok(state.customerNotifications?.every((row) => row.status === "sent"));
});
