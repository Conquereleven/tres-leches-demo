/** Writes the synthetic TPL-18 Phase B sample PDFs: `tsx tests/fixtures/print-samples.ts <dir>`. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { documentsState } from "./order-documents";
import { orderDocuments, ordersZip } from "../../server/orders/documents";
import {
  PRINT_AT,
  printState,
  overflowOrder,
  reviewOrders,
} from "./print-documents";

const out = process.argv[2];
if (!out) throw new Error("Usage: print-samples.ts <output dir>");
mkdirSync(out, { recursive: true });
const state = printState();
state.orders.push(overflowOrder(), ...reviewOrders());
const pick = (...ids: string[]) =>
  ids.map((id) => state.orders.find((o) => o.id === id)!);
const actor = { id: "fixture-admin", role: "admin" as const };
const many = documentsState();
const jobs = [
  ["P1_Numeric_Arabic", "packing-slip", pick("TL-DEMO-NUMERALS"), "a4"],
  ["P2_Numeric_Arabic", "production-bulk", pick("TL-DEMO-NUMERALS"), "a4"],
  ["P3_Numeric_Arabic_A4", "delivery-note", pick("TL-DEMO-NUMERALS"), "a4"],
  ["P3_Numeric_Arabic_A5", "delivery-note", pick("TL-DEMO-NUMERALS"), "a5"],
  [
    "P3_Numeric_Arabic_TwoUp",
    "delivery-note",
    pick("TL-DEMO-NUMERALS", "TL-DEMO-AR"),
    "a5-two-up",
  ],
  ["P2_Oversized_Group", "production-bulk", pick("TL-DEMO-GROUP"), "a4"],
  ["P3_Long_Legacy_A4", "delivery-note", pick("TL-DEMO-LEGACY-LONG"), "a4"],
  ["P3_Long_Legacy_A5", "delivery-note", pick("TL-DEMO-LEGACY-LONG"), "a5"],
  [
    "P3_Long_Legacy_TwoUp",
    "delivery-note",
    pick("TL-DEMO-LEGACY-LONG"),
    "a5-two-up",
  ],
  ["P1_Bulk60", "packing-slip", many.orders.slice(0, 60), "a4"],
  ["P1_3L_Production_Standard", "packing-slip", pick("TL-DEMO-P1"), "a4"],
  ["P2_3L_Production_Event_Bulk", "production-bulk", pick("TL-DEMO-P2"), "a4"],
  ["P3_A5_Candidate", "delivery-note", pick("TL-DEMO-P1"), "a5"],
  ["P3_3L_Delivery_Note", "delivery-note", pick("TL-DEMO-P1"), "a4"],
  ["P3_3L_Delivery_Note_Arabic", "delivery-note", pick("TL-DEMO-AR"), "a4"],
  ["P3_3L_Delivery_Note_Pickup", "delivery-note", pick("TL-DEMO-PICKUP"), "a4"],
  [
    "P1_3L_Unpaid_and_Missing_Snapshot",
    "packing-slip",
    pick("TL-DEMO-UNPAID", "TL-DEMO-NOSNAP"),
    "a4",
  ],
  [
    "P3_A5_TwoUp_Candidate",
    "delivery-note",
    pick(
      "TL-DEMO-AR",
      "TL-DEMO-PICKUP",
      "TL-DEMO-N0",
      "TL-DEMO-N1",
      "TL-DEMO-P1",
    ),
    "a5-two-up",
  ],
  ["P1_Overflow", "packing-slip", pick("TL-DEMO-OVERFLOW"), "a4"],
  ["P2_Overflow", "production-bulk", pick("TL-DEMO-OVERFLOW"), "a4"],
  ["P3_Overflow_A5", "delivery-note", pick("TL-DEMO-OVERFLOW"), "a5"],
  [
    "P3_Mixed_TwoUp",
    "delivery-note",
    pick("TL-DEMO-AR", "TL-DEMO-P2", "TL-DEMO-OVERFLOW", "TL-DEMO-PICKUP"),
    "a5-two-up",
  ],
  ["P3_Pickup_A5", "delivery-note", pick("TL-DEMO-PICKUP"), "a5"],
  ["P3_Missing_A5", "delivery-note", pick("TL-DEMO-NOSNAP"), "a5"],
  ["P3_Unpaid_A5", "delivery-note", pick("TL-DEMO-UNPAID"), "a5"],
  [
    "P3_Pack_TwoUp",
    "delivery-note",
    pick("TL-DEMO-P1", "TL-DEMO-PICKUP"),
    "a5-two-up",
  ],
  ["P3_Oversized_Contents_A5", "delivery-note", pick("TL-DEMO-GROUP"), "a5"],
  ["P3_Event_Bulk_A5", "delivery-note", pick("TL-DEMO-P2"), "a5"],
] as const;
const manifest = [];
for (const [name, kind, orders, layout] of jobs) {
  const r = orderDocuments(
    state,
    [...orders],
    kind,
    actor,
    PRINT_AT,
    layout,
    true,
  );
  writeFileSync(join(out, `${name}.pdf`), r.pdf);
  manifest.push({
    name: `${name}.pdf`,
    pages: r.pages,
    logicalPages: r.logicalPages,
    ids: orders.map((o) => o.id),
    layout,
    kind,
  });
  console.log(`${name}.pdf ${r.pages} page(s) ${r.pdf.length} bytes`);
}

writeFileSync(
  join(out, "SYNTHETIC_60_Orders.zip"),
  ordersZip(many, many.orders.slice(0, 60), "packing-slip", actor, PRINT_AT),
);
writeFileSync(
  join(out, "SYNTHETIC_Mixed_A5.zip"),
  ordersZip(
    state,
    pick("TL-DEMO-AR", "TL-DEMO-P2", "TL-DEMO-OVERFLOW", "TL-DEMO-PICKUP"),
    "delivery-note",
    actor,
    PRINT_AT,
    "a5",
  ),
);
writeFileSync(
  join(out, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
