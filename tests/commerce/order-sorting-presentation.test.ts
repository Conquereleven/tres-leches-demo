import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrdersList } from "../../src/commerce/OrdersList";
import {
  OrderPageHeading,
  OrderPaymentCard,
} from "../../src/commerce/OrderDetails";
import { EMPTY_QUERY, orderPermissions } from "../../src/commerce/order-view";
import { formatOpsDate } from "../../src/commerce/ops-i18n";
import { omsWorkspace } from "../fixtures/oms";
import type { Workspace } from "../../src/commerce/api";

function fixture() {
  const data = omsWorkspace() as unknown as Workspace;
  data.orders = [structuredClone(data.orders[0]!)];
  const o = data.orders[0]!;
  o.audit = [
    { at: "2026-11-12T10:38:00.000Z", actor: "synthetic", action: "created" },
    {
      at: "2026-11-13T12:51:00.000Z",
      actor: "synthetic",
      action: "paid",
      to: "Paid",
    },
  ];
  delete o.paidAt;
  const p = data.payments.find((p) => p.id === o.paymentId)!;
  delete p.paidAt;
  return { data, o, p };
}
const list = (data: Workspace) =>
  renderToStaticMarkup(
    createElement(OrdersList, {
      data,
      query: EMPTY_QUERY,
      onQuery: () => {},
      onOpen: () => {},
    }),
  );
const payment = ({ data, o, p }: ReturnType<typeof fixture>) =>
  renderToStaticMarkup(
    createElement(OrderPaymentCard, {
      data,
      order: o,
      payment: p,
      permissions: orderPermissions(data, o),
      busy: false,
      act: () => {},
    }),
  );

test("list and detail distinguish Created at from stored first 3L paid recognition", () => {
  const f = fixture();
  f.o.paidAt = "2026-11-13T12:51:00.000Z";
  f.p.paidAt = f.o.paidAt;
  const html = list(f.data);
  assert.match(html, />Created at</);
  assert.match(html, /Paid at \(3L recognition\)/);
  assert.ok(html.includes(formatOpsDate(f.o.audit[0]!.at, "en")));
  assert.ok(html.includes(formatOpsDate(f.o.paidAt, "en")));
  const heading = renderToStaticMarkup(
    createElement(OrderPageHeading, {
      data: f.data,
      orderId: f.o.id,
      onBack: () => {},
    }),
  );
  assert.ok(heading.includes(formatOpsDate(f.o.audit[0]!.at, "en")));
  assert.ok(payment(f).includes(formatOpsDate(f.o.paidAt, "en")));
});

test("missing paidAt is Not stored despite a Paid audit event; unnumbered remains explicit", () => {
  const f = fixture();
  delete f.o.publicOrderNumber;
  const html = list(f.data);
  assert.match(html, />Unnumbered</);
  assert.match(html, /Paid at \(3L recognition\).*?Not stored/s);
  const card = payment(f);
  assert.match(card, /Paid at \(3L recognition\).*?Not stored/s);
  assert.ok(!card.includes(formatOpsDate(f.o.audit[1]!.at, "en")));
});

test("stored payment acknowledgement is a fallback; missing creation remains unknown", () => {
  const f = fixture();
  f.o.audit = [];
  f.p.paidAt = "2026-11-13T12:51:00.000Z";
  const html = list(f.data);
  assert.match(html, /data-label="Created at".*?Not stored/s);
  assert.ok(html.includes(formatOpsDate(f.p.paidAt, "en")));
  assert.ok(payment(f).includes(formatOpsDate(f.p.paidAt, "en")));
});

for (const value of [0, -3, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])
  test(`malformed public number ${String(value)} renders the Unnumbered marker`, () => {
    const f = fixture();
    f.o.publicOrderNumber = value;
    const before = structuredClone(f.data);
    const html = list(f.data);
    assert.match(html, />Unnumbered</);
    assert.ok(html.includes(`>${f.o.id}</a>`));
    assert.deepEqual(f.data, before);
  });

test("valid issued public number retains its display and no Unnumbered marker", () => {
  const f = fixture();
  f.o.publicOrderNumber = 200;
  const html = list(f.data);
  assert.match(html, />#200</);
  assert.doesNotMatch(html, />Unnumbered</);
});
