import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { paidFixture } from "../fixtures/customer-paid";
import { ticketSnapshot } from "../../src/commerce/ticket-snapshot";
import { orderPermissions } from "../../src/commerce/order-view";
import { fulfillmentPending } from "../../server/domain/payment-fulfillment";

async function heldFixture() {
  const f = paidFixture();
  const key = await f.place(true);
  f.store.write((s) => {
    delete s.payments[0]!.fulfillmentIntent;
  });
  f.providerState.status = "PAID";
  await f.reconcile(key);
  return { ...f, key };
}
for (const [from, to, pickup] of [
  ["Confirmed", "Production", true],
  ["Production", "Ready", true],
  ["Ready", "Delivered", true],
  ["Ready", "Out for Delivery", false],
  ["Out for Delivery", "Delivered", false],
] as const)
  test(`review hold blocks command ${from} → ${to}`, async () => {
    const f = await heldFixture();
    try {
      f.store.write((s) => {
        s.orders[0]!.state = from;
        s.orders[0]!.fulfillmentMethod = pickup ? "pickup" : "delivery";
        s.conversations[0]!.assignedAgent = "liza";
      });
      const before = f.store.read();
      const o = before.orders[0]!;
      assert.throws(
        () =>
          f.service.command(
            { type: "transition", id: o.id, version: o.version, state: to },
            randomUUID(),
            { id: "liza", role: "admin" },
          ),
        /Fulfillment.*review/i,
      );
      assert.deepEqual(
        f.store.read(),
        before,
        "rejected command must be atomic, including outboxes",
      );
      assert.equal(before.payments[0]!.status, "paid");
    } finally {
      f.store.close();
    }
  });
test("PrintCenter ticket source withholds a review-required schedule", async () => {
  const f = await heldFixture();
  try {
    assert.equal(fulfillmentPending(f.order(f.key)), true);
    assert.equal(
      ticketSnapshot(f.order(f.key)),
      null,
      "held order cannot produce a promised ticket",
    );
  } finally {
    f.store.close();
  }
});

import {
  fulfillmentIntent,
  requestedFulfillment,
} from "../../server/domain/payment-fulfillment";
import {
  acceptedSchedule,
  scheduledEmailBlocker,
} from "../../server/domain/customer-email-v2-policy";
import { readWebCheckoutStatus } from "../../server/domain/web-checkout";

for (const pickup of [true, false])
  test(`accepted automatic contract and frozen copy pickup=${pickup}`, async (t) => {
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
        s.payments[0]!.fulfillmentIntent = fulfillmentIntent(o);
        s.payments[0]!.fulfillmentRequested = requestedFulfillment(o);
      });
      const original = structuredClone(f.order(key));
      t.mock.timers.setTime(new Date("2026-11-13T12:51:00Z").valueOf());
      f.providerState.status = "PAID";
      await f.reconcile(key);
      const s = f.store.read(),
        o = f.order(key);
      assert.equal(o.paymentFulfillment?.status, "auto-rescheduled");
      assert.equal(o.paymentFulfillment?.original.date, "2026-11-13");
      assert.equal(fulfillmentPending(o), false);
      for (const fault of [
        "missing-effective",
        "mismatch",
        "same-date",
      ] as const) {
        const unsafe = structuredClone(o);
        if (fault === "missing-effective")
          delete unsafe.paymentFulfillment!.effective;
        if (fault === "mismatch")
          unsafe.paymentFulfillment!.effective!.date = "2026-11-15";
        if (fault === "same-date")
          unsafe.paymentFulfillment!.original.date = "2026-11-14";
        assert.equal(fulfillmentPending(unsafe), true, `automatic ${fault}`);
        assert.equal(ticketSnapshot(unsafe), null);
        assert.equal(acceptedSchedule(unsafe).dueAt, null);
        const scheduled = s.customerNotifications!.find(
          (r) => r.event === "ORDER_SCHEDULED_WINDOW_STARTED",
        )!;
        assert.match(
          scheduledEmailBlocker(
            { ...s, orders: [unsafe] },
            scheduled,
            Date.parse(scheduled.dueAt!),
          )!,
          /Fulfillment pending/,
        );
      }

      assert.equal(
        readWebCheckoutStatus(f.service, key).fulfillmentPending,
        undefined,
      );
      assert.equal(acceptedSchedule(o).dueAt, "2026-11-14T12:00:00.000Z");
      const row = s.customerNotifications!.find(
        (r) => r.event === "ORDER_SCHEDULED_WINDOW_STARTED",
      )!;
      assert.equal(row.status, "pending");
      assert.equal(row.dueAt, "2026-11-14T12:00:00.000Z");
      assert.deepEqual(row.schedule, {
        method: pickup ? "pickup" : "delivery",
        date: "2026-11-14",
        slot: "4:00 PM – 9:00 PM",
      });
      assert.equal(scheduledEmailBlocker(s, row, Date.parse(row.dueAt!)), null);
      for (const n of [
        ...s.customerNotifications!,
        ...s.operationsEmailNotifications!,
      ]) {
        assert.doesNotMatch(
          n.body,
          /pending confirmation|proposed|13 November|November 13|2026-11-13/i,
        );
        assert.match(n.body, /14 November|2026-11-14/);
        assert.ok(n.html);
        assert.match(n.html, /14 November|2026-11-14/);
        assert.doesNotMatch(n.html, /pending confirmation|proposed/i);
      }
      assert.deepEqual(o.lines, original.lines);
      assert.deepEqual(o.quote, original.quote);
      assert.deepEqual(o.catalogSnapshot, original.catalogSnapshot);
      assert.ok(ticketSnapshot(o));
      const before = structuredClone(f.store.read());
      await f.reconcile(key);
      assert.deepEqual(f.order(key), o);
      assert.deepEqual(
        f.store.read().customerNotifications,
        before.customerNotifications,
      );
      assert.deepEqual(
        f.store.read().operationsEmailNotifications,
        before.operationsEmailNotifications,
      );
      assert.equal(f.providerState.creates, 1);
      assert.equal(
        o.audit.filter((a) => a.action.startsWith("Payment fulfillment "))
          .length,
        1,
      );
      f.store.write((s) => {
        s.conversations[0]!.assignedAgent = "liza";
      });
      f.service.command(
        {
          type: "transition",
          id: o.id,
          version: o.version,
          state: "Production",
        },
        randomUUID(),
        { id: "liza", role: "admin" },
      );
      assert.equal(f.order(key).state, "Production");
    } finally {
      f.store.close();
    }
  });

