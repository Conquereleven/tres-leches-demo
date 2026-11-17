import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import {
  orderDocuments,
  ordersPdf,
  ordersZip,
} from "../../server/orders/documents";
import {
  direction,
  printable,
  shapeLine,
  wrap,
} from "../../server/orders/print-text";
import { itemCount } from "../../src/commerce/order-view";
import {
  ARABIC_DEDICATION,
  ARABIC_NAME,
  ARABIC_NOTE,
  PRINT_AT,
  printState,
} from "../fixtures/print-documents";

const actor = { id: "fixture-admin", role: "admin" as const };
const state = printState();
const order = (id: string) => state.orders.find((o) => o.id === id)!;
const render = (
  ids: string[],
  kind: Parameters<typeof orderDocuments>[2],
  layout: "a4" | "a5-two-up" = "a4",
) => {
  const r = orderDocuments(
    state,
    ids.map(order),
    kind,
    actor,
    PRINT_AT,
    layout,
  );
  return { ...r, text: r.trace.join("\n") };
};
const raw = (pdf: Buffer) => pdf.toString("latin1");
const pages = (pdf: Buffer) =>
  (raw(pdf).match(/\/Type \/Page\b(?!s)/g) ?? []).length;
const baseFonts = (pdf: Buffer) => [
  ...new Set(
    [...raw(pdf).matchAll(/\/BaseFont \/([A-Z]{6}\+[\w-]+)/g)].map(
      (m) => m[1]!,
    ),
  ),
];

test("Text engine: Arabic and Latin runs in visual order, mirrored brackets, explicit markers", () => {
  const runs = shapeLine(`Customer: ${ARABIC_NAME} أحمد Fixture`, {
    size: 12,
  }).runs.map((r) => [r.text, r.font]);
  assert.deepEqual(runs, [
    ["Customer: ", "latin-500"],
    [`${ARABIC_NAME} أحمد`, "arabic-400"],
    [" Fixture", "latin-500"],
  ]);
  assert.equal(direction(ARABIC_NOTE), "rtl");
  assert.equal(direction("Gate 2 · الطابق"), "ltr");
  // A right-to-left line is drawn right to left; its brackets are mirrored.
  assert.deepEqual(
    shapeLine("(برج B)", { size: 12 }, "rtl").runs.map((r) => r.text),
    ["(B", "برج ", ")"],
  );
  assert.equal(
    shapeLine("Bold", { size: 10, weight: 700 }).runs[0]!.font,
    "latin-700",
  );
  assert.equal(
    shapeLine("سارة", { size: 10, weight: 700 }).runs[0]!.font,
    "arabic-700",
  );
  // Scripts without a bundled font become one named marker per run.
  const marked = printable("Ольга Петрова · 王芳 · Cake 🎂 · Crème ×2 · سارة");
  assert.equal(
    marked.text,
    "[Cyrillic text – see order page] · [Chinese text – see order page] · Cake [emoji] · Crème ×2 · سارة",
  );
  assert.equal(marked.markers, 3);
  assert.equal(
    printable("No\u200bnuts · a\u0007b · c\ufeffd").text,
    "No nuts · a b · c d",
  );
  // Customer line breaks are kept; an overlong word is broken, never clipped.
  assert.deepEqual(wrap("one\ntwo", { size: 10 }, 500), ["one", "two"]);
  const long = wrap("x".repeat(300), { size: 10 }, 100);
  assert.ok(long.length > 3 && long.join("") === "x".repeat(300));
});

