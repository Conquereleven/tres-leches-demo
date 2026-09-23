import { MockWhatsAppProvider } from "../fixtures/providers";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PaymenntProvider,
  normalizeCheckout,
} from "../../server/adapters/paymennt";
import {
  MetaWhatsAppProvider,
  metaNumbersSchema,
  type MetaNumber,
} from "../../server/adapters/meta";
import { MapboxGeoProvider } from "../../server/adapters/mapbox";
import { GeocodingAdapter } from "../../server/adapters/geo";
import { Store } from "../fixtures/runtime";
import { CommerceService } from "../fixtures/runtime";

import { zoneSeed, matchZone, quoteOrder } from "../../server/domain/zones";
import { integrationConfig } from "../../server/config";
import type { Order } from "../../server/domain/model";
const fixture = {
  id: "checkout-123",
  requestId: "payment-1",
  orderId: "TL-TEST",
  amount: 130,
  currency: "AED",
  status: "PENDING",
  redirectUrl: "https://pay.test.paymennt.com/checkout/fixture",
};
const config = {
  apiKey: "fixture-key",
  apiSecret: "fixture-secret",
  environment: "test" as const,
};
const reply = (value: unknown) =>
  new Response(JSON.stringify({ success: true, result: value }), {
    status: 200,
  });
for (const status of [
  "PENDING",
  "AUTHORIZED",
  "PAID",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "PENDING_CONFIRMATION",
  "CHARGEBACK",
])
  test(`Paymennt preserves ${status}`, () => {
    assert.equal(
      normalizeCheckout({ ...fixture, status }).status,
      status.toLowerCase(),
    );
  });
test("Paymennt authenticates official requests, converts fils and never sends customer contact unnecessarily", async () => {
  const provider = new PaymenntProvider(config, async (url, init) => {
    assert.equal(
      String(url),
      "https://api.test.paymennt.com/mer/v2.0/checkout/link",
    );
    assert.equal(
      (init?.headers as Record<string, string>)["X-Paymennt-Api-Secret"],
      config.apiSecret,
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      requestId: fixture.requestId,
      orderId: fixture.orderId,
      description: `Tres Leches order ${fixture.orderId}`,
      amount: 130,
      currency: "AED",
      sendSms: false,
      sendEmail: false,
    });
    return reply(fixture);
  });
  const created = await provider.createPaymentLink({
    paymentId: fixture.requestId,
    orderId: fixture.orderId,
    amountFils: 13000,
    currency: "AED",
    idempotencyKey: fixture.requestId,
  });
  assert.equal(created.checkoutId, fixture.id);
  assert.equal(provider.idempotentCreate, false);
  assert.equal(provider.verifier.verify("{}", "invented-signature"), false);
});
for (const status of [400, 401, 429, 500, 503])
  test(`Paymennt HTTP ${status} never creates a success`, async () => {
    const provider = new PaymenntProvider(
      config,
      async () => new Response("secret should not escape", { status }),
    );
    await assert.rejects(
      provider.getStatus(fixture.id),
      (error) => error instanceof Error && !error.message.includes("secret"),
    );
  });
