import test from "node:test";
import assert from "node:assert/strict";
import { paidFixture } from "../fixtures/customer-paid";
import {
  fulfillmentIntent,
  requestedFulfillment,
} from "../../server/domain/payment-fulfillment";

for (const pickup of [true, false])
  test(`late authoritative payment revalidates before frozen notifications; pickup=${pickup}`, async (t) => {
    t.mock.timers.enable({
      apis: ["Date"],
      now: new Date("2026-11-12T10:38:00Z"),
    });
    const f = paidFixture();
    try {
      const key = await f.place(pickup);
      f.store.write((s) => {
        const o = s.orders[0]!;
        if (pickup) o.pickup!.pickupDate = "2026-11-13";
        else o.delivery!.date = "2026-11-13";
        s.payments[0]!.fulfillmentIntent = fulfillmentIntent(o); // synthetic original intent, before recognition
        s.payments[0]!.fulfillmentRequested = requestedFulfillment(o);
      });
      t.mock.timers.setTime(new Date("2026-11-13T12:51:00Z").valueOf());
      f.providerState.status = "PAID";
      await f.reconcile(key);
      const o = f.order(key);
      assert.equal(
        pickup ? o.pickup?.pickupDate : o.delivery?.date,
        "2026-11-14",
      );
      assert.equal(o.paymentFulfillment?.status, "auto-rescheduled");
      assert.equal(o.paymentFulfillment?.original.date, "2026-11-13");
      assert.doesNotMatch(
        f.store.read().customerNotifications![0]!.body,
        /pending confirmation/i,
      );
      assert.match(f.store.read().customerNotifications![0]!.body, /14/);
      const before = structuredClone(o);
      await f.reconcile(key);
      assert.deepEqual(f.order(key), before);
      assert.equal(f.providerState.creates, 1);
      assert.equal(f.store.read().customerNotifications!.length, 1);
    } finally {
      f.store.close();
    }
  });

for (const pickup of [true, false])
  for (const [time, hours, expected] of [
    ["2026-11-12T14:38:00+04:00", 12, "2026-11-13"],
    ["2026-11-13T16:51:00+04:00", 12, "2026-11-14"],
    ["2026-11-13T16:51:00+04:00", 24, "2026-11-15"],
    ["2026-11-13T21:00:59+04:00", 12, "2026-11-14"],
    ["2026-11-13T21:01:00+04:00", 12, "2026-11-15"],
    ["2026-11-13T21:00:59+04:00", 24, "2026-11-15"],
    ["2026-11-13T21:01:00+04:00", 24, "2026-11-15"],
  ] as const)
    test(`schedule matrix ${pickup} ${time} ${hours}h`, async (t) => {
      t.mock.timers.enable({
        apis: ["Date"],
        now: new Date("2026-11-12T10:38:00Z"),
      });
      const f = paidFixture();
      try {
        const key = await f.place(pickup);
        f.service.customerEmailV2Since = f.since;
        f.store.write((s) => {
          const o = s.orders[0]!;
          if (pickup) o.pickup!.pickupDate = "2026-11-13";
          else o.delivery!.date = "2026-11-13";
          if (hours === 24) {
            o.lines[0]!.productId = "gelatina-synthetic";
            o.catalogSnapshot![0]!.id = "gelatina-synthetic";
          }
          s.payments[0]!.fulfillmentIntent = fulfillmentIntent(o);
          s.payments[0]!.fulfillmentRequested = requestedFulfillment(o);
        });
        const frozen = structuredClone(f.order(key));
        t.mock.timers.setTime(new Date(time).valueOf());
        f.providerState.status = "PAID";
        await f.reconcile(key);
        const o = f.order(key);
        assert.equal(o.paymentFulfillment?.effective?.date, expected);
        assert.deepEqual(o.lines, frozen.lines);
        assert.deepEqual(o.quote, frozen.quote);
        assert.deepEqual(o.catalogSnapshot, frozen.catalogSnapshot);
        const rows = f.store.read().customerNotifications!;
        assert.equal(rows.length, 2);
        const window = rows.find(
          (r) => r.event === "ORDER_SCHEDULED_WINDOW_STARTED",
        )!;
        assert.equal(window.status, "pending");
        assert.equal(window.dueAt, `${expected}T12:00:00.000Z`);
        assert.doesNotMatch(rows[0]!.body, /pending confirmation/i);
        assert.doesNotMatch(
          f.store.read().operationsEmailNotifications![0]!.body,
          /pending confirmation/i,
        );
        const payment = f.store.read().payments[0]!;
        const event = {
          id: payment.providerReference!,
          status: "PAID",
          statusUpdateTimestamp: new Date().toISOString(),
        };
        await f.service.acceptPaymentNotification(event);
        await f.service.acceptPaymentNotification(event);
        assert.equal(f.store.read().customerNotifications!.length, 2);
        assert.equal(f.store.read().operationsEmailNotifications!.length, 1);
        assert.equal(f.providerState.creates, 1);
      } finally {
        f.store.close();
      }
    });

