import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { paidFixture } from "../fixtures/customer-paid";
import { CommerceService } from "../../server/domain/service";
import {
  MockPaymentProvider,
  MockWhatsAppProvider,
} from "../fixtures/providers";
import { HmacVerifier } from "../../server/adapters/providers";
import {
  fulfillmentIntent,
  requestedFulfillment,
} from "../../server/domain/payment-fulfillment";
import { translateOps } from "../../src/commerce/ops-i18n";

async function alternativeFixture() {
  const f = paidFixture();
  const key = await f.place(true);
  f.store.write((s) => {
    const o = s.orders[0]!;
    o.pickup!.pickupDate = "2026-11-13";
    s.payments[0]!.fulfillmentIntent = fulfillmentIntent(o);
    s.payments[0]!.fulfillmentRequested = requestedFulfillment(o);
  });
  const service = new CommerceService(
    f.store,
    new MockWhatsAppProvider(),
    new MockPaymentProvider(
      new HmacVerifier("synthetic-review-only-24-characters"),
    ),
  );
  const p = f.store.read().payments[0]!;
  const event = {
    eventId: "review-fix-event",
    reference: p.providerReference!,
    transactionId: "review-fix-transaction",
    status: "paid",
    amountFils: p.amountFils,
    currency: "AED",
  };
  return { ...f, key, alternative: service, event };
}

for (const status of [
  "paid",
  "partially_refunded",
  "refunded",
  "chargeback",
] as const)
  test(`alternative paid cannot propose or confirm when another payment is ${status}`, async (t) => {
    t.mock.timers.enable({
      apis: ["Date"],
      now: new Date("2026-11-12T10:38:00Z"),
    });
    const f = await alternativeFixture();
    try {
      f.store.write((s) =>
        s.payments.push({
          ...structuredClone(s.payments[0]!),
          id: "other-settled-payment",
          providerReference: "other-synthetic-checkout",
          status,
        }),
      );
      t.mock.timers.setTime(new Date("2026-11-13T12:51:00Z").valueOf());
      f.alternative.paymentWebhook(f.event);
      const o = f.order(f.key);
      assert.equal(f.store.read().payments[0]!.status, "paid");
      assert.equal(o.state, "Awaiting Payment");
      assert.equal(o.pickup!.pickupDate, "2026-11-13");
      assert.equal(o.paymentFulfillment?.status, "review-required");
      assert.equal(o.paymentFulfillment?.effective, undefined);
      assert.equal(
        o.audit.filter((a) => a.action.startsWith("Payment fulfillment "))
          .length,
        1,
      );
      assert.equal(o.paidAt, undefined);
    } finally {
      f.store.close();
    }
  });

test("alternative first acknowledgement has one durable audit, first timestamps and no new outbox", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-12T10:38:00Z"),
  });
  const f = await alternativeFixture();
  try {
    t.mock.timers.setTime(new Date("2026-11-13T12:51:00Z").valueOf());
    f.alternative.paymentWebhook(f.event);
    const before = structuredClone(f.order(f.key));
    const audit = before.audit.filter((a) =>
      a.action.startsWith("Payment fulfillment "),
    );
    assert.equal(audit.length, 1);
    assert.equal(audit[0]!.actor, "payment-webhook");
    assert.equal(audit[0]!.at, "2026-11-13T12:51:00.000Z");
    assert.equal(
      audit[0]!.action,
      `Payment fulfillment proposed: ${before.paymentFulfillment!.reason}`,
    );
    assert.equal(before.paidAt, audit[0]!.at);
    assert.equal(f.store.read().payments[0]!.paidAt, audit[0]!.at);
    t.mock.timers.setTime(new Date("2026-11-14T12:51:00Z").valueOf());
    f.alternative.paymentWebhook(f.event);
    f.alternative.paymentWebhook({
      ...f.event,
      eventId: "different-replay-id",
    });
    assert.deepEqual(f.order(f.key), before);
    assert.equal(f.store.read().payments[0]!.paidAt, audit[0]!.at);
    const s = f.store.read();
    assert.equal(s.customerNotifications?.length ?? 0, 0);
    assert.equal(s.operationsEmailNotifications?.length ?? 0, 0);
    assert.equal(s.operationsNotifications?.length ?? 0, 0);
    assert.equal(f.providerState.creates, 1);
  } finally {
    f.store.close();
  }
});

for (const historical of [
  "paid-without-timestamps",
  "payment-recognized",
  "order-recognized",
])
  test(`alternative preserves historical first-recognition facts: ${historical}`, async (t) => {
    t.mock.timers.enable({
      apis: ["Date"],
      now: new Date("2026-11-12T10:38:00Z"),
    });
    const f = await alternativeFixture();
    try {
      f.store.write((s) => {
        if (historical === "paid-without-timestamps") {
          s.payments[0]!.status = "paid";
          s.payments[0]!.transactionId = f.event.transactionId;
          s.orders[0]!.state = "Confirmed";
        }
        if (historical === "payment-recognized")
          s.payments[0]!.paidAt = "2026-11-12T11:00:00.000Z";
        if (historical === "order-recognized")
          s.orders[0]!.paidAt = "2026-11-12T11:00:00.000Z";
      });
      const before = structuredClone(f.order(f.key));
      const paidAt = f.store.read().payments[0]!.paidAt;
      t.mock.timers.setTime(new Date("2026-11-13T12:51:00Z").valueOf());
      f.alternative.paymentWebhook(f.event);
      assert.deepEqual(f.order(f.key), before);
      assert.equal(f.store.read().payments[0]!.paidAt, paidAt);
    } finally {
      f.store.close();
    }
  });

test("P0 Operations labels have isolated EN/TL resources and preserve stored facts in templates", () => {
  const en = JSON.parse(readFileSync("src/commerce/locales/en.json", "utf8"));
  const tl = JSON.parse(readFileSync("src/commerce/locales/tl.json", "utf8"));
  const keys = [
    "Fulfillment pending confirmation",
    "Fulfillment pending customer and 3L team confirmation.",
    "Original: {{date}} {{slot}}.",
    "Proposed: {{date}} {{slot}}.",
    "No safe date",
    "Recorded reason: {{reason}}",
  ];
  for (const key of keys) {
    assert.equal(typeof en[key], "string", key);
    assert.equal(typeof tl[key], "string", key);
    assert.notEqual(tl[key], en[key], key);
  }
  assert.equal(
    translateOps("tl", "Recorded reason: {{reason}}", {
      reason: "Review required",
    }),
    "Naitalang dahilan: Review required",
  );
  assert.equal(
    translateOps("tl", "Original: {{date}} {{slot}}.", {
      date: "2026-11-13",
      slot: "4:00 PM – 9:00 PM",
    }),
    "Orihinal: 2026-11-13 4:00 PM – 9:00 PM.",
  );
  assert.equal(
    translateOps("tl", "Proposed: {{date}} {{slot}}.", {
      date: "2026-11-14",
      slot: "4:00 PM – 9:00 PM",
    }),
    "Iminungkahi: 2026-11-14 4:00 PM – 9:00 PM.",
  );
  for (const [file, key] of [
    ["OrdersList", keys[0]!],
    ["OrdersBoard", keys[0]!],
    ["Workspace", keys[1]!],
    ["OrderDetails", keys[1]!],
  ] as const) {
    const source = readFileSync(`src/commerce/${file}.tsx`, "utf8");
    assert.ok(source.includes(`t("${key}")`), file);
    assert.ok(
      !/t\(o\.paymentFulfillment\.(reason|original|effective)/.test(source),
      file,
    );
  }
});
