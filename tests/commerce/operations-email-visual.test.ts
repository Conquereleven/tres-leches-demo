import test from "node:test";
import assert from "node:assert/strict";
import {
  kitchenEmailFixture,
  kitchenEmailPreview,
} from "../fixtures/kitchen-email";
import { recordPaidOperationsEmail } from "../../server/domain/operations-email";
import { dispatchCustomerNotifications } from "../../server/domain/customer-notifications";
import { ResendEmailProvider } from "../../server/adapters/resend";
import { Store } from "../../server/db/store";
import { PACK_SPECS, componentName } from "../../shared/pack-composition";

function record(f = kitchenEmailFixture(), origin = "https://www.3ldubai.ae") {
  return recordPaidOperationsEmail(
    f.state,
    f.order,
    f.payment,
    ["kitchen@example.invalid"],
    origin,
  )[0]!;
}
test("HTML and text show each parent before its own frozen composition; boxes never become separate product charges", () => {
  const { order, payment } = kitchenEmailFixture();
  const message = kitchenEmailPreview();
  assert.equal((message.html!.match(/PACK \/ BOX/g) ?? []).length, 3);
  assert.equal((message.html!.match(/INDIVIDUAL PRODUCT/g) ?? []).length, 1);
  assert.ok(
    message.body.indexOf("2 × Pan de Muerto") <
      message.body.indexOf("INSIDE EACH BOX:"),
  );
  assert.match(message.body, /4 × Sugar\n- 2 × Sugar with chocolate covering/);
  assert.match(message.body, /TOTAL: 12 pieces · 2 boxes/);
  assert.match(message.body, /TOTAL: 6 pieces · 1 box/);
  assert.match(message.body, /TOTAL: 12 pieces · 1 box/);
  assert.match(message.body, /AED 60.00 per box · AED 120.00 line total/);
  assert.match(message.body, /Total paid: AED 441.00/);
  assert.equal(payment.amountFils, 44100);
  assert.equal(order.lines.length, 4);
  assert.ok(!message.body.includes("do not reconcile"));
  assert.equal((message.body.match(/INSIDE /g) ?? []).length, 3);
  assert.match(message.html!, /<html lang="en" dir="ltr">/);
  assert.match(message.html!, /<table lang="en" dir="ltr" role="presentation"/);
});
test("all eight Pan formats use accepted snapshot capacity, sizes, fixed price and component names", () => {
  for (const spec of PACK_SPECS) {
    const f = kitchenEmailFixture();
    const product = structuredClone(
      f.catalog.find((p) => p.id === spec.packSkuId)!,
    );
    const component = spec.components[0]!.componentSkuId;
    f.order.lines = [
      {
        productId: spec.packSkuId,
        quantity: 3,
        composition: [{ componentSkuId: component, units: spec.capacity }],
        packSnapshot: {
          version: 1,
          revision: `catalog-v1-${"a".repeat(64)}`,
          capacity: spec.capacity,
          components: [
            {
              componentSkuId: component,
              units: spec.capacity,
              name: componentName(component, "en"),
            },
          ],
        },
      },
    ];
    f.order.catalogSnapshot = [product];
    f.order.quote = null;
    f.payment.amountFils = product.priceFils * 3;
    const m = record(f);
    assert.match(
      m.body,
      new RegExp(`TOTAL: ${spec.capacity * 3} pieces · 3 boxes`),
    );
    assert.ok(m.body.includes(componentName(component, "en")));
    assert.ok(!m.body.includes("do not reconcile"));
  }
});
test("missing, corrupt and inconsistent preparation snapshots warn instead of inventing components", () => {
  const cases = [
    (f: ReturnType<typeof kitchenEmailFixture>) => {
      delete f.order.lines[1]!.packSnapshot;
    },
    (f: ReturnType<typeof kitchenEmailFixture>) => {
      f.order.lines[1]!.packSnapshot!.components[0]!.units = 99;
    },
    (f: ReturnType<typeof kitchenEmailFixture>) => {
      delete f.order.lines[1]!.composition;
    },
    (f: ReturnType<typeof kitchenEmailFixture>) => {
      f.order.lines[1]!.packSnapshot!.components[0]!.componentSkuId = "unknown";
    },
  ];
  for (const mutate of cases) {
    const f = kitchenEmailFixture();
    mutate(f);
    f.order.lines = [f.order.lines[1]!];
    const m = record(f);
    assert.match(m.body, /MANUAL REVIEW REQUIRED: Pack composition/);
    assert.ok(!m.body.includes("INSIDE "));
    assert.ok(!m.html!.includes("<li"));
  }
});
test("historical singles and non-personalized packs retain their stored identity and never consult current catalog", () => {
  const f = kitchenEmailFixture();
  f.order.lines = [
    f.order.lines[0]!,
    { productId: f.order.lines[1]!.productId, quantity: 1 },
  ];
  f.state.catalog = [
    {
      id: f.order.lines[0]!.productId,
      name: "CURRENT CATALOG MUST NOT APPEAR",
      priceFils: 99999,
      active: true,
    },
  ];
  const m = record(f);
  assert.ok(!m.body.includes("CURRENT CATALOG"));
  assert.match(m.body, /Concha/);
  assert.match(m.body, /Pack composition missing or invalid/);
  assert.ok(!m.body.includes("INSIDE "));
});
test("legacy Conchas packs remain packs with manual preparation review, never individual products", () => {
  const f = kitchenEmailFixture();
  const product = structuredClone(
    f.catalog.find((p) => p.id === "conchas-filled-pack-6-mini")!,
  );
  f.order.lines = [{ productId: product.id, quantity: 1 }];
  f.order.catalogSnapshot = [product];
  f.order.quote = null;
  f.payment.amountFils = product.priceFils;
  const m = record(f);
  assert.match(m.html!, /PACK \/ BOX/);
  assert.ok(!m.html!.includes("INDIVIDUAL PRODUCT"));
  assert.match(m.body, /MANUAL REVIEW REQUIRED: Pack composition/);
  assert.ok(!m.body.includes("INSIDE "));
});
test("customer notes/allergies remain complete, unchanged and escaped; unsafe link origins never become hrefs", () => {
  const f = kitchenEmailFixture();
  const notes =
    'ALLERGY: nuts\n<script>alert(1)</script><img src=x onerror=alert(1)> & "quote"\n' +
    "Original customer words. ".repeat(80);
  f.order.customerDetails!.instructions = notes;
  f.order.delivery!.notes = "Keep <b>original</b> النص";
  const m = record(f, "javascript:alert(1)");
  assert.ok(m.body.includes(notes));
  assert.ok(m.body.includes(f.order.delivery!.notes!));
  assert.ok(m.body.indexOf("ALLERGY:") < m.body.indexOf("PRODUCTS TO PREPARE"));
  assert.match(m.html!, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.ok(!m.html!.includes("<script"));
  assert.ok(!m.html!.includes("<img"));
  assert.ok(!m.html!.includes("href="));
  assert.ok(!m.body.includes("javascript:"));
});
test("missing/duplicate stored prices and financial discrepancies require manual review; payment remains authoritative", () => {
  for (const mode of ["missing", "duplicate", "different-total"]) {
    const f = kitchenEmailFixture();
    if (mode === "missing") f.order.catalogSnapshot = [];
    if (mode === "duplicate")
      f.order.catalogSnapshot!.push({ ...f.order.catalogSnapshot![0]! });
    if (mode === "different-total") f.payment.amountFils = 12345;
    const m = record(f);
    assert.match(m.body, /MANUAL REVIEW REQUIRED: Stored line amounts/);
    assert.ok(
      m.body.includes(
        `Total paid: AED ${(f.payment.amountFils / 100).toFixed(2)}`,
      ),
    );
  }
});
test("pickup schedule and address replace delivery instructions without changing the order", () => {
  const f = kitchenEmailFixture();
  f.order.fulfillmentMethod = "pickup";
  f.order.pickup = {
    pickupDate: "2026-11-02",
    preferredTime: "10:00 AM – 1:00 PM",
  };
  delete f.order.delivery;
  const before = structuredClone(f.order);
  const m = record(f);
  assert.match(
    m.body,
    /Fulfillment: Pickup\nDate: 2026-11-02\nTime: 10:00 AM – 1:00 PM/,
  );
  assert.ok(!m.body.includes("Full address:"));
  assert.deepEqual(f.order, before);
});
test("missing safe English mapping keeps stored identification and visible translation review warning", () => {
  const f = kitchenEmailFixture();
  f.order.catalogSnapshot![0]!.name = "Nombre histórico sin traducción";
  const m = record(f);
  assert.match(
    m.body,
    /Nombre histórico sin traducción \[translation review required\]/,
  );
});
test("HTML is frozen at paid recording; concurrent dispatch sends once with unchanged recipient/idempotency, old sent rows never replay", async () => {
  const f = kitchenEmailFixture();
  const orderBefore = structuredClone(f.order);
  const paymentBefore = structuredClone(f.payment);
  const m = record(f);
  assert.deepEqual(
    recordPaidOperationsEmail(f.state, f.order, f.payment, [m.recipient]),
    [],
  );
  assert.deepEqual(f.order, orderBefore);
  assert.deepEqual(f.payment, paymentBefore);
  const store = new Store(":memory:", "test", f.state);
  const calls: { body: Record<string, unknown>; key: string }[] = [];
  const provider = new ResendEmailProvider(
    { apiKey: "fixture-only-secret", from: "Kitchen <sender@example.invalid>" },
    async (_url, init) => {
      calls.push({
        body: JSON.parse(String(init?.body)),
        key: (init?.headers as Record<string, string>)["Idempotency-Key"]!,
      });
      return Response.json({ id: "fictional-message" });
    },
  );
  try {
    store.write((s) => {
      s.catalog = [];
      s.operationsEmailNotifications!.push({
        ...m,
        id: "already-sent",
        body: "historical text",
        html: undefined,
        status: "sent",
      });
    });
    await Promise.all([
      dispatchCustomerNotifications(
        store,
        provider,
        "operationsEmailNotifications",
      ),
      dispatchCustomerNotifications(
        store,
        provider,
        "operationsEmailNotifications",
      ),
    ]);
    await dispatchCustomerNotifications(
      store,
      provider,
      "operationsEmailNotifications",
    );
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]!.body.to, [m.recipient]);
    assert.equal(calls[0]!.body.text, m.body);
    assert.equal(calls[0]!.body.html, m.html);
    assert.equal(calls[0]!.key, m.id);
    assert.equal(
      store.read().operationsEmailNotifications![1]!.body,
      "historical text",
    );
  } finally {
    store.close();
  }
});
test("customer and historical text-only emails retain text-only Resend payloads", async () => {
  const bodies: Record<string, unknown>[] = [];
  const provider = new ResendEmailProvider(
    { apiKey: "fixture-only-secret", from: "Kitchen <sender@example.invalid>" },
    async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "fictional-message" });
    },
  );
  await provider.send({
    to: "customer@example.invalid",
    subject: "Existing customer message",
    text: "Unchanged customer body",
    idempotencyKey: "original-key",
  });
  assert.deepEqual(bodies[0], {
    from: "Kitchen <sender@example.invalid>",
    to: ["customer@example.invalid"],
    subject: "Existing customer message",
    text: "Unchanged customer body",
  });
});
