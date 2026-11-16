import test from "node:test";
import assert from "node:assert/strict";
import type { Workspace } from "../../src/commerce/api";
import { DomainError } from "../../server/domain/model";
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
  orderDocuments,
  ordersCsv,
  ordersPdf,
  ordersZip,
} from "../../server/orders/documents";
import {
  MAX_ZIP_BYTES,
  MAX_ZIP_ENTRIES,
  ZipLimitError,
  ZipWriter,
  zipFiles,
} from "../../server/orders/zip";
import { crc32 as zlibCrc32, inflateRawSync } from "node:zlib";
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

/** Printed text in logical order, as the renderer drew it. */
const printed = (...args: Parameters<typeof orderDocuments>) =>
  orderDocuments(...args).trace.join("\n");
const pageCount = (pdf: Buffer) =>
  (pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;

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
  assert.ok(csv.startsWith("\ufeff"));
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
  const orders = pick(
    "TL-BULK000",
    "TL-UNPAID",
    "TL-NOSNAPSHOT",
    "TL-PICKEDUP",
  );
  const pdf = ordersPdf(state, orders, "delivery-note", actor, at);
  const raw = pdf.toString("latin1");
  assert.ok(raw.startsWith("%PDF-1.7"));
  assert.ok(raw.trimEnd().endsWith("%%EOF"));
  assert.equal(pageCount(pdf), 4);
  // Every xref offset points at the object it names.
  const xref = Number(/startxref\n(\d+)/.exec(raw)![1]);
  const table = raw.slice(xref).split("\n").slice(3);
  table
    .filter((l) => l.endsWith(" n "))
    .forEach((l, i) =>
      assert.ok(raw.startsWith(`${i + 1} 0 obj`, Number(l.slice(0, 10)))),
    );
  const text = printed(state, orders, "delivery-note", actor, at);
  assert.match(text, /^Delivery Note$/m);
  assert.match(text, /Pickup handover/);
  assert.match(text, /Not an invoice, tax invoice or receipt/);
  assert.match(text, /^2\n×\nFictional tres leches$/m);
  assert.match(text, /NOT PAID OR NOT CONFIRMED · DO NOT PREPARE OR DISPATCH/);
  assert.match(text, /Items unavailable: the stored order snapshot is missing/);
  assert.match(text, /Collected 2026-11-04 15:00 \(Dubai\)/);
  assert.match(text, /^Fixture Tower\n1 Fictional Street\nFixture Area$/m);
  assert.match(text, /Generated 2026-11-04 10:00 Dubai by fixture-admin/);
  // Numbered per order: four one-page orders.
  assert.equal(text.match(/^Page 1 of 1$/gm)?.length, 4);
  assert.ok(!text.includes(PROVIDER_REF));
  assert.ok(
    !/\b(AED|VAT|TRN|Tax Invoice No)\b/.test(text),
    "no amounts or fiscal fields",
  );
  // Production documents omit the address and phone.
  const slip = printed(state, pick("TL-BULK000"), "packing-slip", actor, at);
  assert.match(slip, /^Production & Packing$/m);
  assert.ok(!slip.includes("Fictional Street") && !slip.includes("+971"));
  assert.match(slip, new RegExp(`^${PII} Fixture$`, "m"));
});

test("Delivery note with an Arabic customer name and notes prints the Arabic text", () => {
  const o = {
    ...state.orders.find((x) => x.id === "TL-BULK002")!,
    id: "TL-ARABIC",
    customerDetails: {
      firstName: "سارة",
      lastName: "Fixture",
      instructions: "بدون مكسرات",
    },
  };
  const r = orderDocuments(state, [o], "delivery-note", actor);
  const text = r.trace.join("\n");
  assert.match(text, /^سارة Fixture$/m);
  assert.match(text, /^بدون مكسرات$/m);
  assert.ok(!text.includes("see order page") && !text.includes("?"));
  assert.deepEqual(r.markers, [0]);
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
  const text = printed(
    state,
    [legacy],
    "delivery-note",
    actor,
    new Date("2026-11-04T06:00:00Z"),
  );
  assert.match(text, /^Customer notes\nKeep boxes separate\nNo nuts$/m);
  assert.match(text, /^Villa 9, Fictional Legacy Road$/m);
  assert.match(text, /Address NOT verified · confirm with the customer/);
  assert.match(
    text,
    /^Fictional unreviewed item\n! REVIEW\nProduct translation requires review \(fixture-unknown\)$/m,
  );
  assert.match(text, /3 units · no prices on this document/);
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
  const at = new Date("2026-11-04T06:00:00Z");
  const zip = ordersZip(state, [...pick, numbered], "packing-slip", actor, at);
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
  // Each entry is exactly the single-order document, byte for byte.
  for (const [i, e] of entries.entries()) {
    assert.equal(pageCount(e.data), 1);
    assert.ok(
      e.data.equals(
        ordersPdf(state, [[...pick, numbered][i]!], "packing-slip", actor, at),
      ),
    );
  }
  assert.match(
    printed(state, [pick[1]!], "packing-slip", actor, at),
    /NOT PAID OR NOT CONFIRMED/,
  );
  assert.match(
    printed(state, [pick[2]!], "packing-slip", actor, at),
    /Items unavailable/,
  );
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
  // The budget covers the finished archive, and generation stops early.
  const big = Buffer.alloc(MAX_ZIP_BYTES / 2 + 1, 0x41);
  assert.throws(
    () =>
      zipFiles([
        { name: "a.pdf", data: big },
        { name: "b.pdf", data: big },
      ]),
    ZipLimitError,
  );
  const writer = new ZipWriter();
  writer.add("a.pdf", Buffer.from("x"));
  // A refused entry changes nothing: later valid entries still fit.
  assert.throws(
    () => writer.add("big.pdf", Buffer.alloc(MAX_ZIP_BYTES)),
    ZipLimitError,
  );
  writer.add("b.pdf", Buffer.from("y"));
  assert.deepEqual(
    readZip(
      zipFiles([
        { name: "a.pdf", data: Buffer.from("x") },
        { name: "b.pdf", data: Buffer.from("y") },
      ]),
    ).map((e) => e.name),
    ["a.pdf", "b.pdf"],
  );
  assert.ok(writer.size < MAX_ZIP_BYTES);
  assert.equal(
    writer.finish().length,
    writer.size,
    "size includes directory and end record",
  );
  const one = readZip(
    zipFiles([{ name: "a.pdf", data: pdf }], new Date("2026-11-05T20:30:00Z")),
  );
  assert.equal(one[0]!.data.toString(), "%PDF-1.4\n");
});

test("ZIP over the writer's bounds becomes a clear 413, never a partial archive", () => {
  const base = state.orders.find((o) => o.id === "TL-BULK000")!;
  const many = Array.from({ length: MAX_ZIP_ENTRIES + 1 }, (_, i) => ({
    ...base,
    id: `TL-MANY${i}`,
  }));
  assert.throws(
    () => ordersZip(state, many, "packing-slip", actor),
    (e: unknown) => e instanceof DomainError && e.status === 413,
  );
});
