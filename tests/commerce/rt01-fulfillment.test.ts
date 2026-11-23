/** Synthetic consumer regression; no payment writer or provider calls. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  docOrder,
  docPayment,
  documentsState,
  TODAY,
  TOMORROW,
} from "../fixtures/order-documents";
import {
  dueDate,
  dueSlot,
  inView,
  isActionable,
  orderPermissions,
} from "../../src/commerce/order-view";
import { ordersCsv } from "../../server/orders/documents";

import { decisionOrder, heldOrders } from "../fixtures/rt01-fulfillment";
test("RT01 held paid schedule is neither promised nor actionable in list, detail and CSV", () => {
  const o = decisionOrder();
  assert.equal(isActionable(o), false);
  assert.equal(dueDate(o), undefined);
  assert.equal(dueSlot(o), undefined);
  assert.equal(inView(o, "tomorrow", TODAY), false);
  assert.equal(
    orderPermissions({ actor: { id: "fixture", role: "admin" }, agents: [] }, o)
      .next,
    null,
  );
  const csv = ordersCsv(documentsState(), [o]);
  assert.match(csv, /FULFILLMENT REVIEW REQUIRED/);
  assert.ok(!csv.includes(TOMORROW));
  assert.ok(!csv.includes("4:00 PM – 9:00 PM"));
});

import {
  EMPTY_QUERY,
  matchingOrders,
  listOrders,
  fulfilmentLabel,
} from "../../src/commerce/order-view";
import { fulfillmentPending } from "../../shared/payment-fulfillment";
import { ticketSnapshot } from "../../src/commerce/ticket-snapshot";
import { orderDocuments, ordersZip } from "../../server/orders/documents";
import { printOrder } from "../../server/orders/print-documents";
import type { Workspace } from "../../src/commerce/api";
import { inflateRawSync } from "node:zlib";
const actor = { id: "fixture-admin", role: "admin" as const };
const at = new Date("2026-11-04T06:00:00Z");
const variants = [
  ["packing-slip", "a4"],
  ["production-bulk", "a4"],
  ["delivery-note", "a4"],
  ["delivery-note", "a5"],
  ["delivery-note", "a5-two-up"],
] as const;
function unzip(zip: Buffer) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const files: Buffer[] = [];
  let pos = zip.readUInt32LE(end + 16);
  for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
    const local = zip.readUInt32LE(pos + 42);
    const start =
      local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    files.push(
      inflateRawSync(zip.subarray(start, start + zip.readUInt32LE(pos + 20))),
    );
    pos +=
      46 +
      zip.readUInt16LE(pos + 28) +
      zip.readUInt16LE(pos + 30) +
      zip.readUInt16LE(pos + 32);
  }
  return files;
}
test("RT01 present unsafe decisions fail closed; accepted pickup/delivery and absent history retain semantics", () => {
  for (const o of heldOrders()) {
    assert.equal(fulfillmentPending(o), true, o.id);
    assert.equal(isActionable(o), false, o.id);
    assert.equal(dueDate(o), undefined);
    assert.equal(dueSlot(o), undefined);
    assert.equal(inView(o, "tomorrow", TODAY), false);
    assert.equal(fulfilmentLabel(o), "Fulfillment pending confirmation");
    assert.equal(ticketSnapshot(o), null);
    assert.equal(orderPermissions({ actor, agents: [] }, o).next, null);
  }
  for (const method of ["pickup", "delivery"] as const) {
    const o = decisionOrder("auto-rescheduled", method);
    assert.equal(fulfillmentPending(o), false);
    assert.equal(isActionable(o), true);
    assert.equal(dueDate(o), TOMORROW);
    assert.equal(dueSlot(o), "4:00 PM – 9:00 PM");
    assert.equal(inView(o, "tomorrow", TODAY), true);
    assert.ok(ticketSnapshot(o));
    assert.equal(
      orderPermissions({ actor, agents: [] }, o).next?.to,
      "Production",
    );
    o.paymentFulfillment!.status = "unchanged";
    o.paymentFulfillment!.original.date = TOMORROW;
    assert.equal(fulfillmentPending(o), false);
  }
  assert.equal(isActionable(docOrder("TL-HISTORICAL")), true);
  assert.ok(ticketSnapshot(docOrder("TL-HISTORICAL")));
});
test("RT01 daily grouping, sorting, search and all-matching selection preserve >25 pages without held promises", () => {
  const state = documentsState();
  state.orders.push(...heldOrders(), decisionOrder("auto-rescheduled"));
  const data = state as unknown as Workspace;
  const all = matchingOrders(data, EMPTY_QUERY, TODAY);
  assert.ok(all.length > 50);
  assert.ok(all.some((o) => o.id.startsWith("TL-RT01-HELD")));
  const tomorrow = matchingOrders(
    data,
    { ...EMPTY_QUERY, view: "tomorrow" },
    TODAY,
  );
  assert.ok(!tomorrow.some((o) => o.id.startsWith("TL-RT01-HELD")));
  assert.ok(tomorrow.some((o) => o.id === "TL-RT01-delivery-auto-rescheduled"));
  const waiting = tomorrow.findIndex((o) => !isActionable(o));
  assert.ok(tomorrow.slice(waiting).every((o) => !isActionable(o)));
  const pages = listOrders(data, EMPTY_QUERY, TODAY).pages;
  const paged = Array.from(
    { length: pages },
    (_, i) => listOrders(data, { ...EMPTY_QUERY, page: i + 1 }, TODAY).rows,
  ).flat();
  assert.deepEqual(
    paged.map((o) => o.id),
    all.map((o) => o.id),
  );
  assert.equal(
    matchingOrders(data, { ...EMPTY_QUERY, q: "TL-RT01-HELD0" }, TODAY).length,
    1,
  );
  assert.equal(
    matchingOrders(
      data,
      { ...EMPTY_QUERY, q: "TL-RT01-HELD0", dueFrom: TOMORROW },
      TODAY,
    ).length,
    0,
  );
});
for (const [kind, layout] of variants)
  test(`RT01 ${kind}/${layout}: held dates suppressed; accepted date retained; ZIP equals actual individual PDFs`, () => {
    const state = documentsState();
    const held = heldOrders();
    const accepted = decisionOrder("auto-rescheduled");
    const unchanged = decisionOrder("unchanged");
    unchanged.paymentFulfillment!.original.date = TOMORROW;
    const orders = [
      ...held,
      accepted,
      decisionOrder("auto-rescheduled", "pickup"),
      unchanged,
    ];
    state.payments.push(...orders.map((o) => docPayment(o)));
    const before = JSON.stringify({ state, orders });
    const csv = ordersCsv(state, held);
    assert.ok(!csv.includes(TOMORROW) && !csv.includes("4:00 PM – 9:00 PM"));
    assert.equal(
      (csv.match(/FULFILLMENT REVIEW REQUIRED/g) ?? []).length,
      held.length,
    );
    for (const o of held) {
      const model = printOrder(state, o);
      assert.equal(model.day, null);
      assert.equal(model.slot, undefined);
      assert.match(model.hold!, /FULFILLMENT REVIEW REQUIRED/);
      const text = orderDocuments(
        state,
        [o],
        kind,
        actor,
        at,
        layout,
      ).trace.join("\n");
      assert.match(text, /FULFILLMENT REVIEW REQUIRED/);
      assert.ok(
        !text.includes("snapshot is missing"),
        "a fulfillment hold does not prove missing snapshot data",
      );
      assert.ok(
        !text.includes("05 Nov 2026") && !text.includes("4:00 PM – 9:00 PM"),
      );
    }
    const positive = orderDocuments(
      state,
      [accepted],
      kind,
      actor,
      at,
      layout,
    ).trace.join("\n");
    assert.match(positive, /05 Nov 2026/);
    assert.match(positive, /4:00 PM – 9:00 PM/);
    assert.ok(!positive.includes("FULFILLMENT REVIEW REQUIRED"));
    const zip = unzip(ordersZip(state, orders, kind, actor, at, layout));
    assert.equal(zip.length, orders.length);
    zip.forEach((bytes, i) =>
      assert.deepEqual(
        bytes,
        orderDocuments(state, [orders[i]!], kind, actor, at, layout).pdf,
      ),
    );
    assert.equal(JSON.stringify({ state, orders }), before);
  });

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrdersList } from "../../src/commerce/OrdersList";
import { OrderDetailsPage } from "../../src/commerce/OrderDetails";
import { translateOps } from "../../src/commerce/ops-i18n";
import { orderFulfilmentGroup } from "../../src/commerce/order-view";
test("RT01 actual list/detail markup suppresses held promises and progress actions; EN/TL review resources exist", () => {
  for (const state of ["Confirmed", "Ready", "Out for Delivery"] as const) {
    const o = decisionOrder();
    o.state = state;
    const data = Object.assign(documentsState(), {
      orders: [o],
      actor,
      agents: [],
    }) as unknown as Workspace;
    const list = renderToStaticMarkup(
      createElement(OrdersList, {
        data,
        query: EMPTY_QUERY,
        onQuery: () => {},
        onOpen: () => {},
      }),
    );
    const detail = renderToStaticMarkup(
      createElement(OrderDetailsPage, {
        data,
        orderId: o.id,
        run: async () => true,
        busy: false,
        openConversation: () => {},
        builder: () => null,
      }),
    );
    for (const html of [list, detail]) {
      assert.match(html, /Fulfillment review required/);
      assert.ok(!html.includes("5 Nov 2026"));
      assert.ok(!html.includes("4:00 PM"));
      assert.ok(
        !html.includes("Start preparation") &&
          !html.includes("Mark ready") &&
          !html.includes("Send for delivery"),
      );
    }
    assert.equal(orderFulfilmentGroup(o), "review");
    assert.equal(
      matchingOrders(data, { ...EMPTY_QUERY, fulfilment: "ready" }).length,
      0,
    );
    assert.equal(
      matchingOrders(data, { ...EMPTY_QUERY, fulfilment: "review" }).length,
      1,
    );
  }
  for (const language of ["en", "tl"] as const) {
    assert.notEqual(
      translateOps(language, "Fulfillment pending confirmation"),
      "Fulfillment pending confirmation",
    );
    assert.notEqual(
      translateOps(
        language,
        "Fulfillment pending customer and 3L team confirmation.",
      ),
      "Fulfillment pending customer and 3L team confirmation.",
    );
  }
});
