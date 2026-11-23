/** Integrated A numeric ordering + B cross-page/daily consumer contract. Synthetic. */
import test from "node:test";
import assert from "node:assert/strict";
import { documentsState, docOrder, TODAY } from "../fixtures/order-documents";
import type { Workspace } from "../../src/commerce/api";
import {
  EMPTY_QUERY,
  matchingOrders,
  listOrders,
  byNewest,
} from "../../src/commerce/order-view";

test("integrated All sorts numeric order numbers across pages; daily views retain creation chronology", () => {
  const state = documentsState();
  state.orders = Array.from({ length: 31 }, (_, i) => {
    const o = docOrder(`TL-INTEGRATED-${i}`);
    o.publicOrderNumber = 980 + i;
    o.audit[0]!.at = new Date(Date.UTC(2026, 10, 4, 0, 31 - i)).toISOString();
    return o;
  });
  const data = state as unknown as Workspace;
  const all = matchingOrders(data, EMPTY_QUERY, TODAY);
  assert.deepEqual(
    all.map((o) => o.publicOrderNumber),
    Array.from({ length: 31 }, (_, i) => 1010 - i),
  );
  assert.deepEqual(
    [1, 2].flatMap((page) =>
      listOrders(data, { ...EMPTY_QUERY, page }, TODAY).rows.map((o) => o.id),
    ),
    all.map((o) => o.id),
  );
  const tomorrow = matchingOrders(
    data,
    { ...EMPTY_QUERY, view: "tomorrow" },
    TODAY,
  );
  assert.equal(tomorrow.length, 31);
  assert.deepEqual(
    tomorrow.map((o) => o.id),
    [...state.orders].sort(byNewest).map((o) => o.id),
  );
});

import { paidFixture } from "../fixtures/customer-paid";
import {
  ordersCsv,
  orderDocuments,
  ordersZip,
} from "../../server/orders/documents";
import { fulfillmentSchedule } from "../../shared/fulfillment-schedule";
import { fulfillmentPending } from "../../shared/payment-fulfillment";
import { printOrder } from "../../server/orders/print-documents";
import { randomUUID } from "node:crypto";
const variants = [
  ["packing-slip", "a4"],
  ["production-bulk", "a4"],
  ["delivery-note", "a4"],
  ["delivery-note", "a5"],
  ["delivery-note", "a5-two-up"],
] as const;
for (const pickup of [true, false])
  for (const held of [false, true])
    test(`integrated real checkout/mock GET settlement/replay/exports/transition pickup=${pickup} held=${held}`, async (t) => {
      t.mock.timers.enable({
        apis: ["Date"],
        now: new Date("2026-11-12T10:38:00Z"),
      });
      const f = paidFixture();
      try {
        const key = await f.place(pickup);
        const original = structuredClone(f.order(key));
        if (held)
          f.store.write((s) => {
            delete s.payments[0]!.fulfillmentIntent;
          });
        t.mock.timers.setTime(new Date("2026-11-15T12:51:00Z").valueOf());
        f.providerState.status = "PAID";
        await f.reconcile(key);
        const before = structuredClone(f.store.read()),
          o = f.order(key);
        assert.equal(before.payments[0]!.status, "paid");
        assert.equal(fulfillmentPending(o), held);
        assert.equal(
          o.paymentFulfillment?.status,
          held ? "review-required" : "auto-rescheduled",
        );
        assert.deepEqual(o.lines, original.lines);
        assert.deepEqual(o.catalogSnapshot, original.catalogSnapshot);
        assert.deepEqual(o.quote, original.quote);
        await f.reconcile(key);
        const after = f.store.read();
        for (const field of [
          "orders",
          "payments",
          "customerNotifications",
          "operationsEmailNotifications",
          "commands",
          "paymentNotifications",
        ] as const)
          assert.deepEqual(after[field], before[field], `replay ${field}`);
        assert.equal(f.providerState.creates, 1);
        // Keep the opposite residual block: accepted consumers must use method/effective.
        f.store.write((s) => {
          const current = s.orders[0]!;
          if (pickup)
            current.delivery = {
              ...original.delivery!,
              date: "2026-11-29",
              slot: "8:00 AM – 1:00 PM",
            };
          else
            current.pickup = {
              pickupDate: "2026-11-29",
              preferredTime: "8:00 AM – 1:00 PM",
            };
          s.conversations[0]!.assignedAgent = "liza";
        });
        const state = f.store.read(),
          current = state.orders[0]!,
          schedule = fulfillmentSchedule(current);
        const csv = ordersCsv(state, [current]);
        const model = printOrder(state, current);
        assert.doesNotMatch(csv, /2026-11-29|8:00 AM/);
        if (held) {
          assert.equal(schedule.date, undefined);
          assert.equal(model.day, null);
          assert.match(csv, /FULFILLMENT REVIEW REQUIRED/);
        } else {
          assert.equal(
            schedule.date,
            current.paymentFulfillment!.effective!.date,
          );
          assert.ok(csv.includes(schedule.date!));
          assert.equal(model.day, schedule.date);
        }
        for (const [kind, layout] of variants) {
          const pdf = orderDocuments(
            state,
            [current],
            kind,
            { id: "liza", role: "admin" },
            new Date(),
            layout,
          );
          assert.ok(pdf.pdf.subarray(0, 8).toString().startsWith("%PDF"));
          assert.doesNotMatch(pdf.trace.join("\n"), /29 Nov 2026|8:00 AM/);
          assert.equal(
            pdf.trace.join("\n").includes("FULFILLMENT REVIEW REQUIRED"),
            held,
          );
          const zip = ordersZip(
            state,
            [current],
            kind,
            { id: "liza", role: "admin" },
            new Date(),
            layout,
          );
          assert.equal(zip.readUInt32LE(0), 0x04034b50);
        }
        assert.deepEqual(f.store.read(), state, "exports read-only");
        const command = () =>
          f.service.command(
            {
              type: "transition",
              id: current.id,
              version: current.version,
              state: "Production",
            },
            randomUUID(),
            { id: "liza", role: "admin" },
          );
        if (held) {
          assert.throws(command, /Fulfillment.*review/i);
          assert.deepEqual(f.store.read(), state);
        } else {
          command();
          assert.equal(f.order(key).state, "Production");
        }
      } finally {
        f.store.close();
      }
    });

import {
  integratedFixture,
  integratedWebhookFixture,
} from "../fixtures/rt01-integrated-server";
import { publishedRevision } from "../../server/catalog/storefront-api";
test("HTTP/browser fixture has a valid published catalog with adoption ON", () => {
  const { initial, payment } = integratedFixture();
  const published = publishedRevision(initial, "on");
  assert.equal(published.dynamic, true);
  assert.equal(published.sellable, true);
  assert.ok(published.revision);
  assert.equal(payment.constructor.name, "PaymenntProvider");
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWebhookSecret } from "../../server/adapters/paymennt-secrets";
test("HTTP/browser fake webhook registration satisfies the existing private-file loader", () => {
  const dir = mkdtempSync(join(tmpdir(), "rt01-integrated-config-"));
  try {
    const path = integratedWebhookFixture(dir);
    const registered = loadWebhookSecret(path);
    assert.equal(registered?.id, "rt01-synthetic-webhook");
    assert.equal(
      registered?.address,
      "https://fixture.invalid/api/webhooks/payment",
    );
    assert.throws(() => integratedWebhookFixture(dir), /EEXIST/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
