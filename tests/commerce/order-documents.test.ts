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
  ordersZip,
} from "../../server/orders/documents";
import { MAX_ZIP_ENTRIES, zipFiles } from "../../server/orders/zip";
import { crc32 as zlibCrc32, inflateRawSync } from "node:zlib";
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
    .map((m) =>
      new TextDecoder("windows-1252").decode(Buffer.from(m[1]!, "hex")),
    )
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

test("PDF writer wraps long text, paginates and marks unprintable scripts explicitly", () => {
  const doc = new PdfDocument("t");
  doc.newPage();
  for (let i = 0; i < 80; i++) doc.text(`Line ${i} ` + "word ".repeat(40));
  assert.ok(doc.pageCount > 3);
  doc.text("Name: سارة أحمد · Ünïcode ok\tok");
  assert.equal(doc.takeLossy(), 1, "a multi-word Arabic name is one run");
  doc.text("Ольга · 王芳 · Cake 🎂 · \u2003gap");
  assert.equal(doc.takeLossy(), 3);
  const text = pdfText(doc.toBuffer(() => "f"));
  assert.ok(
    text.includes("Name: [Arabic text – see order page] · Ünïcode ok ok"),
  );
  assert.ok(
    text.includes(
      "[Cyrillic text – see order page] · [Chinese text – see order page] · Cake [emoji] · gap",
    ),
  );
  assert.ok(!text.includes("?"), "no character is replaced by a question mark");
  const breaks = new PdfDocument("b");
  breaks.text("No\u200bnuts · a\u0007b · c\ufeffd · e\u2060f");
  assert.equal(breaks.takeLossy(), 0);
  assert.ok(
    pdfText(breaks.toBuffer(() => "f")).startsWith("No nuts · a b · c d · e f"),
  );
  doc.text("x".repeat(400));
  assert.ok(
    pdfText(doc.toBuffer(() => "f"))
      .split("\n")
      .some((l) => /^x+$/.test(l) && l.length < 400),
  );
});

test("Delivery note with an Arabic customer name and notes says so on the page", () => {
  const o = {
    ...state.orders.find((x) => x.id === "TL-BULK002")!,
    id: "TL-ARABIC",
    customerDetails: {
      firstName: "سارة",
      lastName: "Fixture",
      instructions: "بدون مكسرات",
    },
  };
  const text = pdfText(ordersPdf(state, [o], "delivery-note", actor));
  assert.match(text, /Customer: \[Arabic text – see order page\] Fixture/);
  assert.match(text, /Customer notes: \[Arabic text – see order page\]/);
  assert.match(
    text,
    /it is marked above\. The exact text is on the order page\./,
  );
  assert.ok(!text.includes("?"));
});

test("Review fixes: line breaks kept, legacy address fallback, unknown names flagged, units labelled", () => {
  const legacy = {
    ...state.orders.find((o) => o.id === "TL-BULK001")!,
    id: "TL-LEGACY",
    delivery: undefined,
    address: "Villa 9, Fictional Legacy Road",
    customerDetails: {
      firstName: "Fixture",
      instructions: "Keep boxes separate\nNo nuts",
    },
    lines: [{ productId: "fixture-unknown", quantity: 3 }],
    catalogSnapshot: [
      {
        id: "fixture-unknown",
        name: "Fictional unreviewed item",
        category: "Fictional",
        priceFils: 3000,
      },
    ],
  };
  legacy.quote = { ...legacy.quote!, subtotalFils: 9000 };
  const text = pdfText(
    ordersPdf(
      state,
      [legacy],
      "delivery-note",
      actor,
      new Date("2026-11-04T06:00:00Z"),
    ),
  );
  assert.match(text, /Customer notes: Keep boxes separate\nNo nuts/);
  assert.match(text, /Address: Villa 9, Fictional Legacy Road/);
  assert.match(text, /Address not verified · confirm with the customer/);
  assert.match(
    text,
    /3 × Fictional unreviewed item\nProduct translation requires review \(fixture-unknown\)/,
  );
  assert.match(text, /Ordered units: 3/);
  assert.ok(!text.includes("Total pieces"));
});

/** Independent minimal reader: central directory → inflate → CRC check. */
function readZip(zip: Buffer) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, "end of central directory");
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const entries: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    assert.equal(zip.readUInt32LE(at), 0x02014b50);
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString("ascii");
    assert.equal(zip.readUInt32LE(local), 0x04034b50);
    const start =
      local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    assert.equal(method, 8);
    const data = inflateRawSync(zip.subarray(start, start + size));
    assert.equal(zlibCrc32(data), crc, `${name} crc`);
    assert.equal(data.length, zip.readUInt32LE(at + 24));
    entries.push({ name, data });
    at += 46 + nameLength;
  }
  return entries;
}

test("ZIP: one single-order PDF per selected order, safe unique names, selection order", () => {
  const pick = ["TL-BULK003", "TL-UNPAID", "TL-NOSNAPSHOT"].map((id) =>
    state.orders.find((o) => o.id === id)!,
  );
  const numbered = { ...pick[0]!, id: "TL-NUMBERED", publicOrderNumber: 7 };
  const zip = ordersZip(state, [...pick, numbered], "packing-slip", actor);
  const entries = readZip(zip);
  assert.deepEqual(
    entries.map((e) => e.name),
    [
      "001-packing-slip-TL-BULK003.pdf",
      "002-packing-slip-TL-UNPAID.pdf",
      "003-packing-slip-TL-NOSNAPSHOT.pdf",
      "004-packing-slip-007.pdf",
    ],
  );
  for (const [i, e] of entries.entries()) {
    const raw = e.data.toString("latin1");
    assert.ok(raw.startsWith("%PDF-1.4"));
    assert.equal((raw.match(/\/Type \/Page /g) ?? []).length, 1);
    assert.match(
      pdfText(e.data),
      new RegExp(
        `Order ${["TL-BULK003", "TL-UNPAID", "TL-NOSNAPSHOT", "#007"][i]}`,
      ),
    );
  }
  assert.match(pdfText(entries[1]!.data), /NOT PAID OR NOT CONFIRMED/);
  assert.match(pdfText(entries[2]!.data), /Items unavailable/);
  assert.ok(!zip.includes(Buffer.from(PROVIDER_REF)));
});

test("ZIP writer refuses empty, oversized, unsafe and duplicate entries", () => {
  const pdf = Buffer.from("%PDF-1.4\n");
  assert.throws(() => zipFiles([]), /count/);
  assert.throws(
    () =>
      zipFiles(
        Array.from({ length: MAX_ZIP_ENTRIES + 1 }, (_, i) => ({
          name: `f${i}.pdf`,
          data: pdf,
        })),
      ),
    /count/,
  );
  for (const name of [
    "../evil.pdf",
    "a/b.pdf",
    "C:\\x.pdf",
    ".hidden",
    "",
    "a b.pdf",
    "é.pdf",
    "x".repeat(101),
  ])
    assert.throws(() => zipFiles([{ name, data: pdf }]), /Unsafe/, name);
  assert.throws(
    () =>
      zipFiles([
        { name: "a.pdf", data: pdf },
        { name: "a.pdf", data: pdf },
      ]),
    /Duplicate/,
  );
  const one = readZip(
    zipFiles([{ name: "a.pdf", data: pdf }], new Date("2026-11-05T20:30:00Z")),
  );
  assert.equal(one[0]!.data.toString(), "%PDF-1.4\n");
});
