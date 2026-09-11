import { quoteOrder } from "../fixtures/runtime";
import { matchZone } from "../fixtures/runtime";
import { MockWhatsAppProvider } from "../fixtures/providers";
import { MockPaymentProvider } from "../fixtures/providers";
import test from "node:test";
import assert from "node:assert/strict";
import { Store, seed } from "../fixtures/runtime";
import { CommerceService } from "../fixtures/runtime";
import {
  HmacVerifier,
  type WhatsAppProvider,
} from "../../server/adapters/providers";
import {
  zoneSeed,
  contains,
} from "../../server/domain/zones";
import {
  zoneSchema,
  type Order,
  type Actor,
  type DeliveryZone,
} from "../../server/domain/model";
import { transition } from "../../server/domain/workflow";
import { randomUUID } from "node:crypto";
const admin: Actor = { id: "liza", role: "admin" },
  agent: Actor = { id: "andrea", role: "agent" };
const verifier = new HmacVerifier("test-secret-with-at-least-24-characters");
function fixture(wa: WhatsAppProvider = new MockWhatsAppProvider()) {
  const store = new Store(":memory:");
  const service = new CommerceService(
    store,
    wa,
    new MockPaymentProvider(
      verifier,
      (reference) =>
        store.read().payments.find((p) => p.providerReference === reference)
          ?.status,
    ),
  );
  return {
    store,
    service,
    cmd: (body: unknown, actor = admin) =>
      service.command(body, randomUUID(), actor),
  };
}
function setup(f: ReturnType<typeof fixture>) {
  f.cmd({ type: "assign", id: "conversation-wa2", version: 0, agent: "liza" });
  const o = f.cmd({
    type: "createOrder",
    id: "conversation-wa2",
    version: 1,
  }) as Order;
  f.cmd({
    type: "editOrder",
    id: o.id,
    version: o.version,
    lines: [{ productId: "tres", quantity: 1 }],
  });
  return o.id;
}
function ready(f: ReturnType<typeof fixture>) {
  const id = setup(f);
  const z = f.store.read().zones.find((z) => z.id === "jvc")!;
  f.cmd({
    type: "updateZone",
    zone: {
      ...z,
      deliveryFeeAed: 10,
      review: "Test fixture, not a source rate",
    },
  });
  f.service.inbound({
    type: "message",
    eventId: "gps-wa2",
    sourceNumberId: "wa2",
    phone: "+971500001001",
    customer: "Valentina García",
    text: "GPS",
    location: { lat: 25.0657, lng: 55.2089 },
  });
  return id;
}
const current = (f: ReturnType<typeof fixture>, id: string) =>
  f.store.read().orders.find((o) => o.id === id)!;
