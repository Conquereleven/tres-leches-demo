/** Synthetic read-only consumer contracts. No payment writer or real providers. */
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  decisionOrder,
  acceptedResidualOrder as residualOrder,
} from "../fixtures/rt01-fulfillment";
import { documentsState, TOMORROW } from "../fixtures/order-documents";
import { dueDate, dueSlot, inView } from "../../src/commerce/order-view";
import { dueDay } from "../../shared/order-days";
import { fulfillmentPending } from "../../shared/payment-fulfillment";
import {
  overviewAgenda,
  overviewMetrics,
} from "../../src/commerce/operations-overview";
import type { Workspace } from "../../src/commerce/api";
import type { Order } from "../../server/domain/model";

function workspace(o: Order) {
  return Object.assign(documentsState(), {
    orders: [o],
    actor: { id: "fixture", role: "operator" },
    agents: [],
    numbers: [],
  }) as unknown as Workspace;
}
test("R02 held ready/production/out orders count only as explicit fulfillment attention, not accepted dashboard work", () => {
  for (const state of ["Ready", "Production", "Out for Delivery"] as const) {
    const o = decisionOrder();
    o.state = state;
    const data = workspace(o),
      before = JSON.stringify(data);
    const m = overviewMetrics(data),
      a = overviewAgenda(data, TOMORROW);
    assert.equal(m.ready, 0);
    assert.equal(m.preparing, 0);
    assert.equal(m.deliveries, 0);
    assert.equal(m.attention, 1);
    assert.equal(a.scheduledToday, 0);
    assert.equal(a.deliveryReady, 0);
    assert.equal(a.pickupReady, 0);
    assert.equal(a.out, 0);
    assert.ok(
      a.priorities[0]!.reasons.includes("Fulfillment pending confirmation"),
    );
    assert.ok(!a.priorities[0]!.reasons.includes("Scheduled today"));
    assert.ok(!a.pipeline.some((x) => x.state === state && x.count > 0));
    assert.equal(JSON.stringify(data), before);
  }
});
for (const method of ["delivery", "pickup"] as const)
  test(`R02 accepted ${method} ignores opposite residual block in shared day, UI daily views and overview`, () => {
    const o = residualOrder(method),
      data = workspace(o);
    assert.equal(fulfillmentPending(o), false);
    assert.equal(dueDate(o), TOMORROW);
    assert.equal(dueDay(o), TOMORROW);
    assert.equal(dueSlot(o), "4:00 PM – 9:00 PM");
    assert.equal(inView(o, "tomorrow", "2026-11-04"), true);
    assert.equal(overviewAgenda(data, TOMORROW).scheduledToday, 1);
  });

import {
  inQueue,
  matchesView,
  matchesFilter,
  boardMetrics,
} from "../../src/commerce/orders-board";
import { ThreeLReportingSource } from "../../server/analytics/three-l-source";
import { reportingOrder } from "../fixtures/analytics";
import { docPayment } from "../fixtures/order-documents";
test("R02 sibling kitchen/readiness projections hold work without removing paid financial facts", () => {
  const o = decisionOrder();
  o.state = "Ready";
  o.audit.push({
    at: "2026-11-05T06:00:00Z",
    actor: "fixture",
    action: "paid",
    to: "Paid",
  });
  const p = docPayment(o),
    before = JSON.stringify(o);
  assert.equal(inQueue(o), false);
  assert.equal(matchesFilter(o, "ready"), false);
  assert.equal(matchesView(o, "today", TOMORROW), false);
  assert.equal(boardMetrics([o], [p], TOMORROW).todayOrders, 0);
  assert.equal(boardMetrics([o], [p], TOMORROW).todayRevenueFils, p.amountFils);
  assert.equal(JSON.stringify(o), before);
});
test("R02 analytics state presentation marks the hold but keeps captured amounts, frozen lines and fulfillment facts", () => {
  const state = documentsState(),
    { order, payment } = reportingOrder("TL-REPORT");
  order.state = "Ready";
  state.orders = [order];
  state.payments = [payment];
  const before = new ThreeLReportingSource(() => state).readFacts();
  order.paymentFulfillment = decisionOrder().paymentFulfillment;
  const held = new ThreeLReportingSource(() => state).readFacts();
  assert.equal(held.captures[0]!.state, "Fulfillment pending confirmation");
  assert.deepEqual({ ...held.captures[0], state: "Ready" }, before.captures[0]);
  assert.equal(order.state, "Ready");
});

