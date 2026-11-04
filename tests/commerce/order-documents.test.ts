import test from "node:test";
import assert from "node:assert/strict";
import type { Workspace } from "../../src/commerce/api";
import {
  EMPTY_QUERY,
  PAGE_SIZE,
  deliveredWithoutEvidence,
  listOrders,
  matchingOrders,
  parseListQuery,
  serializeListQuery,
  type ListQuery,
} from "../../src/commerce/order-view";
import { completedAt, dubaiDay, nextDay } from "../../shared/order-days";
import {
  CSV_COLUMNS,
  csvCell,
  ordersCsv,
  ordersPdf,
} from "../../server/orders/documents";
import { PdfDocument } from "../../server/orders/pdf";
import {
  PII,
  PROVIDER_REF,
  TODAY,
  TOMORROW,
  documentsState,
} from "../fixtures/order-documents";

const state = documentsState();
const data = state as unknown as Workspace;
const q = (over: Partial<ListQuery>) => ({ ...EMPTY_QUERY, ...over });
const ids = (over: Partial<ListQuery>, today = TODAY) =>
  matchingOrders(data, q(over), today).map((o) => o.id);
const actor = { id: "fixture-admin", role: "admin" as const };

/** Text drawn by the PDF (hex strings decoded from the content streams). */
const pdfText = (pdf: Buffer) =>
  [...pdf.toString("latin1").matchAll(/<([0-9a-f]+)> Tj/g)]
    .map((m) => Buffer.from(m[1]!, "hex").toString("latin1"))
    .join("\n");

test("Dubai calendar: midnight boundary and next day are host-timezone independent", () => {
  assert.equal(dubaiDay("2026-11-03T19:59:59Z"), "2026-11-03");
  assert.equal(dubaiDay("2026-11-03T20:00:00Z"), "2026-11-04");
  assert.equal(nextDay("2026-12-31"), "2027-01-01");
  assert.equal(nextDay("2028-02-28"), "2028-02-29");
});

test("Delivered today uses only the persisted Delivered transition on the Dubai day", () => {
  const today = ids({ view: "delivered-today" });
  assert.deepEqual(today.sort(), ["TL-JUSTAFTER", "TL-PICKEDUP"]);
  assert.ok(!today.includes("TL-JUSTBEFORE"), "23:59 Dubai yesterday");
  assert.ok(!today.includes("TL-NOEVIDENCE"), "no audit evidence");
  assert.equal(deliveredWithoutEvidence(state.orders), 1);
  assert.equal(
    completedAt(state.orders.find((o) => o.id === "TL-NOEVIDENCE")!),
    null,
  );
  // The view rolls over: the same data seen on the next Dubai day.
  assert.deepEqual(ids({ view: "delivered-today" }, TOMORROW), []);
});

test("Scheduled tomorrow: due date, not placement; excludes delivered and cancelled; paid work first", () => {
  const rows = ids({ view: "tomorrow" });
  for (const id of [
    "TL-JUSTAFTER",
    "TL-NOEVIDENCE",
    "TL-CANCELLED",
    "TL-LATER",
  ])
    assert.ok(!rows.includes(id), id);
  assert.ok(rows.includes("TL-UNPAID") && rows.includes("TL-DRAFT"));
  assert.ok(rows.includes("TL-INJECT"));
  const firstWaiting = rows.findIndex(
    (id) => id === "TL-UNPAID" || id === "TL-DRAFT",
  );
  assert.ok(
    rows
      .slice(firstWaiting)
      .every((id) => id === "TL-UNPAID" || id === "TL-DRAFT"),
    "unpaid and draft are listed after actionable orders",
  );
  // Combined with an existing filter.
  assert.deepEqual(ids({ view: "tomorrow", payment: "pending" }), [
    "TL-UNPAID",
  ]);
});

test("All-matching selection spans every page, not only the visible 25", () => {
  const all = matchingOrders(data, q({ view: "tomorrow" }), TODAY);
  assert.ok(all.length > PAGE_SIZE * 2);
  const seen = new Set<string>();
  const first = listOrders(data, q({ view: "tomorrow" }), TODAY);
  assert.equal(first.rows.length, PAGE_SIZE);
  for (let page = 1; page <= first.pages; page++)
    for (const o of listOrders(data, q({ view: "tomorrow", page }), TODAY).rows)
      seen.add(o.id);
  assert.deepEqual([...seen].sort(), all.map((o) => o.id).sort());
  assert.equal(
    parseListQuery(serializeListQuery(q({ view: "delivered-today" }))).view,
    "delivered-today",
  );
  assert.equal(parseListQuery("?view=bogus").view, "all");
});

