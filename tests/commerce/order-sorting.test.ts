import test from "node:test";
import assert from "node:assert/strict";
import type { Order, OrderState } from "../../server/domain/model";
import type { Workspace } from "../../src/commerce/api";
import { omsWorkspace } from "../fixtures/oms";
import {
  EMPTY_QUERY,
  PAGE_SIZE,
  createdAt,
  listOrders,
  orderPermissions,
  type ListQuery,
} from "../../src/commerce/order-view";

const make = (
  id: string,
  number: number | undefined,
  at: string | undefined,
  state: OrderState = "Confirmed",
): Order => {
  const o = structuredClone((omsWorkspace().orders as Order[])[0]!);
  o.id = id;
  o.publicOrderNumber = number;
  o.state = state;
  o.audit = at ? [{ at, actor: "synthetic", action: "created" }] : [];
  delete o.paidAt;
  return o;
};
const dataFor = (orders: Order[]) =>
  ({ ...omsWorkspace(), orders }) as unknown as Workspace;
const ids = (data: Workspace, query: Partial<ListQuery> = {}) =>
  listOrders(data, { ...EMPTY_QUERY, ...query }).rows.map((o) => o.id);

test("All: #200 above #199 and numeric #1000 above #999 despite earlier creation", () => {
  const data = dataFor([
    make("TL-199", 199, "2026-11-13T12:00:00Z"),
    make("TL-200", 200, "2026-11-12T10:38:00Z"),
    make("TL-999", 999, "2026-11-14T12:00:00Z"),
    make("TL-1000", 1000, "2026-11-10T12:00:00Z"),
  ]);
  assert.deepEqual(ids(data), ["TL-1000", "TL-999", "TL-200", "TL-199"]);
});

test("All: historical unnumbered and unpaid remain visible after numbered; deterministic creation/id ties", () => {
  const data = dataFor([
    make("TL-MISSING-B", undefined, undefined),
    make("TL-PENDING", undefined, "2026-11-15T12:00:00Z", "Awaiting Payment"),
    make("TL-TIE-B", undefined, "2026-11-14T12:00:00Z"),
    make("TL-MISSING-A", undefined, undefined),
    make("TL-TIE-A", undefined, "2026-11-14T12:00:00Z"),
    make("TL-NUMBERED", 200, undefined),
  ]);
  const before = structuredClone(data);
  const expected = [
    "TL-NUMBERED",
    "TL-PENDING",
    "TL-TIE-A",
    "TL-TIE-B",
    "TL-MISSING-A",
    "TL-MISSING-B",
  ];
  assert.deepEqual(ids(data), expected);
  assert.deepEqual(
    ids({ ...data, orders: [...data.orders].reverse() }),
    expected,
  );
  assert.deepEqual(data, before);
});

test("All: stored cancelled/refunded numbering is retained, never derived from live payment status", () => {
  const data = dataFor([
    make("TL-PAID", 199, "2026-11-15T12:00:00Z"),
    make("TL-CANCELLED", 201, "2026-11-12T12:00:00Z", "Cancelled"),
    make("TL-REFUNDED", 200, "2026-11-11T12:00:00Z", "Delivered"),
    make("TL-UNPAID", undefined, "2026-11-16T12:00:00Z", "Awaiting Payment"),
  ]);
  data.orders.forEach((o, i) => {
    o.paymentId = `synthetic-payment-${i}`;
  });
  data.payments = data.orders.map((o, i) => ({
    ...data.payments[0]!,
    id: o.paymentId!,
    orderId: o.id,
    status: i === 2 ? "refunded" : i === 3 ? "pending" : "paid",
  }));
  assert.deepEqual(ids(data), [
    "TL-CANCELLED",
    "TL-REFUNDED",
    "TL-PAID",
    "TL-UNPAID",
  ]);
  assert.deepEqual(ids(data, { payment: "issue" }), ["TL-REFUNDED"]);
  assert.deepEqual(ids(data, { fulfilment: "unpaid" }), ["TL-UNPAID"]);
});

for (const [state, group] of [
  ["Production", "preparing"],
  ["Ready", "ready"],
  ["Confirmed", "confirmed"],
] as const)
  test(`${group} group retains chronology rather than numeric priority`, () => {
    const data = dataFor([
      make("TL-OLDER", 1000, "2026-11-12T12:00:00Z", state),
      make("TL-NEWER", 199, "2026-11-13T12:00:00Z", state),
    ]);
    assert.deepEqual(ids(data, { fulfilment: group }), [
      "TL-NEWER",
      "TL-OLDER",
    ]);
  });

test("All pagination (>25), filters/search and Created At bounds use the original creation event", () => {
  const data = dataFor(
    Array.from({ length: 40 }, (_, i) => {
      const o = make(
        `TL-PAGE-${i}`,
        200 + i,
        i % 2 ? "2026-11-12T10:38:00Z" : "2026-11-13T12:00:00Z",
      );
      o.paidAt = "2026-11-15T12:51:00Z";
      return o;
    }),
  );
  const all = listOrders(data, EMPTY_QUERY);
  assert.equal(PAGE_SIZE, 25);
  assert.equal(all.total, 40);
  assert.deepEqual(
    all.rows.map((o) => o.publicOrderNumber),
    Array.from({ length: 25 }, (_, i) => 239 - i),
  );
  const second = listOrders(data, { ...EMPTY_QUERY, page: 2 });
  assert.equal(second.rows.length, 15);
  assert.equal(second.rows[0]!.publicOrderNumber, 214);
  assert.equal(listOrders(data, { ...EMPTY_QUERY, page: 999 }).page, 2);
  assert.deepEqual(ids(data, { q: "#200" }), ["TL-PAGE-0"]);
  const filtered = listOrders(data, {
    ...EMPTY_QUERY,
    placedFrom: "2026-11-12",
    placedTo: "2026-11-12",
  });
  assert.equal(filtered.total, 20);
  assert.ok(filtered.rows.every((o) => createdAt(o)!.startsWith("2026-11-12")));
  assert.deepEqual(
    filtered.rows.map((o) => o.publicOrderNumber),
    Array.from({ length: 20 }, (_, i) => 239 - i * 2),
  );
});

test("sorting is presentation only: stored facts, internal lookup keys and role permissions remain unchanged", () => {
  const data = dataFor([
    make("TL-INTERNAL-A", 200, undefined),
    make("TL-INTERNAL-B", 199, "2026-11-15T12:00:00Z"),
  ]);
  const before = structuredClone(data);
  for (const role of ["admin", "manager", "operator", "agent"] as const) {
    data.actor = { id: "synthetic-role", role };
    const permissions = data.orders.map((o) =>
      orderPermissions(data, o, data.conversations[0], data.payments[0]),
    );
    listOrders(data, EMPTY_QUERY);
    assert.deepEqual(
      data.orders.map((o) =>
        orderPermissions(data, o, data.conversations[0], data.payments[0]),
      ),
      permissions,
    );
  }
  data.actor = before.actor;
  assert.deepEqual(data, before);
});