import { fulfillmentSchedule } from "../../shared/fulfillment-schedule";
import {
  ordersCsv,
  orderDocuments,
  ordersZip,
} from "../../server/orders/documents";
import { printOrder } from "../../server/orders/print-documents";
import { TicketSchedule } from "../../src/commerce/PrintCenter";
import { OrdersList } from "../../src/commerce/OrdersList";
import { OrderDetailsPage } from "../../src/commerce/OrderDetails";
import { EMPTY_QUERY } from "../../src/commerce/order-view";
import { ticketSnapshot } from "../../src/commerce/ticket-snapshot";
import { inflateRawSync } from "node:zlib";
const actor = { id: "fixture", role: "admin" as const },
  at = new Date("2026-11-04T06:00:00Z");
function unzip(zip: Buffer) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const files: Buffer[] = [];
  let p = zip.readUInt32LE(end + 16);
  for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
    const local = zip.readUInt32LE(p + 42),
      start =
        local +
        30 +
        zip.readUInt16LE(local + 26) +
        zip.readUInt16LE(local + 28);
    files.push(
      inflateRawSync(zip.subarray(start, start + zip.readUInt32LE(p + 20))),
    );
    p +=
      46 +
      zip.readUInt16LE(p + 28) +
      zip.readUInt16LE(p + 30) +
      zip.readUInt16LE(p + 32);
  }
  return files;
}
test("R02 absent-decision historical pickup-first fallback remains unchanged; held decisions promise nothing", () => {
  const o = residualOrder("delivery");
  delete o.paymentFulfillment;
  assert.deepEqual(fulfillmentSchedule(o), {
    date: "2026-11-09",
    slot: "8:00 AM – 1:00 PM",
  });
  assert.equal(dueDay(o), "2026-11-09");
  o.paymentFulfillment = decisionOrder().paymentFulfillment;
  assert.deepEqual(fulfillmentSchedule(o), {});
});
for (const method of ["delivery", "pickup"] as const)
  test(`R02 actual ${method} list/detail/ticket markup uses effective promise with opposite block retained`, () => {
    const o = residualOrder(method),
      data = workspace(o),
      before = JSON.stringify(o);
    assert.ok(o.pickup && o.delivery);
    assert.ok(ticketSnapshot(o));
    const renders = [
      createElement(OrdersList, {
        data,
        query: EMPTY_QUERY,
        onQuery: () => {},
        onOpen: () => {},
      }),
      createElement(OrderDetailsPage, {
        data,
        orderId: o.id,
        run: async () => true,
        busy: false,
        openConversation: () => {},
        builder: () => null,
      }),
      createElement(TicketSchedule, { order: o }),
    ];
    for (const element of renders) {
      const html = renderToStaticMarkup(element);
      assert.match(html, /5 Nov 2026/);
      assert.match(html, /4:00 PM/);
      assert.ok(!html.includes("9 Nov 2026") && !html.includes("8:00 AM"));
    }
    assert.equal(JSON.stringify(o), before);
  });
for (const [kind, layout] of [
  ["packing-slip", "a4"],
  ["production-bulk", "a4"],
  ["delivery-note", "a4"],
  ["delivery-note", "a5"],
  ["delivery-note", "a5-two-up"],
] as const)
  test(`R02 residual schedules CSV/${kind}/${layout}/ZIP use accepted effective promise for both methods`, () => {
    const state = documentsState(),
      orders = [residualOrder("delivery"), residualOrder("pickup")];
    const before = JSON.stringify({ state, orders });
    const csv = ordersCsv(state, orders);
    assert.ok(csv.includes("2026-11-05") && csv.includes("4:00 PM"));
    assert.ok(!csv.includes("2026-11-09") && !csv.includes("8:00 AM"));
    const archive = unzip(ordersZip(state, orders, kind, actor, at, layout));
    for (const [i, o] of orders.entries()) {
      assert.equal(printOrder(state, o).day, TOMORROW);
      assert.equal(printOrder(state, o).slot, "4:00 PM – 9:00 PM");
      const doc = orderDocuments(state, [o], kind, actor, at, layout),
        text = doc.trace.join("\n");
      assert.match(text, /05 Nov 2026/);
      assert.match(text, /4:00 PM/);
      assert.ok(!text.includes("09 Nov 2026") && !text.includes("8:00 AM"));
      assert.deepEqual(archive[i], doc.pdf);
    }
    assert.equal(JSON.stringify({ state, orders }), before);
  });