test("Paymennt timeout, malformed result, unknown status and unsafe URL fail closed", async () => {
  await assert.rejects(
    new PaymenntProvider(config, async () => {
      throw new DOMException("timeout", "TimeoutError");
    }).getStatus(fixture.id),
  );
  await assert.rejects(
    new PaymenntProvider(config, async () => reply({})).getStatus(fixture.id),
  );
  assert.throws(() =>
    normalizeCheckout({ ...fixture, status: "NEW_UNREVIEWED" }),
  );
  assert.throws(() => normalizeCheckout({ ...fixture, amount: 1.123 }));
  assert.throws(() =>
    normalizeCheckout({ ...fixture, redirectUrl: "http://insecure.invalid" }),
  );
});
function commerce() {
  const store = new Store(":memory:");
  let remote = { ...fixture };
  const provider = new PaymenntProvider(config, async (_url, init) => {
    if (init?.method === "POST") {
      const b = JSON.parse(String(init.body)) as typeof fixture;
      remote = { ...fixture, ...b };
    }
    return reply(remote);
  });
  const service = new CommerceService(
    store,
    new MockWhatsAppProvider(),
    provider,
  );
  const actor = { id: "liza", role: "admin" as const };
  const command = (body: unknown) => service.command(body, randomUUID(), actor);
  command({
    type: "assign",
    id: "conversation-wa2",
    version: 0,
    agent: "liza",
  });
  const o = command({
    type: "createOrder",
    id: "conversation-wa2",
    version: 1,
  }) as Order;
  command({
    type: "editOrder",
    id: o.id,
    version: o.version,
    lines: [{ productId: "tres", quantity: 1 }],
  });
  const zone = store.read().zones.find((z) => z.id === "jvc")!;
  command({ type: "updateZone", zone: { ...zone, deliveryFeeAed: 10 } });
  command({
    type: "manualZone",
    id: o.id,
    version: store.read().orders[0]!.version,
    zoneId: "jvc",
    reason: "Synthetic UAT fixture",
  });
  command({
    type: "requestPayment",
    id: o.id,
    version: store.read().orders[0]!.version,
  });
  return {
    store,
    service,
    actor,
    command,
    remote: (update: Partial<typeof fixture>) => {
      remote = { ...remote, ...update };
    },
  };
}
test("authoritative reconciliation verifies amount/currency/references; notifications cannot mark Paid", async () => {
  const f = commerce();
  try {
    await f.service.drain();
    const p = f.store.read().payments[0]!;
    assert.throws(() => f.service.paymentWebhook({}), /autoritativa/);
    for (const mismatch of [
      { amount: 129 },
      { currency: "USD" },
      { requestId: "wrong" },
      { orderId: "wrong" },
    ]) {
      f.remote({
        ...fixture,
        requestId: p.id,
        orderId: p.orderId,
        status: "PAID",
        ...mismatch,
      });
      await assert.rejects(f.service.reconcile(p.id, f.actor));
      assert.equal(f.store.read().orders[0]!.state, "Awaiting Payment");
    }
    f.remote({
      ...fixture,
      requestId: p.id,
      orderId: p.orderId,
      status: "AUTHORIZED",
    });
    await f.service.reconcile(p.id, f.actor);
    assert.equal(f.store.read().orders[0]!.state, "Awaiting Payment");
    f.remote({ status: "PAID" });
    await f.service.reconcile(p.id, f.actor);
    await f.service.reconcile(p.id, f.actor);
    assert.equal(f.store.read().orders[0]!.state, "Confirmed");
    assert.equal(
      f.store.read().orders[0]!.audit.filter((a) => a.to === "Paid").length,
      1,
    );
    f.remote({ status: "PENDING" });
    await f.service.reconcile(p.id, f.actor);
    assert.equal(f.store.read().payments[0]!.status, "paid");
    f.remote({ status: "REFUNDED" });
    await f.service.reconcile(p.id, f.actor);
    assert.equal(f.store.read().payments[0]!.status, "refunded");
    assert.throws(
      () =>
        f.command({
          type: "transition",
          id: p.orderId,
          version: f.store.read().orders[0]!.version,
          state: "Production",
        }),
      /revisión/,
    );
  } finally {
    f.store.close();
  }
});
const numbers: MetaNumber[] = [1, 2, 3].map((n) => ({
  id: `wa${n}` as MetaNumber["id"],
  label: `WA${n}`,
  phone: `+97150000000${n}`,
  phoneNumberId: String(n),
  wabaId: "100",
}));
test("Meta permits phased WA1 activation without synthetic WA2/WA3 mappings", () => {
  assert.deepEqual(metaNumbersSchema.parse([numbers[0]]), [numbers[0]]);
  assert.throws(() => metaNumbersSchema.parse([]));
  assert.throws(() =>
    metaNumbersSchema.parse([
      numbers[0],
      { ...numbers[1], phone: numbers[0]!.phone },
    ]),
  );
});
const metaConfig = {
  token: "fixture-token",
  appSecret: "fixture-secret-at-least-24-characters",
  verifyToken: "fixture-verify-at-least-24-characters",
  version: "v99.0",
  numbers,
};
test("Meta routes each configured number, validates origin and refuses outside-window free text", async () => {
  const sent: string[] = [];
  const meta = new MetaWhatsAppProvider(metaConfig, async (url) => {
    sent.push(String(url));
    return new Response(
      JSON.stringify({ messages: [{ id: "wamid.synthetic" }] }),
    );
  });
  for (const n of numbers)
    await meta.send({
      sourceNumberId: n.id,
      sourcePhoneNumber: n.phone,
      recipient: "971500000099",
      text: "Fixture",
      lastInboundAt: new Date().toISOString(),
      idempotencyKey: randomUUID(),
    });
  assert.deepEqual(
    sent.map((s) => s.split("/").at(-2)),
    ["1", "2", "3"],
  );
  await assert.rejects(
    meta.send({
      sourceNumberId: "wa2",
      sourcePhoneNumber: numbers[0]!.phone,
      recipient: "971500000099",
      text: "Fixture",
      idempotencyKey: randomUUID(),
    }),
  );
  await assert.rejects(
    meta.send({
      sourceNumberId: "wa2",
      sourcePhoneNumber: numbers[1]!.phone,
      recipient: "971500000099",
      text: "Fixture",
      idempotencyKey: randomUUID(),
    }),
  );
  assert.equal(sent.length, 3);
});
test("Meta normalizes a batch, GPS and unsupported messages; verifies challenge and signatures", () => {
  const meta = new MetaWhatsAppProvider(metaConfig);
  const value = {
    metadata: { phone_number_id: "2" },
    messages: [
      {
        id: "a",
        from: "971500000099",
        timestamp: "1700000000",
        type: "text",
        text: { body: "hello" },
      },
      {
        id: "b",
        from: "971500000099",
        timestamp: "1700000000",
        type: "location",
        location: { latitude: 25, longitude: 55 },
      },
      { id: "c", from: "971500000099", timestamp: "1700000000", type: "image" },
    ],
    statuses: [{ id: "outbound", status: "read", timestamp: "1700000001" }],
  };
  const raw = {
    object: "whatsapp_business_account",
    entry: [{ id: "100", changes: [{ field: "messages", value }] }],
  };
  const events = meta.normalize(raw);
  assert.equal(events.length, 4);
  assert.equal(events[1]!.type, "message");
  assert.equal(
    meta.challenge(
      new URLSearchParams({
        "hub.mode": "subscribe",
        "hub.verify_token": metaConfig.verifyToken,
        "hub.challenge": "123",
      }),
    ),
    "123",
  );
  assert.equal(meta.challenge(new URLSearchParams()), null);
  const encoded = JSON.stringify(raw);
  assert.equal(
    meta.verifier.verify(encoded, meta.verifier.sign(encoded)),
    true,
  );
  assert.equal(
    meta.verifier.verify(encoded + " ", meta.verifier.sign(encoded)),
    false,
  );
});
test("Mapbox requests permanent AE results; canonical evidence never supplies commercial prices", async () => {
  const provider = new MapboxGeoProvider("fixture", async (url) => {
    const u = new URL(String(url));
    assert.equal(u.searchParams.get("permanent"), "true");
    assert.equal(u.searchParams.get("country"), "AE");
    return new Response(
      JSON.stringify({
        features: [
          {
            properties: {
              name: "Jumeirah Village Circle",
              mapbox_id: "synthetic",
              feature_type: "neighborhood",
            },
          },
        ],
      }),
    );
  });
  const geo = new GeocodingAdapter(provider);
  const point = { lat: 25, lng: 55 };
  await geo.prepare(point);
  assert.equal(matchZone(zoneSeed, undefined, point, geo)?.id, "jvc");
  assert.equal(
    quoteOrder(
      zoneSeed,
      [{ productId: "tres", quantity: 1 }],
      undefined,
      point,
      geo,
    ).eligible,
    false,
  );
  assert.equal(
    matchZone(
      [{ ...zoneSeed[0]!, canonicalIds: ["mapbox:synthetic"] }],
      undefined,
      point,
      geo,
    )?.id,
    zoneSeed[0]!.id,
  );
  await assert.rejects(
    provider.lookup({ lat: 100, lng: 55 }, AbortSignal.timeout(1000)),
  );
});
test("online SQLite backup restores uncheckpointed records and command receipts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tl-backup-"));
  const store = new Store(join(dir, "live.sqlite"));
  try {
    store.write((s) => {
      s.commands["fixture"] = { hash: "durable", result: { id: "fixture" } };
    });
    await store.backup(join(dir, "backup.sqlite"));
    const restored = new Store(join(dir, "backup.sqlite"));
    try {
      assert.equal(restored.read().commands.fixture?.hash, "durable");
      assert.equal(restored.read().zones.length, 91);
    } finally {
      restored.close();
    }
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("integration activation fails without credentials and never allows live payments", () => {
  assert.equal(integrationConfig({}), null);
  assert.throws(() => integrationConfig({ INTEGRATION_MODE: "true" }));
});

test("uncertain Paymennt creation recovers by requestId without another POST or duplicate link", async () => {
  const f = commerce();
  try {
    let posts = 0;
    let remote = { ...fixture };
    f.service.payment = new PaymenntProvider(config, async (url, init) => {
      if (init?.method === "POST") {
        posts++;
        remote = { ...fixture, ...JSON.parse(String(init.body)) };
        throw new DOMException("Lost response", "TimeoutError");
      }
      if (String(url).includes("?requestId="))
        return reply({ totalPages: 1, content: [remote] });
      return reply(remote);
    });
    await f.service.drain();
    assert.equal(f.store.read().jobs[0]!.status, "unknown");
    const p = f.store.read().payments[0]!;
    await f.service.reconcile(p.id, f.actor);
    await f.service.drain();
    await f.service.reconcile(p.id, f.actor);
    assert.equal(posts, 1);
    assert.equal(
      f.store
        .read()
        .conversations.find((c) => c.id === "conversation-wa2")!
        .messages.filter((m) => m.direction === "out").length,
      1,
    );
    assert.equal(f.store.read().payments[0]!.providerReference, fixture.id);
  } finally {
    f.store.close();
  }
});
test("Meta payment template requires explicit configuration and receives only approved parameter order", async () => {
  let sent: unknown;
  const meta = new MetaWhatsAppProvider(
    {
      ...metaConfig,
      paymentTemplate: { name: "approved_fixture", language: "en" },
    },
    async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({ messages: [{ id: "synthetic-template" }] }),
      );
    },
  );
  await meta.send({
    sourceNumberId: "wa2",
    sourcePhoneNumber: numbers[1]!.phone,
    recipient: "971500000099",
    text: "Unused outside window",
    idempotencyKey: "fixture",
    paymentContext: { amountAed: "130.00", url: fixture.redirectUrl },
  });
  assert.deepEqual(sent, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "971500000099",
    type: "template",
    template: {
      name: "approved_fixture",
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "130.00" },
            { type: "text", text: fixture.redirectUrl },
          ],
        },
      ],
    },
  });
});
test("durable inbound batches survive restart, deduplicate and retain GPS during geocoder outage", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tl-inbound-"));
  const path = join(dir, "inbound.sqlite");
  let store = new Store(path);
  const payment = new PaymenntProvider(config, async () => reply(fixture));
  let service = new CommerceService(store, new MockWhatsAppProvider(), payment);
  const event = {
    type: "message",
    eventId: "durable-gps",
    sourceNumberId: "wa2",
    phone: "+971500001001",
    customer: "Synthetic",
    text: "GPS",
    location: { lat: 25, lng: 55 },
  };
  service.acceptInboundBatch([event, event]);
  store.close();
  store = new Store(path);
  try {
    service = new CommerceService(store, new MockWhatsAppProvider(), payment, {
      prepare: async () => {
        throw new Error("unavailable");
      },
      resolve: () => null,
    });
    await service.drain();
    assert.equal(store.read().inboundDeliveries?.length, 1);
    assert.equal(store.read().inboundDeliveries?.[0]?.status, "done");
    assert.equal(
      store
        .read()
        .conversations.flatMap((c) => c.messages)
        .filter((m) => m.id === event.eventId).length,
      1,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("synthetic Dubai source fixtures cover tiers without inventing coordinate boundaries", () => {
  for (const [address, minimum] of [
    ["JLT Cluster O", 30],
    ["Marina", 50],
    ["JVC", 100],
    ["Dubai Hills", 150],
    ["DIP", 200],
    ["Damac Hills", 250],
    ["Deira", 300],
  ] as const)
    assert.equal(matchZone(zoneSeed, address)?.minOrderAed, minimum);
  assert.equal(matchZone(zoneSeed, "JLT Cluster B")?.freeDelivery, true);
  assert.equal(matchZone(zoneSeed, "Palm Jumeirah"), null);
  assert.equal(matchZone(zoneSeed, "Al Ain"), null);
  assert.equal(
    matchZone(
      zoneSeed,
      undefined,
      { lat: 25, lng: 55 },
      { resolve: () => null },
    ),
    null,
  );
});
test("integration store never promotes demo records and starts with zero fictitious conversations", () => {
  const dir = mkdtempSync(join(tmpdir(), "tl-modes-"));
  try {
    const original = new Store(join(dir, "demo.sqlite"));
    original.close();
    assert.throws(
      () => new Store(join(dir, "demo.sqlite"), false),
      /separate database/,
    );
    const integration = new Store(join(dir, "integration.sqlite"), false);
    try {
      assert.equal(integration.read().conversations.length, 0);
      assert.equal(integration.read().zones.length, 91);
    } finally {
      integration.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("manager can reassign while operator cannot take another operator's conversation or edit zones", () => {
  const f = commerce();
  try {
    const c = f.store
      .read()
      .conversations.find((c) => c.id === "conversation-wa2")!;
    assert.throws(() =>
      f.service.command(
        { type: "assign", id: c.id, version: c.version, agent: "andrea" },
        randomUUID(),
        { id: "andrea", role: "operator" },
      ),
    );
    f.service.command(
      { type: "assign", id: c.id, version: c.version, agent: "andrea" },
      randomUUID(),
      { id: "manager", role: "manager" },
    );
    assert.equal(
      f.store.read().conversations.find((item) => item.id === c.id)
        ?.assignedAgent,
      "andrea",
    );
    assert.throws(() =>
      f.service.command(
        { type: "updateZone", zone: f.store.read().zones[0]! },
        randomUUID(),
        { id: "andrea", role: "operator" },
      ),
    );
  } finally {
    f.store.close();
  }
});

test("official-adapter HTTP fixtures: WA2 inbound → GPS → Paymennt link through WA2 → authoritative Paid → Delivered", async () => {
  const store = new Store(":memory:", false);
  const outbound: { url: string; body: { text?: { body: string } } }[] = [];
  const meta = new MetaWhatsAppProvider(metaConfig, async (url, init) => {
    outbound.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ messages: [{ id: "golden-wamid" }] }));
  });
  let checkout = { ...fixture };
  const payment = new PaymenntProvider(config, async (_url, init) => {
    if (init?.method === "POST")
      checkout = { ...fixture, ...JSON.parse(String(init.body)) };
    return reply(checkout);
  });
  const geo = new GeocodingAdapter(
    new MapboxGeoProvider(
      "synthetic",
      async () =>
        new Response(
          JSON.stringify({
            features: [
              {
                properties: {
                  name: "Jumeirah Village Circle",
                  mapbox_id: "synthetic",
                  feature_type: "neighborhood",
                },
              },
            ],
          }),
        ),
    ),
  );
  const service = new CommerceService(
    store,
    meta,
    payment,
    geo,
    10000,
    numbers,
  );
  const actor = { id: "liza", role: "admin" as const };
  const command = (body: unknown) => service.command(body, randomUUID(), actor);
  try {
    service.acceptInboundBatch(
      meta.normalize({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "100",
            changes: [
              {
                field: "messages",
                value: {
                  metadata: { phone_number_id: "2" },
                  messages: [
                    {
                      id: "golden-inbound",
                      from: "971500000099",
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: "location",
                      location: { latitude: 25, longitude: 55 },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    );
    await service.drain();
    const conversation = store.read().conversations[0]!;
    assert.equal(conversation.sourceNumberId, "wa2");
    command({
      type: "assign",
      id: conversation.id,
      version: conversation.version,
      agent: actor.id,
    });
    const order = command({
      type: "createOrder",
      id: conversation.id,
      version: store.read().conversations[0]!.version,
    }) as Order;
    command({
      type: "updateZone",
      zone: {
        ...store.read().zones.find((z) => z.id === "jvc")!,
        deliveryFeeAed: 10,
      },
    });
    command({
      type: "editOrder",
      id: order.id,
      version: order.version,
      lines: [{ productId: "tres", quantity: 1 }],
    });
    command({
      type: "requestPayment",
      id: order.id,
      version: store.read().orders[0]!.version,
    });
    await service.drain();
    assert.equal(outbound.length, 1);
    assert.match(outbound[0]!.url, /\/2\/messages$/);
    assert.match(outbound[0]!.body.text!.body, /pay\.test\.paymennt\.com/);
    checkout.status = "PAID";
    await service.reconcile(store.read().payments[0]!.id, actor);
    for (const state of [
      "Production",
      "Ready",
      "Out for Delivery",
      "Delivered",
    ])
      command({
        type: "transition",
        id: order.id,
        version: store.read().orders[0]!.version,
        state,
      });
    assert.equal(store.read().orders[0]!.state, "Delivered");
    assert.equal(outbound.length, 1);
  } finally {
    store.close();
  }
});

test("delivery acknowledgment preserves operator version while another operator command remains guarded", async () => {
  const store = new Store(":memory:");
  const service = new CommerceService(
    store,
    new MockWhatsAppProvider(),
    new PaymenntProvider(config, async () => reply(fixture)),
  );
  const actor = { id: "liza", role: "admin" as const };
  try {
    service.command(
      { type: "assign", id: "conversation-wa2", version: 0, agent: actor.id },
      randomUUID(),
      actor,
    );
    service.command(
      {
        type: "send",
        id: "conversation-wa2",
        version: 1,
        text: "Synthetic receipt",
      },
      randomUUID(),
      actor,
    );
    const version = store
      .read()
      .conversations.find((c) => c.id === "conversation-wa2")!.version;
    await service.drain();
    assert.equal(
      store.read().conversations.find((c) => c.id === "conversation-wa2")!
        .version,
      version,
    );
    service.command(
      { type: "createOrder", id: "conversation-wa2", version },
      randomUUID(),
      actor,
    );
    assert.throws(() =>
      service.command(
        { type: "send", id: "conversation-wa2", version, text: "stale" },
        randomUUID(),
        actor,
      ),
    );
  } finally {
    store.close();
  }
});
