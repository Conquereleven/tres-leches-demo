import test from "node:test";
import assert from "node:assert/strict";
import type { Order } from "../../server/domain/model";
import type { Workspace } from "../../src/commerce/api";
import { omsWorkspace } from "../fixtures/oms";
import {
  EMPTY_QUERY,
  listOrders,
  recognizedPaidAt,
} from "../../src/commerce/order-view";

function fixture() {
  const data = omsWorkspace() as unknown as Workspace;
  data.orders = [structuredClone(data.orders[0]!)];
  const order = data.orders[0]!;
  delete order.paidAt;
  order.audit.push({
    at: "2026-11-13T12:51:00Z",
    actor: "synthetic",
    action: "paid",
    to: "Paid",
  });
  const payment = data.payments.find((p) => p.id === order.paymentId)!;
  delete payment.paidAt;
  return { data, order, payment };
}

test("coverage: malformed public numbers sort as unnumbered without mutating persisted values", () => {
  const { data, order } = fixture();
  const values = [0, -3, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1];
  data.orders = values.map((value, i): Order => ({
    ...structuredClone(order),
    id: `TL-INVALID-${i}`,
    publicOrderNumber: value,
    audit: [
      { at: "2026-11-15T12:00:00Z", actor: "synthetic", action: "created" },
    ],
  }));
  data.orders.push({
    ...structuredClone(order),
    id: "TL-VALID",
    publicOrderNumber: 200,
    audit: [],
  });
  const before = structuredClone(data);
  assert.deepEqual(
    listOrders(data, EMPTY_QUERY).rows.map((o) => o.id),
    ["TL-VALID", ...values.map((_, i) => `TL-INVALID-${i}`)],
  );
  assert.deepEqual(data, before);
});

test("coverage: invalid stored paidAt stays unknown, without payment or audit inference", () => {
  const f = fixture();
  f.order.paidAt = "invalid-stored-timestamp";
  f.payment.paidAt = "2026-11-13T12:51:00Z";
  assert.equal(recognizedPaidAt(f.data, f.order), undefined);
  delete f.order.paidAt;
  f.payment.paidAt = "also-invalid";
  assert.equal(recognizedPaidAt(f.data, f.order), undefined);
});

test("coverage: payment from another order cannot expose paid recognition", () => {
  const f = fixture();
  f.payment.orderId = "TL-DIFFERENT-ORDER";
  f.payment.paidAt = "2026-11-13T12:51:00Z";
  assert.equal(recognizedPaidAt(f.data, f.order), undefined);
});

test("coverage: All numeric order survives payment and method filters", () => {
  const { data, order, payment } = fixture();
  data.orders = [
    {
      ...structuredClone(order),
      id: "TL-199",
      publicOrderNumber: 199,
      paymentId: "p199",
      fulfillmentMethod: "pickup",
      audit: [
        { at: "2026-11-15T12:00:00Z", actor: "synthetic", action: "created" },
      ],
    },
    {
      ...structuredClone(order),
      id: "TL-200",
      publicOrderNumber: 200,
      paymentId: "p200",
      fulfillmentMethod: "pickup",
      audit: [
        { at: "2026-11-12T10:38:00Z", actor: "synthetic", action: "created" },
      ],
    },
    {
      ...structuredClone(order),
      id: "TL-300",
      publicOrderNumber: 300,
      paymentId: "p300",
      fulfillmentMethod: "delivery",
    },
  ];
  data.payments = data.orders.map((o) => ({
    ...structuredClone(payment),
    id: o.paymentId!,
    orderId: o.id,
    status: o.id === "TL-300" ? "pending" : "paid",
  }));
  for (const filter of [
    { payment: "paid" as const },
    { method: "pickup" as const },
    { payment: "paid" as const, method: "pickup" as const },
  ])
    assert.deepEqual(
      listOrders(data, { ...EMPTY_QUERY, ...filter }).rows.map((o) => o.id),
      ["TL-200", "TL-199"],
    );
});