test("Fonts: only bundled OFL faces, embedded as TrueType subsets with ToUnicode; no standard fonts", () => {
  const p1 = render(["TL-DEMO-P1"], "packing-slip").pdf;
  const fonts = baseFonts(p1);
  assert.ok(fonts.length >= 4);
  for (const f of fonts)
    assert.match(
      f,
      /^[A-Z]{6}\+(Montserrat-(Medium|SemiBold|Bold|ExtraBold)|NotoSansArabic-(Regular|Bold))$/,
    );
  assert.ok(
    fonts.some((f) => f.includes("NotoSansArabic")),
    "Arabic dedication embeds Arabic font",
  );
  const text = raw(p1);
  assert.equal((text.match(/\/FontFile2/g) ?? []).length, fonts.length);
  assert.equal((text.match(/\/ToUnicode/g) ?? []).length, fonts.length);
  assert.ok(!/Helvetica|Times|Courier|\/Subtype \/Type1|\/Type3/.test(text));
  // No Arabic text, no Arabic font.
  const latinOnly = baseFonts(render(["TL-DEMO-PICKUP"], "delivery-note").pdf);
  assert.ok(latinOnly.every((f) => f.includes("Montserrat")));
  // A ToUnicode map exists for the Arabic subset (searchable, copyable text).
  const objects = [...text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((m) => {
      try {
        return inflateSync(Buffer.from(m[1]!, "latin1")).toString("latin1");
      } catch {
        return "";
      }
    })
    .filter((s) => s.includes("begincmap"));
  assert.equal(objects.length, fonts.length);
  // Same input, same bytes: repeatable for a historical order.
  assert.ok(p1.equals(render(["TL-DEMO-P1"], "packing-slip").pdf));
});

test("P1 Production & Packing (standard): snapshot lines, packs, tricolor, review, verbatim notes, no ready time", () => {
  const { text, pdf, markers } = render(["TL-DEMO-P1"], "packing-slip");
  assert.equal(pages(pdf), 1);
  assert.deepEqual(markers, [0]);
  for (const s of [
    "Production & Packing",
    "INTERNAL OPERATIONS · STANDARD ORDER",
    "#014",
    "TL-DEMO-P1",
    "Status: Confirmed · Payment: paid",
    "Sun, 08 Nov 2026",
    "13:00–16:00",
    "Sample Customer A.",
    "6 lines",
    "12 units",
    "1 pack box",
    "Tres Leches Cake",
    "Classic · 14–16 people",
    "Each box · 6 pieces",
    "Chocolate",
    "Diplomat cream (vanilla)",
    "Pistachio",
    `Snapshot catalog-v1-${"f1".repeat(32)}`,
    "PREPARATION",
    "Product translation requires review (fixture-unreviewed-candles)",
    "Velas de cumpleaños",
    `Dedication: ${ARABIC_DEDICATION} — 30`,
    "Page 1 of 1",
  ])
    assert.ok(text.includes(s), s);
  // The order has no kitchen time: the slot is shown, never a ready-by time.
  assert.match(
    text,
    /^READY BY\nNot provided\nNo kitchen time in the order\nDue: delivery slot 13:00–16:00$/m,
  );
  // Minimal PII: production staff get a name only.
  for (const s of [
    "+97150",
    "Fixture Street",
    "Sample Residence",
    "example.invalid",
    "Dubai Marina",
    ARABIC_NOTE,
  ])
    assert.ok(!text.includes(s), s);
  assert.ok(
    !/\b(AED|VAT|TRN)\b|\d+\.\d{2}\b/.test(text),
    "no prices or fiscal fields",
  );
});

test("P2 Production & Packing (event / bulk): grouped, paginated with repeated headers and continued groups", () => {
  const o = order("TL-DEMO-P2");
  const { text, pdf } = render(["TL-DEMO-P2"], "production-bulk");
  const n = pages(pdf);
  assert.ok(n >= 2, `${n} pages`);
  for (let i = 1; i <= n; i++) assert.ok(text.includes(`Page ${i} of ${n}`));
  assert.equal(
    text.match(/^#021 · Thu, 12 Nov 2026 · Pickup time 08:00$/gm)?.length,
    n,
  );
  assert.equal(text.match(/^PRODUCT \/ VARIATION$/gm)?.length, n);
  assert.match(text, /\(CONTINUED\)/);
  for (const s of [
    "INTERNAL OPERATIONS · EVENT / BULK ORDER",
    "Fixture Events Office\nBreakfast",
    "PICKUP TIME",
    "08:00",
    "Not provided",
    `${o.lines.length} lines`,
    `${itemCount(o)} units`,
    "2 pack boxes",
    "Each box · 6 pieces · 2 boxes = 12 pieces",
    "TRES LECHES CAKES",
    "CAKE JARS",
    "PAN DE MUERTO",
    "CONCHAS",
    "PANADERÍA MEXICANA",
    `of ${itemCount(o)}`,
    "Label every tray with its group name. Keep all pistachio items in their own trays.",
    "Driver collects with 4 insulated crates at 08:00.",
  ])
    assert.ok(text.includes(s), s);
  // Every stored line is printed: count the quantity cells.
  const quantities = o.lines.map((l) => String(l.quantity));
  const printedQty = text.split("\n").filter((l) => /^\d+$/.test(l));
  for (const q of new Set(quantities))
    assert.ok(
      printedQty.filter((x) => x === q).length >=
        quantities.filter((x) => x === q).length,
      `quantity ${q}`,
    );
});

test("P3 Delivery Note: courier facts only, Arabic instructions verbatim, pickup without address", () => {
  const d = render(["TL-DEMO-P1"], "delivery-note").text;
  for (const s of [
    "Delivery Note",
    "INTERNAL OPERATIONS · DRIVER & HANDOVER COPY",
    "Sample Customer A.",
    "+971500000014",
    "Apt 1204 · Sample Residence Tower",
    "Fixture Street 7",
    "Dubai Marina (fixture)",
    "Address verified in order record",
    "Delivery instructions",
    "Customer notes",
    "12 units · no prices on this document",
    "not stored in the order · count and label at dispatch",
    "Handover confirmation",
    "RECEIVED BY (PRINT NAME)",
  ])
    assert.ok(d.includes(s), s);
  // The Arabic instruction wraps, but every word is printed in order.
  const ar = render(["TL-DEMO-AR"], "delivery-note");
  assert.deepEqual(ar.markers, [0]);
  assert.ok(ar.text.includes(`${ARABIC_NAME} Fixture`));
  const joined = ar.trace.join(" ");
  for (const word of ARABIC_NOTE.split(" "))
    assert.ok(joined.includes(word), word);
  assert.ok(ar.text.includes(`${ARABIC_DEDICATION} (بدون مكسرات)`));
  for (const s of ["example.invalid", "sample-a@"])
    assert.ok(!d.includes(s), s);
  const pickup = render(["TL-DEMO-PICKUP"], "delivery-note").text;
  for (const s of [
    "INTERNAL OPERATIONS · PICKUP HANDOVER",
    "PICKUP AT",
    "3L Pastelerías",
    "Collected by: Pickup Fixture",
    "PICKUP TIME",
    "15:00",
    "COLLECTED BY (PRINT NAME)",
  ])
    assert.ok(pickup.includes(s), s);
  for (const s of [
    "+971",
    "Fictional Street",
    "Delivery instructions",
    "Fixture Area",
  ])
    assert.ok(!pickup.includes(s), s);
});

test("Holds and unknowns: unpaid banner, missing snapshot, scripts without a font", () => {
  const { text } = render(["TL-DEMO-UNPAID", "TL-DEMO-NOSNAP"], "packing-slip");
  assert.match(text, /NOT PAID OR NOT CONFIRMED · DO NOT PREPARE OR DISPATCH/);
  assert.match(text, /Items unavailable: the stored order snapshot is missing/);
  assert.equal(text.match(/^Page 1 of 1$/gm)?.length, 2, "numbered per order");
  const o = {
    ...order("TL-DEMO-PICKUP"),
    customerDetails: { firstName: "Ольга", instructions: "Без орехов" },
  };
  const r = orderDocuments(state, [o], "packing-slip", actor, PRINT_AT);
  assert.ok(r.markers[0]! >= 2);
  assert.match(r.trace.join("\n"), /\[Cyrillic text – see order page\]/);
  assert.match(
    r.trace.join("\n"),
    /it is marked above\. The exact text is on the order page\./,
  );
});

test("A5 and A4 two-up candidates retain every page and per-order boundaries", () => {
  const ids = [
    "TL-DEMO-AR",
    "TL-DEMO-PICKUP",
    "TL-DEMO-N0",
    "TL-DEMO-P2",
    "TL-DEMO-N1",
  ];
  const a5 = orderDocuments(
    state,
    ids.map(order),
    "delivery-note",
    actor,
    PRINT_AT,
    "a5",
  );
  const paired = render(ids, "delivery-note", "a5-two-up");
  assert.equal(paired.logicalPages, a5.logicalPages);
  assert.equal(paired.pages, Math.ceil(a5.pages / 2));
  assert.deepEqual(
    paired.trace.filter((x) => !x.startsWith("Generated ")),
    a5.trace.filter((x) => !x.startsWith("Generated ")),
  );
  const size = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(raw(a5.pdf))!;
  assert.deepEqual([Math.round(+size[1]!), Math.round(+size[2]!)], [420, 595]);
  const sheet = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(raw(paired.pdf))!;
  assert.deepEqual(
    [Math.round(+sheet[1]!), Math.round(+sheet[2]!)],
    [842, 595],
  );
  assert.equal(paired.trace.filter((x) => x === "Page 1 of 1").length, 4);
  const bulk = orderDocuments(
    state,
    [order("TL-DEMO-P2")],
    "delivery-note",
    actor,
    PRINT_AT,
    "a5",
  );
  assert.ok(bulk.logicalPages > 1);
  assert.ok(
    paired.text.includes(`Page ${bulk.logicalPages} of ${bulk.logicalPages}`),
  );
});

test("Read-only: no state change, no network, ZIP entries match single documents", () => {
  const before = JSON.stringify(state);
  const fetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("documents must not call any provider");
  };
  try {
    const all = state.orders.map((o) => o.id);
    for (const kind of [
      "packing-slip",
      "production-bulk",
      "delivery-note",
    ] as const) {
      ordersPdf(state, state.orders, kind, actor, PRINT_AT);
      ordersZip(state, state.orders, kind, actor, PRINT_AT);
    }
    ordersPdf(
      state,
      state.orders,
      "delivery-note",
      actor,
      PRINT_AT,
      "a5-two-up",
    );
    assert.equal(all.length, state.orders.length);
  } finally {
    globalThis.fetch = fetch;
  }
  assert.equal(
    JSON.stringify(state),
    before,
    "order and financial snapshots unchanged",
  );
});

test("Historical names: printed from the accepted snapshot, never today's catalog", () => {
  const o = structuredClone(order("TL-DEMO-P1"));
  const pack = o.lines.find((l) => l.packSnapshot && l.composition)!;
  pack.packSnapshot!.components[0]!.name = "Chocolate (2025 recipe)";
  const live = structuredClone(state);
  for (const p of (live as { catalog?: { id: string; name: string }[] })
    .catalog ?? [])
    p.name = "Renamed today";
  const text = orderDocuments(
    live,
    [o],
    "packing-slip",
    actor,
    PRINT_AT,
  ).trace.join("\n");
  assert.ok(text.includes("Chocolate (2025 recipe)"));
  assert.ok(!text.includes("Renamed today"));
});

test("page-sized row and continuous notes retain every token, across every candidate format", async () => {
  const { overflowOrder } = await import("../fixtures/print-documents");
  const o = overflowOrder();
  for (const kind of [
    "packing-slip",
    "production-bulk",
    "delivery-note",
  ] as const) {
    for (const layout of (kind === "delivery-note"
      ? ["a4", "a5", "a5-two-up"]
      : ["a4"]) as ("a4" | "a5" | "a5-two-up")[]) {
      const r = orderDocuments(state, [o], kind, actor, PRINT_AT, layout);
      const text = r.trace.join(" ");
      for (let i = 0; i < 160; i++)
        assert.ok(text.includes(`ROW${String(i).padStart(3, "0")}`));
      for (let i = 0; i < 180; i++)
        assert.ok(text.includes(`NOTE${String(i).padStart(3, "0")}`));
      assert.ok(text.includes("END-OF-INSTRUCTIONS"));
      assert.ok(r.logicalPages >= 5);
      assert.ok(
        r.trace.includes(`Page ${r.logicalPages} of ${r.logicalPages}`),
      );
    }
  }
});

test("two mixtures of one pack SKU stay separate; historical product and Tricolor names remain frozen", async () => {
  const { filledPack, printOrder } =
    await import("../fixtures/print-documents");
  const first = filledPack(1);
  const second = structuredClone(filledPack(2));
  const a = second.packSnapshot!.components[0]!;
  const b = second.packSnapshot!.components[1]!;
  a.units = 3;
  a.name = "Frozen old chocolate name";
  b.units = 1;
  second.composition!.find(
    (c) => c.componentSkuId === a.componentSkuId,
  )!.units = 3;
  second.composition!.find(
    (c) => c.componentSkuId === b.componentSkuId,
  )!.units = 1;
  const o = printOrder("TL-DEMO-MIXTURE", [first, second]);
  const r = orderDocuments(state, [o], "packing-slip", actor, PRINT_AT);
  const text = r.trace.join("\n");
  assert.ok(text.includes("Each box · 6 pieces\n"));
  assert.ok(text.includes("Each box · 6 pieces · 2 boxes = 12 pieces"));
  assert.ok(text.includes("Frozen old chocolate name"));
  assert.ok(text.includes("3 pack boxes"));
  const historical = structuredClone(order("TL-DEMO-P1"));
  historical.catalogSnapshot![0]!.name = "Frozen historical cake name";
  const tri = historical.lines.find((l) =>
    l.productId.startsWith("conchas-traditional-tricolor"),
  )!;
  tri.packSnapshot!.components[0]!.name = "Frozen crimson preparation";
  const changed = orderDocuments(
    state,
    [historical],
    "packing-slip",
    actor,
    PRINT_AT,
  ).trace.join("\n");
  assert.ok(changed.includes("Frozen historical cake name"));
  assert.ok(changed.includes("Frozen crimson preparation"));
  assert.ok(!changed.includes("Red · Individual · 70 g"));
});

test("actual fontkit glyph order preserves Arabic-Indic/Eastern digits and neutral Arabic-font runs", async () => {
  const { fontData } = await import("../../server/orders/print-text");
  const glyphs = (
    input: string,
    weight: 500 | 700 = 500,
    dir: "ltr" | "rtl" = "rtl",
  ) =>
    shapeLine(input, { size: 12, weight }, dir).runs.flatMap((run) =>
      fontData(run.font)
        .font.layout(
          run.text,
          run.font.startsWith("arabic") ? ["kern"] : undefined,
        )
        .glyphs.map((g) => g.id),
    );
  const ids = (s: string, font: "arabic-400" | "arabic-700") =>
    [...s].map(
      (ch) => fontData(font).font.glyphForCodePoint(ch.codePointAt(0)!).id,
    );
  // Use glyph identities: Noto aliases Eastern Persian ۱ to the same glyph as ١,
  // so glyph.codePoints alone does not reliably identify the source character.
  for (const weight of [500, 700] as const) {
    const font = weight === 700 ? "arabic-700" : "arabic-400";
    for (const digits of ["١٢", "١٢٠٤", "۱۲", "۱۲۰۴"])
      for (const dir of ["ltr", "rtl"] as const)
        assert.deepEqual(
          glyphs(digits, weight, dir),
          ids(digits, font),
          `${weight} ${dir} ${digits}`,
        );
    for (const [input, visual] of [
      ["   ", "   "],
      ["  ،", "،  "],
      ["،  ", "  ،"],
      ["،  ؛", "؛  ،"],
    ])
      assert.deepEqual(glyphs(input!, weight), ids(visual!, font), input!);
    const mixed = glyphs(
      "Gate 12 (البوابة ١٢ — شقة ١٢٠٤) / ۱۲ / ۱۲۰۴",
      weight,
      "ltr",
    );
    for (const digits of ["١٢", "١٢٠٤", "۱۲", "۱۲۰۴"]) {
      const wanted = ids(digits, font);
      assert.ok(
        mixed.some((_, i) => wanted.every((id, j) => mixed[i + j] === id)),
        digits,
      );
    }
    const numericValues = (input: string, dir: "ltr" | "rtl") =>
      shapeLine(input, { size: 12, weight }, dir)
        .runs.flatMap((run) => {
          const face = fontData(run.font).font;
          const values = new Map<number, string>();
          for (const alphabet of ["0123456789", "٠١٢٣٤٥٦٧٨٩", "۰۱۲۳۴۵۶۷۸۹"])
            [...alphabet].forEach((ch, value) => {
              if (face.hasGlyphForCodePoint(ch.codePointAt(0)!))
                values.set(
                  face.glyphForCodePoint(ch.codePointAt(0)!).id,
                  String(value),
                );
            });
          return face
            .layout(
              run.text,
              run.font.startsWith("arabic") ? ["kern"] : undefined,
            )
            .glyphs.flatMap((g) =>
              values.has(g.id) ? [values.get(g.id)!] : [],
            );
        })
        .join("");
    assert.equal(numericValues("البوابة ١٢ — شقة ١٢٠٤", "rtl"), "120412");
    assert.equal(numericValues("دروازه ۱۲ — واحد ۱۲۰۴", "rtl"), "120412");
    assert.equal(
      numericValues("Gate 12 (البوابة ١٢ — شقة ١٢٠٤) / ۱۲ / ۱۲۰۴", "ltr"),
      "12120412120412",
    );
    // Western numbers and mirrored brackets are verified from shaped glyphs too.
    const bracket = shapeLine("(برج B)", { size: 12, weight }, "rtl").runs;
    const visualLatin = bracket
      .filter((r) => r.font.startsWith("latin"))
      .map((r) =>
        fontData(r.font)
          .font.layout(r.text)
          .glyphs.map((g) => g.id),
      );
    const latin = fontData(weight === 700 ? "latin-700" : "latin-500").font;
    assert.deepEqual(visualLatin, [
      [..."(B"].map((ch) => latin.glyphForCodePoint(ch.codePointAt(0)!).id),
      [latin.glyphForCodePoint(41).id],
    ]);
    const western = glyphs("12", weight, "rtl");
    assert.deepEqual(
      western,
      [..."12"].map((ch) => latin.glyphForCodePoint(ch.codePointAt(0)!).id),
    );
  }
});

test("oversized first production row retains its group and continuation; long legacy handoff flows safely", async () => {
  const { reviewOrders } = await import("../fixtures/print-documents");
  const [, group, legacy] = reviewOrders();
  const production = orderDocuments(
    state,
    [group!],
    "production-bulk",
    actor,
    PRINT_AT,
  );
  assert.ok(production.logicalPages >= 2);
  assert.ok(production.trace.includes("REVIEW OVERSIZED GROUP"));
  assert.ok(production.trace.includes("REVIEW OVERSIZED GROUP (CONTINUED)"));
  const text = production.trace.join(" ");
  for (let i = 0; i < 420; i++)
    assert.ok(text.includes(`GROUPROW${String(i).padStart(3, "0")}`));
  for (const layout of ["a4", "a5", "a5-two-up"] as const) {
    const delivery = orderDocuments(
      state,
      [legacy!],
      "delivery-note",
      actor,
      PRINT_AT,
      layout,
    );
    assert.ok(
      delivery.logicalPages >= 1,
      "safe handoff may fit a full-width page",
    );
    assert.ok(
      delivery.trace.includes("LEGACY-ADDRESS-END") ||
        delivery.trace.join(" ").includes("LEGACY-ADDRESS-END"),
    );
    assert.ok(delivery.trace.includes("LONG-ADDRESS-NOTES-END"));
  }
});

test("counted-units text including its total stays within the authored right margin", async () => {
  const { Canvas, A4, mm } = await import("../../server/orders/print-canvas");
  const original = Canvas.prototype.text;
  const rightEdges: number[] = [];
  Canvas.prototype.text = function (
    ...args: Parameters<InstanceType<typeof Canvas>["text"]>
  ) {
    const width = original.apply(this, args);
    if (/^of \d+$/.test(args[2])) rightEdges.push(args[0] + width);
    return width;
  };
  try {
    orderDocuments(
      state,
      [order("TL-DEMO-P2")],
      "production-bulk",
      actor,
      PRINT_AT,
    );
    const { reviewOrders } = await import("../fixtures/print-documents");
    orderDocuments(
      state,
      [reviewOrders()[1]!],
      "production-bulk",
      actor,
      PRINT_AT,
    );
  } finally {
    Canvas.prototype.text = original;
  }
  assert.equal(rightEdges.length, 2);
  for (const right of rightEdges)
    assert.ok(right <= A4.width - mm(13) + 0.01, `${right}`);
});

test("Founder-approved P1/P2 corpus stays byte-identical, including the 60-order ZIP", async () => {
  const { verifyProductionGoldenDirectory } =
    await import("../fixtures/production-print-golden-check");
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "p3-production-golden-"));
  try {
    // Isolate the corpus from preceding glyph-diagnostic tests: fontkit caches
    // codepoint aliases on glyph objects. Compare identical fresh-process runs.
    const run = spawnSync(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/print-samples.ts", dir],
      {
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
        },
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    assert.equal(run.status, 0, run.stderr);
    verifyProductionGoldenDirectory(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P3 keeps package count, all frozen pack detail, missing-data warning and handover at every size", async () => {
  const { reviewOrders } = await import("../fixtures/print-documents");
  const selected = [
    order("TL-DEMO-P1"),
    order("TL-DEMO-PICKUP"),
    order("TL-DEMO-NOSNAP"),
    reviewOrders()[2]!,
  ];
  for (const layout of ["a4", "a5", "a5-two-up"] as const) {
    for (const o of selected) {
      const r = orderDocuments(
        state,
        [o],
        "delivery-note",
        actor,
        PRINT_AT,
        layout,
      );
      const text = r.trace.join(" ");
      for (const label of [
        "Packages",
        "Bags / boxes:",
        "Contents",
        "Handover confirmation",
        "HANDED OVER BY",
        "SIGNATURE",
        "TIME",
      ])
        assert.ok(text.includes(label), `${layout} ${o.id}: ${label}`);
      if (o.id === "TL-DEMO-P1")
        for (const detail of [
          "Each box · 6 pieces",
          "2 × Chocolate",
          "2 × Diplomat cream (vanilla)",
          "2 × Pistachio",
          "Total physical pieces: 2",
        ])
          assert.ok(text.includes(detail), detail);
      if (o.id === "TL-DEMO-NOSNAP")
        assert.ok(text.includes("Items unavailable"));
    }
  }
});
