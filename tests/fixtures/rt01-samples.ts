/** Synthetic downloadable artifacts; output must be explicitly supplied. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { documentsState, docPayment } from "./order-documents";
import {
  decisionOrder,
  heldOrders,
  acceptedResidualOrder,
} from "./rt01-fulfillment";
import {
  orderDocuments,
  ordersCsv,
  ordersZip,
} from "../../server/orders/documents";
const out = process.argv[2];
if (!out) throw new Error("Explicit external evidence directory required");
mkdirSync(out, { recursive: true });
const state = documentsState();
const orders = [
  ...heldOrders(),
  decisionOrder("auto-rescheduled"),
  decisionOrder("auto-rescheduled", "pickup"),
  acceptedResidualOrder("delivery"),
  acceptedResidualOrder("pickup"),
];
state.orders.push(...orders);
state.payments.push(...orders.map((o) => docPayment(o)));
const actor = { id: "fixture-admin", role: "admin" as const };
const at = new Date("2026-11-04T06:00:00Z");
writeFileSync(join(out, "synthetic-decisions.csv"), ordersCsv(state, orders));
for (const [kind, layout] of [
  ["packing-slip", "a4"],
  ["production-bulk", "a4"],
  ["delivery-note", "a4"],
  ["delivery-note", "a5"],
  ["delivery-note", "a5-two-up"],
] as const) {
  const key = `${kind}-${layout}`;
  const doc = orderDocuments(state, orders, kind, actor, at, layout);
  writeFileSync(join(out, `${key}.pdf`), doc.pdf);
  writeFileSync(join(out, `${key}.txt`), doc.trace.join("\n"));
  writeFileSync(
    join(out, `${key}.zip`),
    ordersZip(state, orders, kind, actor, at, layout),
  );
}
console.log("Synthetic CSV + five PDFs/traces/ZIPs written to", out);