for (const fault of [
  "proposed",
  "review-required",
  "unknown",
  "missing-status",
  "missing-effective",
  "date-mismatch",
  "method-mismatch",
  "slot-mismatch",
  "invalid-day",
  "missing-original",
  "missing-payment",
  "null-decision",
] as const)
  test(`present unsafe decision fails closed throughout consumers: ${fault}`, async () => {
    const f = await heldFixture();
    try {
      f.store.write((s) => {
        const o = s.orders[0]!;
        const date = o.pickup!.pickupDate,
          slot = o.pickup!.preferredTime;
        o.paymentFulfillment = {
          ...o.paymentFulfillment!,
          status: "unchanged",
          original: { method: "pickup", date, slot },
          effective: { method: "pickup", date, slot },
        };
        const d = o.paymentFulfillment;
        if (["proposed", "review-required", "unknown"].includes(fault))
          d.status = fault as typeof d.status;
        if (fault === "missing-status") delete (d as Partial<typeof d>).status;
        if (fault === "missing-effective") delete d.effective;
        if (fault === "date-mismatch") d.effective!.date = "2026-11-20";
        if (fault === "method-mismatch") d.effective!.method = "delivery";
        if (fault === "slot-mismatch") d.effective!.slot = "anytime";
        if (fault === "invalid-day")
          d.effective!.date = o.pickup!.pickupDate = "2026-02-30";
        if (fault === "missing-original")
          delete (d as Partial<typeof d>).original;
        if (fault === "missing-payment") d.paymentId = "";
        if (fault === "null-decision")
          o.paymentFulfillment = null as unknown as typeof d;
        s.conversations[0]!.assignedAgent = "liza";
      });
      const o = f.order(f.key),
        s = f.store.read();
      assert.equal(fulfillmentPending(o), true);
      assert.equal(acceptedSchedule(o).dueAt, null);
      assert.equal(
        readWebCheckoutStatus(f.service, f.key).fulfillmentPending,
        true,
      );
      assert.equal(ticketSnapshot(o), null);
      assert.equal(
        orderPermissions(
          { actor: { id: "liza", role: "admin" }, agents: [] },
          o,
          s.conversations[0],
          s.payments[0],
        ).next,
        null,
      );
      assert.throws(
        () =>
          f.service.command(
            {
              type: "transition",
              id: o.id,
              version: o.version,
              state: "Production",
            },
            randomUUID(),
            { id: "liza", role: "admin" },
          ),
        /Fulfillment.*review/i,
      );
      const row = {
        ...s.customerNotifications![0]!,
        dueAt: "2026-11-20T12:00:00.000Z",
      };
      assert.match(
        scheduledEmailBlocker(s, row, Date.parse(row.dueAt))!,
        /Fulfillment pending/,
      );
      assert.equal(s.payments[0]!.status, "paid");
    } finally {
      f.store.close();
    }
  });

test("historical no-decision retains ticket, schedule, capabilities and transition", async () => {
  const f = await heldFixture();
  try {
    f.store.write((s) => {
      delete s.orders[0]!.paymentFulfillment;
      s.conversations[0]!.assignedAgent = "liza";
    });
    const o = f.order(f.key),
      s = f.store.read();
    assert.equal(fulfillmentPending(o), false);
    assert.ok(ticketSnapshot(o));
    assert.ok(acceptedSchedule(o).dueAt);
    assert.equal(
      orderPermissions(
        { actor: { id: "liza", role: "admin" }, agents: [] },
        o,
        s.conversations[0],
        s.payments[0],
      ).next?.to,
      "Production",
    );
    f.service.command(
      { type: "transition", id: o.id, version: o.version, state: "Production" },
      randomUUID(),
      { id: "liza", role: "admin" },
    );
    assert.equal(f.order(f.key).state, "Production");
  } finally {
    f.store.close();
  }
});

for (const existing of [
  null,
  { status: "proposed" },
  { status: "future-state" },
])
  test(`first recognition cannot autoaccept a preexisting malformed/legacy decision: ${JSON.stringify(existing)}`, async (t) => {
    t.mock.timers.enable({
      apis: ["Date"],
      now: new Date("2026-11-12T10:38:00Z"),
    });
    const f = paidFixture();
    try {
      const key = await f.place(true);
      f.store.write((s) => {
        s.orders[0]!.paymentFulfillment = existing as unknown as NonNullable<
          (typeof s.orders)[0]
        >["paymentFulfillment"];
      });
      f.providerState.status = "PAID";
      await f.reconcile(key);
      assert.equal(f.store.read().payments[0]!.status, "paid");
      assert.deepEqual(f.order(key).paymentFulfillment, existing);
      assert.equal(fulfillmentPending(f.order(key)), true);
    } finally {
      f.store.close();
    }
  });