test("seed preserves every source band, explicit free delivery and unknown fees", () => {
  assert.deepEqual(
    [...new Set(zoneSeed.map((z) => z.minOrderAed))],
    [30, 50, 100, 150, 200, 250, 300, null],
  );
  assert.equal(zoneSeed.filter((z) => z.freeDelivery).length, 3);
  for (const z of zoneSeed) zoneSchema.parse(z);
  assert.equal(zoneSeed.find((z) => z.name === "REMRAN")?.minOrderAed, 300);
  assert.equal(zoneSeed.find((z) => z.id === "jvc")?.deliveryFeeAed, null);
  assert.equal(
    zoneSeed.find((z) => z.id === "jlt-cluster-b")?.minOrderAed,
    null,
  );
});
test("longest alias matching, case, word boundaries and ambiguous locations", () => {
  assert.equal(
    matchZone(zoneSeed, "Villa 12, jumeirah village circle")?.id,
    "jvc",
  );
  assert.equal(matchZone(zoneSeed, "Jebel Ali Village")?.minOrderAed, 50);
  assert.equal(matchZone(zoneSeed, "Jebel Ali Downtown")?.minOrderAed, 300);
  assert.equal(matchZone(zoneSeed, "Palm Jumeirah"), null);
  assert.equal(matchZone(zoneSeed, "JLT"), null);
  assert.equal(matchZone(zoneSeed, "JVCfoo"), null);
  assert.equal(matchZone(zoneSeed, "Jumeirah 10"), null);
  assert.equal(matchZone(zoneSeed, "Al Ain"), null);
  assert.equal(matchZone(zoneSeed, "JVC or Dubai Hills"), null);
});
test("GPS mock recognizes only exact fixture; polygons include edges and respect priority", () => {
  assert.equal(
    matchZone(zoneSeed, undefined, { lat: 25.0657, lng: 55.2089 })?.id,
    "jvc",
  );
  assert.equal(matchZone(zoneSeed, "JVC", { lat: 0, lng: 0 }), null);
  const polygon = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 2 },
    { lat: 2, lng: 2 },
    { lat: 2, lng: 0 },
  ];
  assert.equal(contains({ lat: 1, lng: 0 }, polygon), true);
  assert.equal(contains({ lat: 3, lng: 0 }, polygon), false);
  const a = { ...zoneSeed[0]!, polygon, priority: 1 },
    b = { ...zoneSeed[1]!, polygon, priority: 2 };
  assert.equal(matchZone([a, b], undefined, { lat: 1, lng: 1 })?.id, b.id);
  assert.equal(
    matchZone([a, { ...b, priority: 1 }], undefined, { lat: 1, lng: 1 }),
    null,
  );
});
test("minimum uses subtotal, fee never fills shortfall; null does not mean free", () => {
  let z: DeliveryZone = {
    ...zoneSeed.find((z) => z.id === "jvc")!,
    deliveryFeeAed: 60,
  };
  const q = quoteOrder([z], [{ productId: "pan", quantity: 1 }], "JVC");
  assert.equal(q.minimumMet, false);
  assert.equal(q.eligible, false);
  assert.equal(q.totalFils, 12800);
  z = { ...z, freeDelivery: true, deliveryFeeAed: 0, minOrderAed: 68 };
  assert.equal(
    quoteOrder([z], [{ productId: "pan", quantity: 1 }], "JVC").eligible,
    true,
  );
  assert.equal(
    quoteOrder(
      [{ ...z, active: false }],
      [{ productId: "pan", quantity: 1 }],
      "JVC",
    ).eligible,
    false,
  );
  assert.equal(
    quoteOrder(zoneSeed, [{ productId: "tres", quantity: 1 }], "JVC").eligible,
    false,
  );
});
test("version and assignment prevent simultaneous responses; command receipts reject key reuse", () => {
  const f = fixture();
  f.cmd({ type: "assign", id: "conversation-wa2", version: 0, agent: "liza" });
  assert.throws(() =>
    f.cmd(
      { type: "assign", id: "conversation-wa2", version: 0, agent: "andrea" },
      agent,
    ),
  );
  assert.throws(() =>
    f.cmd(
      { type: "send", id: "conversation-wa2", version: 1, text: "hello" },
      agent,
    ),
  );
  const key = randomUUID(),
    cmd = { type: "send", id: "conversation-wa2", version: 1, text: "hello" };
  f.service.command(cmd, key, admin);
  f.service.command(cmd, key, admin);
  assert.equal(f.store.read().conversations[1]!.messages.length, 2);
  assert.throws(() =>
    f.service.command({ ...cmd, text: "different" }, key, admin),
  );
  f.store.close();
});
test("admin zone updates validated and RBAC enforced", () => {
  const f = fixture(),
    zone = f.store.read().zones[0]!;
  assert.throws(() =>
    f.cmd({
      type: "updateZone",
      zone: { ...zone, freeDelivery: true, deliveryFeeAed: 9 },
    }),
  );
  assert.throws(() => f.cmd({ type: "updateZone", zone }, agent));
  f.cmd({ type: "updateZone", zone: { ...zone, deliveryFeeAed: 9 } });
  assert.throws(() => f.cmd({ type: "updateZone", zone }));
  f.store.close();
});
test("golden path: WA2 → order → GPS → minimum → payment → confirmed → delivered", async () => {
  const sent: Parameters<WhatsAppProvider["send"]>[0][] = [];
  const wa: WhatsAppProvider = {
    idempotentSend: true,
    send: async (input) => {
      sent.push(input);
      return { providerId: "wamid-" + input.idempotencyKey, status: "sent" };
    },
  };
  const f = fixture(wa),
    id = ready(f);
  assert.equal(current(f, id).quote?.zoneId, "jvc");
  f.cmd({ type: "requestPayment", id, version: current(f, id).version });
  await f.service.drain();
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.sourceNumberId, "wa2");
  assert.equal(
    sent[0]!.sourcePhoneNumber,
    seed().conversations[1]!.sourcePhoneNumber,
  );
  const p = f.store.read().payments[0]!;
  assert.equal(p.amountFils, 13000);
  const event = {
    eventId: "paid-1",
    reference: p.providerReference,
    transactionId: "tx-1",
    status: "paid",
    amountFils: 13000,
    currency: "AED",
  };
  f.service.paymentWebhook(event);
  f.service.paymentWebhook(event);
  assert.equal(current(f, id).state, "Confirmed");
  assert.equal(await f.service.payment.getStatus(p.providerReference!), "paid");
  for (const state of ["Production", "Ready", "Out for Delivery", "Delivered"])
    f.cmd({ type: "transition", id, version: current(f, id).version, state });
  assert.equal(current(f, id).state, "Delivered");
  assert.equal(current(f, id).audit.filter((a) => a.to === "Paid").length, 1);
  f.store.close();
});
test("payment amount mismatch and invalid transitions cannot fulfill orders", async () => {
  const f = fixture(),
    id = ready(f);
  assert.throws(() =>
    f.cmd({
      type: "transition",
      id,
      version: current(f, id).version,
      state: "Paid",
    }),
  );
  f.cmd({ type: "requestPayment", id, version: current(f, id).version });
  await f.service.drain();
  const p = f.store.read().payments[0]!;
  assert.throws(() =>
    f.service.paymentWebhook({
      eventId: "bad",
      reference: p.providerReference,
      transactionId: "tx",
      status: "paid",
      amountFils: 1,
      currency: "AED",
    }),
  );
  assert.equal(current(f, id).state, "Awaiting Payment");
  assert.throws(() =>
    f.cmd({
      type: "editOrder",
      id,
      version: current(f, id).version,
      lines: [],
    }),
  );
  assert.throws(() =>
    f.cmd({
      type: "transition",
      id,
      version: current(f, id).version,
      state: "Cancelled",
    }),
  );
  assert.throws(() => transition(current(f, id), "Delivered", "liza"));
  f.store.close();
});
test("expired links reopen builder; late paid event is flagged without resurrecting cancellation", async () => {
  const f = fixture(),
    id = ready(f);
  f.cmd({ type: "requestPayment", id, version: current(f, id).version });
  await f.service.drain();
  const p = f.store.read().payments[0]!,
    base = {
      reference: p.providerReference,
      transactionId: "tx-late",
      amountFils: p.amountFils,
      currency: "AED",
    };
  f.service.paymentWebhook({ ...base, eventId: "expired", status: "expired" });
  assert.equal(current(f, id).state, "Building");
  f.cmd({
    type: "transition",
    id,
    version: current(f, id).version,
    state: "Cancelled",
  });
  f.service.paymentWebhook({ ...base, eventId: "late-paid", status: "paid" });
  assert.equal(current(f, id).state, "Cancelled");
  assert.equal(f.store.read().payments[0]!.status, "paid");
  assert.ok(
    f.store
      .read()
      .payments[0]!.timeline.some((e) =>
        e.action.includes("Revisión requerida"),
      ),
  );
  f.store.close();
});
test("inbound deduplication, number isolation and invalid GPS", () => {
  const f = fixture();
  const event = {
    type: "message",
    eventId: "in-1",
    sourceNumberId: "wa2",
    phone: "+971500000009",
    customer: "Demo",
    text: "Hello",
  };
  f.service.inbound(event);
  f.service.inbound(event);
  assert.equal(f.store.read().conversations.length, 4);
  f.service.inbound({ ...event, eventId: "in-2", sourceNumberId: "wa3" });
  assert.equal(f.store.read().conversations.length, 5);
  assert.throws(() =>
    f.service.inbound({ ...event, eventId: "in-3", sourceNumberId: "wa4" }),
  );
  assert.throws(() =>
    f.service.inbound({
      ...event,
      eventId: "in-4",
      location: { lat: 100, lng: 55 },
    }),
  );
  f.store.close();
});
test("HMAC rejects mutations, wrong lengths and unsigned events", () => {
  const raw = '{"eventId":"1"}',
    signature = verifier.sign(raw);
  assert.equal(verifier.verify(raw, signature), true);
  assert.equal(verifier.verify(raw + " ", signature), false);
  assert.equal(verifier.verify(raw, ""), false);
});
test("failed non-idempotent sends are uncertain and never automatically duplicated", async () => {
  const f = fixture({
    idempotentSend: false,
    send: async () => {
      throw new Error("timeout");
    },
  });
  f.cmd({ type: "assign", id: "conversation-wa2", version: 0, agent: "liza" });
  f.cmd({ type: "send", id: "conversation-wa2", version: 1, text: "hi" });
  await f.service.drain();
  assert.equal(f.store.read().jobs[0]!.status, "unknown");
  assert.throws(() =>
    f.cmd({ type: "retryJob", id: f.store.read().jobs[0]!.id }),
  );
  await f.service.drain();
  assert.equal(f.store.read().jobs[0]!.attempts, 1);
  f.store.close();
});
test("status events never regress read receipts", async () => {
  const f = fixture();
  f.cmd({ type: "assign", id: "conversation-wa2", version: 0, agent: "liza" });
  f.cmd({ type: "send", id: "conversation-wa2", version: 1, text: "hi" });
  await f.service.drain();
  const m = f.store.read().conversations[1]!.messages[1]!;
  f.service.inbound({
    type: "status",
    eventId: "read",
    providerId: m.providerId,
    status: "read",
  });
  f.service.inbound({
    type: "status",
    eventId: "old-sent",
    providerId: m.providerId,
    status: "sent",
  });
  assert.equal(f.store.read().conversations[1]!.messages[1]!.status, "read");
  f.store.close();
});

