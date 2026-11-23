/**
 * Synthetic TPL-18 Phase B print fixtures. Fictional customers, phones,
 * addresses and prices; real SKU ids so approved English names resolve, and
 * snapshots built with the production validators so they are accepted.
 */
import { seed } from "../../server/db/store";
import type { Line, Order, State } from "../../server/domain/model";
import { PACK_SPECS } from "../../shared/pack-composition";
import { snapshotTricolor } from "../../shared/tricolor";
import names from "../../src/commerce/ops-product-names.json";
import { docOrder, docPayment } from "./order-documents";

export const PRINT_AT = new Date("2026-11-06T10:00:00Z");
export const ARABIC_NOTE =
  "الرجاء الاتصال عند الوصول إلى البوابة 2 — الطابق 12، شقة 1204";
export const ARABIC_DEDICATION = "عيد ميلاد سعيد يا سارة";
export const ARABIC_NAME = "سارة";

const CATEGORY: [string, string][] = [
  ["tres-leches-", "Tres Leches Cakes"],
  ["special-flavours-cake-", "Tres Leches Cakes"],
  ["cake-jar-", "Cake Jars"],
  ["pan-de-muerto-", "Pan de Muerto"],
  ["conchas-", "Conchas"],
  ["rosca-", "Panadería Mexicana"],
];
const source = (id: string) =>
  (names as Record<string, { source: string }>)[id]?.source ?? id;

type Want = { id: string; quantity: number; name?: string } & Partial<Line>;

/** Order with a consistent snapshot: one catalog row per SKU, subtotal matches. */
export function printOrder(
  id: string,
  want: Want[],
  over: Partial<Order> = {},
) {
  const lines: Line[] = want.map(
    ({ id: productId, quantity, name, ...rest }) => {
      void name;
      return { productId, quantity, ...rest };
    },
  );
  const catalogSnapshot = want
    .filter((w, i) => want.findIndex((x) => x.id === w.id) === i)
    .map((w, i) => ({
      id: w.id,
      name: w.name ?? source(w.id),
      category: CATEGORY.find(([p]) => w.id.startsWith(p))?.[1],
      priceFils: 1000 + i * 500,
    }));
  const subtotal = lines.reduce(
    (n, l) =>
      n +
      catalogSnapshot.find((p) => p.id === l.productId)!.priceFils * l.quantity,
    0,
  );
  const base = docOrder(id);
  return docOrder(id, {
    lines,
    catalogSnapshot,
    quote: { ...base.quote!, subtotalFils: subtotal, totalFils: subtotal },
    ...over,
  });
}

/** Six-piece filled Pan de Muerto box: 2 chocolate, 2 diplomat cream, 2 pistachio. */
export function filledPack(quantity: number): Want {
  const spec = PACK_SPECS.find(
    (p) => p.packSkuId === "pan-de-muerto-filled-pack-6-mini",
  )!;
  const pick = [1, 0, 4].map((i) => spec.components[i]!);
  const composition = pick.map((c) => ({
    componentSkuId: c.componentSkuId,
    units: 2,
  }));
  return {
    id: spec.packSkuId,
    quantity,
    composition: [...composition].sort((a, b) =>
      a.componentSkuId.localeCompare(b.componentSkuId, "en"),
    ),
    packSnapshot: {
      version: 1,
      revision: `catalog-v1-${"f1".repeat(32)}`,
      capacity: 6,
      components: pick.map((c) => ({
        componentSkuId: c.componentSkuId,
        units: 2,
        name: c.names.en,
      })),
    },
  };
}
const tricolor = (quantity: number): Want => {
  const line = {
    productId: "conchas-traditional-tricolor-individual-70-g",
    quantity,
    color: "red" as const,
  };
  return { id: line.productId, ...line, packSnapshot: snapshotTricolor(line) };
};

