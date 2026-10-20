import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  kitchenEmailFixture,
  compactKitchenEmailFixture,
  compactKitchenEmailPreview,
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
    ["kitchen@example.invalid"],
  )[0]!;
}
test("HTML and text show each parent before its own frozen composition; boxes never become separate product charges", () => {
  const { order, payment } = kitchenEmailFixture();
  const message = kitchenEmailPreview();
  assert.equal((message.html!.match(/PACK \/ BOX/g) ?? []).length, 3);
  assert.equal((message.html!.match(/INDIVIDUAL PRODUCT/g) ?? []).length, 0);
  assert.ok(
    message.body.indexOf("PACK / BOX: Pan de Muerto") <
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

test("compact pack headings omit quantity while singles, box counts and frozen amounts remain explicit", () => {
  const f = compactKitchenEmailFixture();
  const before = structuredClone(f.order);
  const m = record(f);
  assert.match(m.body, /PACK \/ BOX: Pan de Muerto/);
  assert.doesNotMatch(m.body, /1 × Pan de Muerto · Traditional pack/);
  assert.match(m.body, /1 × Traditional Chocolate Concha/);
  assert.match(m.body, /TOTAL: 6 pieces · 1 box/);
  assert.match(m.html!, /<h2[^>]*>Pan de Muerto · Traditional pack/);
  assert.doesNotMatch(m.html!, /conchas-traditional-chocolate-individual-70-g/);
  assert.ok(m.body.includes("conchas-traditional-chocolate-individual-70-g"));
  assert.deepEqual(f.order, before);
  const large = kitchenEmailPreview();
  assert.match(
    large.html!,
    /2 boxes · 6 pieces per box; same contents in each box/,
  );
  assert.match(large.html!, /TOTAL: 12 pieces · 2 boxes/);
  assert.equal((large.html!.match(/PACK \/ BOX/g) ?? []).length, 3);
  assert.doesNotMatch(large.html!, /<h2[^>]*>\d+ × Pan de Muerto/);
});
test("compact long instructions and every address field are intact, not clamped or truncated", () => {
  const m = compactKitchenEmailPreview("long");
  for (const text of [
    "END OF ORIGINAL ALLERGY INSTRUCTIONS",
    "END OF DELIVERY NOTES",
    "Building/villa:",
    "Apartment/unit: 404",
    "Area: Fictional Community",
    "Address verification: UNVERIFIED",
  ]) {
    assert.ok(m.body.includes(text));
    assert.ok(m.html!.includes(text));
  }
  assert.doesNotMatch(
    m.html!,
    /line-clamp|max-height|text-overflow|overflow:hidden|<script|<iframe|<img/,
  );
  assert.equal(
    (m.html!.match(/Original instructions must remain complete\./g) ?? [])
      .length,
    45,
  );
});
test("legacy pack with multiple boxes retains box quantity even when composition cannot be trusted", () => {
  const f = compactKitchenEmailFixture();
  f.order.lines[0]!.quantity = 2;
  delete f.order.lines[0]!.packSnapshot;
  const m = record(f);
  assert.match(m.html!, /2 boxes · pieces per box not recorded/);
  assert.match(m.body, /2 boxes · pieces per box not recorded/);
  assert.match(m.html!, /MANUAL REVIEW REQUIRED: Pack composition/);
  assert.ok(!m.html!.includes("INSIDE EACH BOX:"));
});
test("existing pending frozen bodies are delivered unchanged, never regenerated by this layout change", async () => {
  const f = compactKitchenEmailFixture();
  const m = record(f);
  m.body = "Old pending frozen text";
  m.html = '<html lang="en"><body>Old pending frozen HTML</body></html>';
  f.state.catalog = [];
  assert.deepEqual(
    recordPaidOperationsEmail(f.state, f.order, f.payment, [m.recipient]),
    [],
  );
  const store = new Store(":memory:", "test", f.state);
  const sent: Record<string, unknown>[] = [];
  const provider = new ResendEmailProvider(
    { apiKey: "synthetic-only", from: "Kitchen <sender@example.invalid>" },
    async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      assert.equal(
        (init?.headers as Record<string, string>)["Idempotency-Key"],
        m.id,
      );
      return Response.json({ id: "synthetic-send" });
    },
  );
  try {
    await dispatchCustomerNotifications(
      store,
      provider,
      "operationsEmailNotifications",
    );
    await dispatchCustomerNotifications(
      store,
      provider,
      "operationsEmailNotifications",
    );
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.html, m.html);
    assert.equal(sent[0]!.text, m.body);
  } finally {
    store.close();
  }
});
test("compact contact deduplication combines identical phone/WhatsApp only, never distinct contacts", () => {
  const same = record(compactKitchenEmailFixture());
  assert.match(same.html!, /Phone \/ WhatsApp: \+971500000000/);
  const f = compactKitchenEmailFixture();
  f.order.customerDetails!.whatsappNumber = "+971500000002";
  const different = record(f);
  assert.match(different.html!, /Phone: \+971500000000/);
  assert.match(different.html!, /WhatsApp: \+971500000002/);
  assert.doesNotMatch(different.html!, /Phone \/ WhatsApp:/);
});

test("per-recipient compact opt-in preserves original HTML for everyone else", () => {
  const f = kitchenEmailFixture();
  const recipients = ["compact@example.invalid", "standard@example.invalid"];
  const rows = recordPaidOperationsEmail(
    f.state,
    f.order,
    f.payment,
    recipients,
    "https://www.3ldubai.ae",
    ["COMPACT@example.invalid"],
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.recipient),
    recipients,
  );
  assert.ok(rows[0]!.html?.includes("3L"));
  assert.ok(rows[1]!.html?.includes("3L"));
  assert.notEqual(rows[0]!.html, rows[1]!.html);
  assert.ok(rows[0]!.body.includes("Total paid: AED"));
  assert.ok(rows[1]!.body.includes("Total paid: AED"));
  assert.equal(rows[0]!.subject, rows[1]!.subject);
  assert.notEqual(rows[0]!.id, rows[1]!.id);
  assert.equal(rows[0]!.status, "pending");
  assert.equal(rows[1]!.status, "pending");
  assert.equal(
    f.state.events[`operations-email-paid:${f.order.id}`],
    f.payment.id,
  );
  const duplicate = recordPaidOperationsEmail(
    f.state,
    f.order,
    f.payment,
    recipients,
    undefined,
    recipients,
  );
  assert.equal(duplicate.length, 0, "No replay when preference changes");
});