for (const fault of [
  "missing-slot",
  "invalid-slot",
  "bad-date",
  "changed-lines",
  "no-intent",
  "no-snapshot",
  "changed-method",
  "changed-state",
])
  test(`uncertainty retains money and durable review: ${fault}`, async (t) => {
    t.mock.timers.enable({
      apis: ["Date"],
      now: new Date("2026-11-12T10:38:00Z"),
    });
    const f = paidFixture();
    try {
      const k = await f.place(true);
      f.store.write((s) => {
        const o = s.orders[0]!;
        if (fault === "missing-slot") o.pickup!.preferredTime = "";
        if (fault === "invalid-slot") o.pickup!.preferredTime = "anytime";
        if (fault === "bad-date") o.pickup!.pickupDate = "2026-02-30";
        // Missing/invalid original data can predate the fingerprint feature.
        s.payments[0]!.fulfillmentIntent = fulfillmentIntent(o);
        s.payments[0]!.fulfillmentRequested = requestedFulfillment(o);
        if (fault === "changed-lines") o.lines[0]!.quantity++;
        if (fault === "no-intent") delete s.payments[0]!.fulfillmentIntent;
        if (fault === "no-snapshot") delete o.catalogSnapshot;
        if (fault === "changed-method") o.fulfillmentMethod = "delivery";
        if (fault === "changed-state") o.state = "Cancelled";
      });
      f.providerState.status = "PAID";
      await f.reconcile(k);
      assert.equal(f.store.read().payments[0]!.status, "paid");
      assert.equal(f.order(k).paymentFulfillment?.status, "review-required");
      assert.equal(f.order(k).paymentFulfillment?.effective, undefined);
      const before = structuredClone(f.order(k));
      await f.reconcile(k);
      assert.deepEqual(f.order(k), before);
      assert.equal(f.providerState.creates, 1);
    } finally {
      f.store.close();
    }
  });
for (const status of ["PENDING", "FAILED", "AUTHORIZED", "UNKNOWN", "EXPIRED"])
  test(`no fulfillment decision for ${status}`, async () => {
    const f = paidFixture();
    try {
      const k = await f.place(true);
      f.providerState.status = status;
      try {
        await f.reconcile(k);
      } catch {
        assert.equal(status, "UNKNOWN");
      }
      assert.equal(f.order(k).paymentFulfillment, undefined);
      assert.equal(f.store.read().customerNotifications?.length ?? 0, 0);
      assert.equal(f.providerState.creates, 1);
    } finally {
      f.store.close();
    }
  });
test("historical paid without paidAt is not scheduled or backfilled", async () => {
  const f = paidFixture();
  try {
    const k = await f.place(true);
    f.store.write((s) => {
      s.payments[0]!.status = "paid";
      s.orders[0]!.state = "Confirmed";
    });
    const before = structuredClone(f.order(k));
    f.providerState.status = "PAID";
    await f.reconcile(k);
    assert.deepEqual(f.order(k), before);
    assert.equal(f.store.read().customerNotifications?.length ?? 0, 0);
  } finally {
    f.store.close();
  }
});