const BULK_IDS = [
  "tres-leches-classic-1416-personas",
  "tres-leches-classic-68-personas",
  "tres-leches-vanilla-strawberry-68-personas",
  "tres-leches-nutella-68-personas",
  "special-flavours-cake-berries-big",
  "special-flavours-cake-chocolate-small",
  "special-flavours-cake-berries-mini",
  "special-flavours-cake-chocolate-mini",
  "cake-jar-classic-110-ml",
  "cake-jar-classic-200-ml",
  "cake-jar-vanilla-strawberry-110-ml",
  "cake-jar-vanilla-strawberry-200-ml",
  "cake-jar-nutella-110-ml",
  "cake-jar-nutella-200-ml",
  "cake-jar-lotus-110-ml",
  "cake-jar-lotus-200-ml",
  "pan-de-muerto-filled-chocolate-mini",
  "pan-de-muerto-filled-chocolate-individual",
  "conchas-traditional-vainilla-mini-40-g",
  "conchas-traditional-vainilla-individual-70-g",
  "conchas-traditional-chocolate-mini-40-g",
  "conchas-traditional-chocolate-individual-70-g",
  "conchas-traditional-pistache-mini-40-g",
  "conchas-traditional-pistache-individual-70-g",
  "rosca-de-reyes-mono-portion",
  "rosca-de-reyes-500-g",
  "rosca-de-reyes-1-kg",
];

export function printState(): State {
  const s = seed();
  const add = (o: Order, status?: Parameters<typeof docPayment>[1]) => {
    s.orders.push(o);
    s.payments.push(docPayment(o, status));
  };
  add(
    printOrder(
      "TL-DEMO-P1",
      [
        { id: "tres-leches-classic-1416-personas", quantity: 1 },
        { id: "special-flavours-cake-berries-small", quantity: 2 },
        filledPack(1),
        { id: "cake-jar-classic-200-ml", quantity: 4 },
        tricolor(2),
        {
          id: "fixture-unreviewed-candles",
          quantity: 2,
          name: "Velas de cumpleaños",
        },
      ],
      {
        publicOrderNumber: 14,
        customerDetails: {
          firstName: "Sample",
          lastName: "Customer A.",
          email: "sample-a@example.invalid",
          whatsappNumber: "+971500000014",
          instructions: `Dedication: ${ARABIC_DEDICATION} — 30\nKeep the 14–16 personas cake upright. Nut allergy: pack the pistachio box separately.`,
        },
        delivery: {
          ...docOrder("x").delivery!,
          unit: "Apt 1204",
          building: "Sample Residence Tower",
          address: "Fixture Street 7",
          slot: "13:00–16:00",
          date: "2026-11-08",
          notes: ARABIC_NOTE,
        },
      },
    ),
  );
  s.orders.at(-1)!.quote!.zoneName = "Dubai Marina (fixture)";
  add(
    printOrder(
      "TL-DEMO-P2",
      [
        ...BULK_IDS.map((id, i) => ({
          id,
          quantity: [4, 6, 2, 3, 8, 12, 18, 24][i % 8]!,
        })),
        filledPack(2),
        tricolor(6),
      ],
      {
        publicOrderNumber: 21,
        fulfillmentMethod: "pickup",
        delivery: undefined,
        pickup: { pickupDate: "2026-11-12", preferredTime: "08:00" },
        customerDetails: {
          firstName: "Fixture Events",
          lastName: "Office Breakfast",
          instructions:
            "Label every tray with its group name. Keep all pistachio items in their own trays.\nDriver collects with 4 insulated crates at 08:00.",
        },
      },
    ),
  );
  add(
    printOrder(
      "TL-DEMO-AR",
      [{ id: "tres-leches-nutella-68-personas", quantity: 1 }, filledPack(1)],
      {
        publicOrderNumber: 22,
        customerDetails: {
          firstName: ARABIC_NAME,
          lastName: "Fixture",
          whatsappNumber: "+971500000022",
          instructions: `${ARABIC_DEDICATION} (بدون مكسرات)`,
        },
        delivery: {
          ...docOrder("x").delivery!,
          notes: ARABIC_NOTE,
          slot: "16:00–19:00",
        },
      },
    ),
  );
  add(
    printOrder(
      "TL-DEMO-PICKUP",
      [{ id: "cake-jar-lotus-110-ml", quantity: 6 }],
      {
        publicOrderNumber: 23,
        fulfillmentMethod: "pickup",
        delivery: undefined,
        pickup: { pickupDate: "2026-11-08", preferredTime: "15:00" },
        customerDetails: { firstName: "Pickup", lastName: "Fixture" },
      },
    ),
  );
  add(
    printOrder(
      "TL-DEMO-UNPAID",
      [{ id: "tres-leches-classic-68-personas", quantity: 1 }],
      {
        state: "Awaiting Payment",
      },
    ),
    "pending",
  );
  add(docOrder("TL-DEMO-NOSNAP", { catalogSnapshot: undefined }));
  for (let i = 0; i < 5; i++)
    add(
      printOrder(
        `TL-DEMO-N${i}`,
        [
          { id: BULK_IDS[i]!, quantity: 1 + i },
          { id: BULK_IDS[i + 8]!, quantity: 2 },
        ],
        { publicOrderNumber: 30 + i },
      ),
    );
  return s;
}