test("idempotent provider failures use bounded retries and expose a recoverable job", async () => {
  let calls = 0;
  const f = fixture({
    idempotentSend: true,
    send: async () => {
      calls++;
      throw new Error("unavailable");
    },
  });
  f.cmd({ type: "assign", id: "conversation-wa2", version: 0, agent: "liza" });
  f.cmd({ type: "send", id: "conversation-wa2", version: 1, text: "hello" });
  for (let i = 0; i < 3; i++) {
    f.store.write((s) => {
      s.jobs[0]!.nextAt = 0;
    });
    await f.service.drain();
  }
  assert.equal(calls, 3);
  assert.equal(f.store.read().jobs[0]!.status, "failed");
  f.cmd({ type: "retryJob", id: f.store.read().jobs[0]!.id });
  assert.equal(f.store.read().jobs[0]!.status, "pending");
  f.store.close();
});
test("hanging provider calls time out without blocking the queue forever", async () => {
  const store = new Store(":memory:");
  const service = new CommerceService(
    store,
    { idempotentSend: false, send: () => new Promise(() => {}) },
    new MockPaymentProvider(verifier),
    undefined,
    10,
  );
  service.command(
    { type: "assign", id: "conversation-wa2", version: 0, agent: "liza" },
    randomUUID(),
    admin,
  );
  service.command(
    { type: "send", id: "conversation-wa2", version: 1, text: "hello" },
    randomUUID(),
    admin,
  );
  await service.drain();
  assert.equal(store.read().jobs[0]!.status, "unknown");
  store.close();
});

test("async geocoder boundary prepares network results before pure zone matching", async () => {
  const { GeocodingAdapter } = await import("../../server/adapters/geo");
  let calls = 0;
  const geo = new GeocodingAdapter({
    lookup: async (_point, signal) => {
      assert.equal(signal.aborted, false);
      calls++;
      return { address: "Jumeirah Village Circle" };
    },
  });
  const point = { lat: 25, lng: 55 };
  assert.equal(matchZone(zoneSeed, undefined, point, geo), null);
  await geo.prepare(point);
  await geo.prepare(point);
  assert.equal(calls, 1);
  assert.equal(matchZone(zoneSeed, undefined, point, geo)?.id, "jvc");
});