test("alternative verified route validates once and durable SQLite survives reopen", async (t) => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { DatabaseSync } = await import("node:sqlite");
  const { CommerceService } = await import("../../server/domain/service");
  const { MockPaymentProvider, MockWhatsAppProvider } =
    await import("../fixtures/providers");
  const { HmacVerifier } = await import("../../server/adapters/providers");
  const { Store } = await import("../../server/db/store");
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-12T10:38:00Z"),
  });
  const dir = mkdtempSync(join(tmpdir(), "payment-time-")),
    file = join(dir, "synthetic.sqlite");
  const f = paidFixture(file);
  try {
    const k = await f.place(true);
    f.store.write((s) => {
      s.orders[0]!.pickup!.pickupDate = "2026-11-13";
      s.payments[0]!.fulfillmentIntent = fulfillmentIntent(s.orders[0]!);
      s.payments[0]!.fulfillmentRequested = requestedFulfillment(s.orders[0]!);
    });
    t.mock.timers.setTime(new Date("2026-11-13T12:51:00Z").valueOf());
    const service = new CommerceService(
      f.store,
      new MockWhatsAppProvider(),
      new MockPaymentProvider(
        new HmacVerifier("synthetic-only-secret-at-least-24"),
      ),
    );
    const p = f.store.read().payments[0]!;
    const event = {
      eventId: "synthetic-event",
      reference: p.providerReference!,
      transactionId: "synthetic-transaction",
      status: "paid",
      amountFils: p.amountFils,
      currency: "AED",
    };
    service.paymentWebhook(event);
    const before = structuredClone(f.order(k));
    assert.equal(before.paymentFulfillment?.effective?.date, "2026-11-14");
    assert.equal(
      before.paymentFulfillment?.source,
      "verified-alternative-event",
    );
    service.paymentWebhook(event);
    assert.deepEqual(f.order(k), before);
    f.store.close();
    const reopened = new Store(file, "test");
    try {
      assert.deepEqual(reopened.read().orders[0], before);
    } finally {
      reopened.close();
    }
    const db = new DatabaseSync(file);
    try {
      assert.equal(
        db.prepare("PRAGMA integrity_check").get()!.integrity_check,
        "ok",
      );
    } finally {
      db.close();
    }
  } finally {
    try {
      f.store.close();
    } catch {
      /* already closed */
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const route of ["notification-first", "direct-authority"])
  test(`first paid authority via ${route}`, async (t) => {
    t.mock.timers.enable({
      apis: ["Date"],
      now: new Date("2026-11-12T10:38:00Z"),
    });
    const f = paidFixture();
    try {
      const k = await f.place(true);
      f.store.write((s) => {
        const o = s.orders[0]!;
        o.pickup!.pickupDate = "2026-11-13";
        s.payments[0]!.fulfillmentIntent = fulfillmentIntent(o);
        s.payments[0]!.fulfillmentRequested = requestedFulfillment(o);
      });
      t.mock.timers.setTime(new Date("2026-11-13T12:51:00Z").valueOf());
      const p = f.store.read().payments[0]!;
      if (route === "notification-first") {
        f.providerState.status = "PAID";
        const event = {
          id: p.providerReference!,
          status: "PAID",
          statusUpdateTimestamp: "2026-11-12T10:40:00Z",
        };
        await f.service.acceptPaymentNotification(event);
        await f.service.acceptPaymentNotification(event);
        const d = f.order(k).paymentFulfillment!;
        assert.equal(d.source, "verified-notification-get");
        assert.ok(d.receiptId);
        assert.ok(f.store.read().paymentNotifications![0]!.completedAt);
      } else {
        const checkout = {
          checkoutId: p.providerReference!,
          requestId: p.id,
          orderId: p.orderId,
          amountFils: p.amountFils,
          currency: p.currency,
          status: "paid" as const,
          rawStatus: "PAID",
        };
        f.service.applyCheckout(p.id, checkout, "synthetic-authority");
        f.service.applyCheckout(p.id, checkout, "synthetic-authority");
      }
      const decision = f.order(k).paymentFulfillment!;
      assert.equal(decision.acknowledgedAt, "2026-11-13T12:51:00.000Z");
      assert.equal(decision.effective!.date, "2026-11-14");
      assert.equal(decision.checkoutId, p.providerReference);
      assert.equal(f.store.read().customerNotifications!.length, 1);
      assert.equal(f.store.read().operationsEmailNotifications!.length, 1);
      assert.equal(f.providerState.creates, 1);
    } finally {
      f.store.close();
    }
  });

test("unowned agent cannot reconcile or change fulfillment (existing ownership 409)", async () => {
  const f = paidFixture();
  try {
    const k = await f.place(true);
    const before = structuredClone(f.order(k));
    f.providerState.status = "PAID";
    await assert.rejects(
      f.service.reconcile(f.store.read().payments[0]!.id, {
        id: "unowned-synthetic-agent",
        role: "agent",
      }),
      (e: unknown) => (e as { status: number }).status === 409,
    );
    assert.deepEqual(f.order(k), before);
    assert.equal(f.store.read().payments[0]!.status, "pending");
  } finally {
    f.store.close();
  }
});

test("unrepresentable scheduling horizon fails closed without discarding paid recognition", async () => {
  const { revalidatePaidFulfillment } =
    await import("../../server/domain/payment-fulfillment");
  const f = paidFixture();
  try {
    const k = await f.place(true);
    const o = structuredClone(f.order(k));
    const p = f.store.read().payments[0]!;
    p.status = "paid";
    const decision = revalidatePaidFulfillment(
      o,
      p,
      new Date(8640000000000000).toISOString(),
      "synthetic",
      "synthetic-clock-boundary",
      true,
    );
    assert.equal(p.status, "paid");
    assert.equal(decision.status, "review-required");
    assert.equal(decision.effective, undefined);
    assert.match(decision.reason, /No safe same-slot date/);
  } finally {
    f.store.close();
  }
});