test("CSV: one row per order, no personal or provider data, formula injection neutralised", () => {
  const orders = state.orders.filter((o) =>
    ["TL-INJECT", "TL-DRAFT", "TL-JUSTAFTER", "TL-UNPAID"].includes(o.id),
  );
  const csv = ordersCsv(state, orders);
  assert.ok(csv.startsWith("﻿"));
  const lines = csv.slice(1).trimEnd().split("\r\n");
  // Header + four rows; the embedded LF stays inside its quoted cell.
  assert.equal(lines[0], CSV_COLUMNS.map((c) => `"${c}"`).join(","));
  assert.equal(lines.length, 1 + 4);
  for (const secret of [
    PII,
    "private-fixture@example.invalid",
    "+971500000000",
    "Fictional Street",
    PROVIDER_REF,
    "HYPERLINK",
  ])
    assert.ok(!csv.includes(secret), secret);
  assert.ok(csv.includes(`"'=cmd|""/c calc""!A1, ""quoted""\nline"`));
  assert.equal(csvCell("@SUM(1)"), `"'@SUM(1)"`);
  assert.equal(csvCell(" \t-1"), `"' \t-1"`);
  assert.equal(csvCell("ünïcødé"), `"ünïcødé"`);
  const draft = csv.split("\r\n").find((l) => l.includes("TL-DRAFT"))!;
  assert.match(draft, /"","not final \(draft\)"/);
  const delivered = csv.split("\r\n").find((l) => l.includes("TL-JUSTAFTER"))!;
  assert.match(delivered, /"2026-11-04 00:30"$/);
  const unpaid = csv.split("\r\n").find((l) => l.includes("TL-UNPAID"))!;
  assert.match(unpaid, /"Awaiting Payment","pending"/);
  assert.equal(ordersCsv(state, []).slice(1).trimEnd(), lines[0]);
  // Same input, same bytes: repeatable and historically stable.
  assert.equal(ordersCsv(state, orders), csv);
});

test("PDF: valid structure, one page per order, stored facts only, explicit unknowns", () => {
  const pick = (...want: string[]) =>
    want.map((id) => state.orders.find((o) => o.id === id)!);
  const at = new Date("2026-11-04T06:00:00Z");
  const pdf = ordersPdf(
    state,
    pick("TL-BULK000", "TL-UNPAID", "TL-NOSNAPSHOT", "TL-PICKEDUP"),
    "delivery-note",
    actor,
    at,
  );
  const raw = pdf.toString("latin1");
  assert.ok(raw.startsWith("%PDF-1.4"));
  assert.ok(raw.trimEnd().endsWith("%%EOF"));
  assert.equal((raw.match(/\/Type \/Page /g) ?? []).length, 4);
  // Every xref offset points at the object it names.
  const xref = Number(/startxref\n(\d+)/.exec(raw)![1]);
  const table = raw.slice(xref).split("\n").slice(3);
  table
    .filter((l) => l.endsWith(" n "))
    .forEach((l, i) =>
      assert.ok(raw.startsWith(`${i + 1} 0 obj`, Number(l.slice(0, 10)))),
    );
  const text = pdfText(pdf);
  assert.match(text, /DELIVERY NOTE/);
  assert.match(text, /PICKUP ORDER SHEET/);
  assert.match(text, /not an invoice, tax invoice or receipt/);
  assert.match(text, /2 × Fictional tres leches/);
  assert.match(text, /NOT PAID OR NOT CONFIRMED · do not prepare or dispatch/);
  assert.match(text, /Items unavailable: the stored order snapshot is missing/);
  assert.match(text, /Collected: 2026-11-04 15:00 \(Dubai\)/);
  assert.match(text, /Address: Fixture Tower, 1 Fictional Street/);
  assert.match(
    text,
    /Generated 2026-11-04 10:00 Dubai by fixture-admin · Page 4 of 4/,
  );
  assert.ok(!text.includes(PROVIDER_REF));
  assert.ok(
    !/\b(AED|VAT|TRN|Tax Invoice No)\b/.test(text),
    "no amounts or fiscal fields",
  );
  // Packing slips omit the address and phone.
  const slip = pdfText(
    ordersPdf(state, pick("TL-BULK000"), "packing-slip", actor, at),
  );
  assert.match(slip, /PACKING SLIP/);
  assert.ok(!slip.includes("Fictional Street") && !slip.includes("+971"));
  assert.match(slip, new RegExp(`Customer: ${PII} Fixture`));
});

test("PDF writer wraps long text, paginates and flags unprintable characters", () => {
  const doc = new PdfDocument("t");
  doc.newPage();
  for (let i = 0; i < 80; i++) doc.text(`Line ${i} ` + "word ".repeat(40));
  assert.ok(doc.pageCount > 3);
  doc.text("Name: سارة · Ünïcode ok");
  assert.equal(doc.takeLossy(), 4);
  const text = pdfText(doc.toBuffer(() => "f"));
  assert.ok(text.includes("Name: ???? · Ünïcode ok"));
  doc.text("x".repeat(400));
  assert.ok(
    pdfText(doc.toBuffer(() => "f"))
      .split("\n")
      .some((l) => /^x+$/.test(l) && l.length < 400),
  );
});
