import test from "node:test";
import assert from "node:assert/strict";
import type { CustomerNotification, Order, State } from "../../server/domain/model";
import { PACK_SPECS } from "../../shared/pack-composition";
import { snapshotTricolor } from "../../shared/tricolor";
import { customerEmailItems } from "../../server/domain/customer-email-items";
import {
  dispatchCustomerNotifications,
  renderCustomerEmail,
} from "../../server/domain/customer-notifications";

const fixtureOrder = (pickup: boolean, firstName = "Alex"): Order =>
  ({
    id: "TL-FAKE0001",
    publicOrderNumber: 42,
    fulfillmentMethod: pickup ? "pickup" : "delivery",
    lines: [{ productId: "conchas-traditional-chocolate-mini-40-g", quantity: 2 }],
    catalogSnapshot: [{ id: "conchas-traditional-chocolate-mini-40-g", name: "Chocolate concha mini", priceFils: 1800 }],
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
    assert.ok(mail.html.includes("Your order"));
    assert.ok(mail.html.includes("2 × Chocolate concha mini"));
    assert.ok(mail.body.includes("2 × Chocolate concha mini"));
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
  assert.ok(delivery.html.includes("4:00 PM"));
  assert.ok(delivery.body.includes("Delivery: Wednesday 21 October, 4:00 PM – 9:00 PM"));
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

test("frozen customer pack summaries repeat composition per box and keep different mixtures separate", () => {
  const spec = PACK_SPECS.find((s) => s.packSkuId === "pan-de-muerto-traditional-pack-6-mini")!;
  const mixA = [{ componentSkuId: spec.components[0]!.componentSkuId, units: 4 },
    { componentSkuId: spec.components[1]!.componentSkuId, units: 2 }];
  const mixB = [{ componentSkuId: spec.components[0]!.componentSkuId, units: 1 },
    { componentSkuId: spec.components[1]!.componentSkuId, units: 5 }];
  const make = (composition: typeof mixA, quantity: number) => ({
    productId: spec.packSkuId,
    quantity,
    composition,
    packSnapshot: {
      version: 1 as const,
      revision: "catalog-v1-" + "a".repeat(64),
      capacity: 6,
      components: composition.map((c) => ({
        componentSkuId: c.componentSkuId,
        units: c.units,
        name: spec.components.find((s) => s.componentSkuId === c.componentSkuId)!.names.en,
      })),
    },
  });
  const order = fixtureOrder(false);
  order.lines = [make(mixA, 2), make(mixB, 1)];
  order.catalogSnapshot = [{ id: spec.packSkuId, name: "Traditional Pan de Muerto mixed box", priceFils: 6000 }] as Order["catalogSnapshot"];
  const details = customerEmailItems(order);
  assert.equal(details.length, 2);
  assert.equal(details[0]!.boxCapacity, 6);
  assert.equal(details[0]!.quantity, 2);
  assert.equal(details[1]!.quantity, 1);
  assert.deepEqual(details[0]!.components.map((c) => c.units), [4, 2]);
  assert.deepEqual(details[1]!.components.map((c) => c.units), [1, 5]);
  const mail = renderCustomerEmail("ORDER_PRODUCTION_STARTED", order);
  assert.match(mail.html, /Total: 12 pieces in 2 boxes/);
  assert.match(mail.html, /Total: 6 pieces in 1 box/);
  assert.match(mail.body, /Each box \\(6 pieces\\)/);
  assert.ok(mail.body.includes("4 × Sugar"));
  assert.ok(mail.body.includes("5 × Sesame"));
  assert.equal((mail.html.match(/Traditional Pan de Muerto mixed box/g) ?? []).length, 2);
});

test("missing or invalid historical pack composition is never fabricated from live catalog", () => {
  const order = fixtureOrder(false);
  order.lines = [{ productId: "pan-de-muerto-traditional-pack-6-mini", quantity: 1 }];
  order.catalogSnapshot = [{ id: "pan-de-muerto-traditional-pack-6-mini", name: "Historical mixed box" }] as Order["catalogSnapshot"];
  const mail = renderCustomerEmail("ORDER_OUT_FOR_DELIVERY", order);
  assert.ok(mail.html.includes("Historical mixed box"));
  assert.ok(mail.html.includes("Box composition unavailable in this email."));
  assert.ok(mail.body.includes("Box composition unavailable in this email."));
  assert.ok(!mail.html.includes("Sugar"));
});

test("Tricolor single preserves its frozen chosen color", () => {
  const order = fixtureOrder(false);
  const line = {
    productId: "conchas-traditional-tricolor-mini-40-g",
    quantity: 3,
    color: "green" as const,
  };
  order.lines = [{ ...line, packSnapshot: snapshotTricolor(line) }];
  order.catalogSnapshot = [{ id: line.productId, name: "Tricolor Concha Mini" }] as Order["catalogSnapshot"];
  const mail = renderCustomerEmail("ORDER_PRODUCTION_STARTED", order);
  assert.ok(mail.html.includes("3 × Tricolor Concha Mini"));
  assert.ok(mail.html.includes("Green · Mini · 40 g"));
  assert.ok(mail.body.includes("Selection: Green · Mini · 40 g"));
});

test("escaped pack-component names cannot become email markup", () => {
  const spec = PACK_SPECS.find((s) => s.packSkuId === "pan-de-muerto-traditional-pack-6-mini")!;
  const composition = [
    { componentSkuId: spec.components[0]!.componentSkuId, units: 6 },
  ];
  const order = fixtureOrder(false);
  order.lines = [{
    productId: spec.packSkuId,
    quantity: 1,
    composition,
    packSnapshot: {
      version: 1,
      revision: "catalog-v1-" + "b".repeat(64),
      capacity: 6,
      components: [{ ...composition[0]!, name: "<script>bad</script>" }],
    },
  }];
  order.catalogSnapshot = [{ id: spec.packSkuId, name: '<img src=x onerror="alert(1)">' }] as Order["catalogSnapshot"];
  const mail = renderCustomerEmail("ORDER_OUT_FOR_DELIVERY", order);
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(!mail.html.includes("<img"));
  assert.ok(mail.html.includes("&lt;script&gt;bad&lt;/script&gt;"));
  assert.ok(mail.html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
});