/** Adversarial synthetic text: page-sized row, long unbroken word and many explicit lines. */
export function overflowOrder(): Order {
  const name = Array.from(
    { length: 160 },
    (_, i) => `ROW${String(i).padStart(3, "0")}`,
  ).join(" ");
  const notes = Array.from(
    { length: 180 },
    (_, i) =>
      `NOTE${String(i).padStart(3, "0")} Keep this instruction in full.`,
  ).join("\n");
  return printOrder(
    "TL-DEMO-OVERFLOW",
    [{ id: "fixture-overflow", quantity: 3, name }],
    {
      customerDetails: {
        firstName: "Overflow Fixture",
        instructions:
          notes + "\n" + "CONTINUOUS".repeat(80) + "\nEND-OF-INSTRUCTIONS",
      },
      delivery: {
        ...docOrder("x").delivery!,
        notes: `${ARABIC_NOTE}\nGate 2 (برج B) — 12:00\n${ARABIC_NOTE}\nEND-OF-DELIVERY-NOTES`,
      },
    },
  );
}

export const NUMERAL_NOTE =
  "البوابة ١٢ — شقة ١٢٠٤\nدروازه ۱۲ — واحد ۱۲۰۴\nGate 12 (برج B) / ١٢ / ۱۲ — Apt 1204 (١٢٠٤ / ۱۲۰۴)\n،  ؛   ،";

/** Bounded regression fixtures for the four independent review findings. */
export function reviewOrders(): Order[] {
  const numeric = printOrder(
    "TL-DEMO-NUMERALS",
    [{ id: "cake-jar-classic-200-ml", quantity: 1 }],
    {
      customerDetails: {
        firstName: "Numeric Arabic Fixture",
        instructions: NUMERAL_NOTE,
      },
      delivery: { ...docOrder("x").delivery!, notes: NUMERAL_NOTE },
    },
  );
  const group = printOrder(
    "TL-DEMO-GROUP",
    [
      {
        id: "fixture-oversized-first-row",
        quantity: 3,
        name: Array.from(
          { length: 420 },
          (_, i) => `GROUPROW${String(i).padStart(3, "0")}`,
        ).join(" "),
      },
    ],
    { customerDetails: { firstName: "Oversized Group Fixture" } },
  );
  group.catalogSnapshot![0]!.category = "Review oversized group";
  const legacy = printOrder(
    "TL-DEMO-LEGACY-LONG",
    [{ id: "cake-jar-classic-200-ml", quantity: 1 }],
    {
      delivery: undefined,
      address:
        Array.from(
          { length: 40 },
          (_, i) => `LEGACY${String(i).padStart(3, "0")}`,
        ).join(" ") + " LEGACY-ADDRESS-END",
      customerDetails: {
        firstName: Array.from(
          { length: 40 },
          (_, i) => `NAME${String(i).padStart(3, "0")}`,
        ).join(" "),
        instructions: "LONG-ADDRESS-NOTES-END",
      },
    },
  );
  return [numeric, group, legacy];
}