test("without compact allowlist every internal recipient keeps the original email", () => {
  const f = kitchenEmailFixture();
  const rows = recordPaidOperationsEmail(
    f.state,
    f.order,
    f.payment,
    ["a@example.invalid", "b@example.invalid"],
    "https://www.3ldubai.ae",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.html, rows[1]!.html);
  assert.equal(rows[0]!.body, rows[1]!.body);
  const sample = kitchenEmailPreview();
  assert.notEqual(rows[0]!.html, sample.html);
});

test("unselected recipient HTML is byte-identical to the original frozen renderer control", () => {
  const f = compactKitchenEmailFixture();
  const row = recordPaidOperationsEmail(
    f.state,
    f.order,
    f.payment,
    ["standard@example.invalid"],
    "https://www.3ldubai.ae",
  )[0]!;
  assert.equal(
    row.html,
    readFileSync("docs/email/previews/compact-before.html", "utf8"),
  );
});
test("three synthetic opt-ins cannot change the format or destination of any other recipient", () => {
  const f = kitchenEmailFixture();
  const compact = [
    "first@example.invalid",
    "second@example.invalid",
    "third@example.invalid",
  ];
  const recipients = [...compact, "standard@example.invalid"];
  const rows = recordPaidOperationsEmail(
    f.state,
    f.order,
    f.payment,
    recipients,
    "https://www.3ldubai.ae",
    compact,
  );
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((row) => row.recipient),
    recipients,
  );
  assert.ok(rows.slice(0, 3).every((row) => row.html === rows[0]!.html));
  assert.notEqual(rows[3]!.html, rows[0]!.html);
  assert.match(rows[3]!.html!, /3L · KITCHEN ORDER · PAID/);
  assert.equal(
    recordPaidOperationsEmail(
      f.state,
      f.order,
      f.payment,
      recipients,
      undefined,
      recipients,
    ).length,
    0,
  );
});

test("product-first HTML gives every accepted line an explicit quantity/price and keeps notes before secondary details", () => {
  const f = kitchenEmailFixture();
  const original = structuredClone(f);
  const m = record(f);
  assert.match(m.html!, /table aria-label="Products to prepare"/);
  assert.equal((m.html!.match(/data-kitchen-item=/g) ?? []).length, 4);
  assert.equal((m.html!.match(/data-kitchen-quantity/g) ?? []).length, 4);
  assert.equal((m.html!.match(/data-kitchen-price/g) ?? []).length, 4);
  assert.equal((m.html!.match(/data-kitchen-item="pack"/g) ?? []).length, 3);
  const product = m.html!.indexOf('table aria-label="Products to prepare"');
  const notes = m.html!.indexOf("data-kitchen-notes");
  assert.ok(
    product < notes && notes < m.html!.indexOf("data-kitchen-customer"),
  );
  assert.ok(notes < m.html!.indexOf("data-kitchen-address"));
  assert.deepEqual(f.order, original.order);
  assert.deepEqual(f.payment, original.payment);
  assert.ok(m.body.includes("2 × Traditional Chocolate Concha"));
});

test("product-first presentation retains the previous compact plain-text fallback exactly", () => {
  const current = compactKitchenEmailPreview();
  assert.equal(
    current.body,
    readFileSync("docs/email/previews/product-first-text-before.txt", "utf8"),
  );
  const short = compactKitchenEmailPreview("short");
  const three = compactKitchenEmailPreview("three");
  assert.match(short.body, /Total paid: AED 13.00/);
  assert.match(three.body, /Total paid: AED 39.00/);
  assert.doesNotMatch(short.html!, /data-kitchen-item="pack"/);
  assert.doesNotMatch(three.html!, /data-kitchen-item="pack"/);
});
