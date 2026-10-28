import type { PackSnapshot } from "./pack-composition";

export const TRICOLOR_COLORS = ["red", "white", "green"] as const;
export type TricolorColor = (typeof TRICOLOR_COLORS)[number];
export const isTricolorColor = (value: unknown): value is TricolorColor =>
  TRICOLOR_COLORS.includes(value as TricolorColor);
export const tricolorCopy = {
  en: {
    mini: "Mini",
    individual: "Individual",
    grams: "g",
    color: "Color",
    choose: "Choose one color",
    red: "Red",
    white: "White",
    green: "Green",
    piece: "1 piece",
    pack: "3 pieces per pack",
    total: "Total physical pieces",
    review: "Color not recorded — preparation review required",
  },
  es: {
    mini: "Mini",
    individual: "Individual",
    grams: "g",
    color: "Color",
    choose: "Elige un color",
    red: "Rojo",
    white: "Blanco",
    green: "Verde",
    piece: "1 pieza",
    pack: "3 piezas por pack",
    total: "Total de piezas físicas",
    review: "Color no registrado — revisar preparación",
  },
  ar: {
    mini: "صغيرة",
    individual: "فردية",
    grams: "غ",
    color: "اللون",
    choose: "اختر لوناً واحداً",
    red: "أحمر",
    white: "أبيض",
    green: "أخضر",
    piece: "قطعة واحدة",
    pack: "3 قطع لكل عبوة",
    total: "إجمالي القطع",
    review: "اللون غير مسجل — يلزم مراجعة التحضير",
  },
} as const;
export function tricolorSpec(sku: string) {
  const definitions = [
    ["conchas-traditional-tricolor-mini-40-g", "single", "Mini", 40],
    [
      "conchas-traditional-tricolor-individual-70-g",
      "single",
      "Individual",
      70,
    ],
    ["conchas-tricolor-pack-3-mini", "fixed", "Mini", 40],
    ["conchas-tricolor-pack-3-individuales", "fixed", "Individual", 70],
  ] as const;
  const row = definitions.find(([id]) => id === sku);
  return row
    ? {
        sku: row[0],
        kind: row[1],
        size: row[2],
        grams: row[3],
        capacity: row[1] === "fixed" ? 3 : 1,
      }
    : null;
}
type Selection = {
  productId: string;
  quantity: number;
  color?: TricolorColor;
  composition?: unknown;
  packSnapshot?: PackSnapshot;
};
/** Preparation identities are colours of one SKU, never extra catalog SKUs or prices. */
export function snapshotTricolor(line: Selection): PackSnapshot {
  const spec = tricolorSpec(line.productId);
  if (
    !spec ||
    line.composition ||
    (spec.kind === "single"
      ? !isTricolorColor(line.color)
      : line.color !== undefined)
  )
    throw new Error("Invalid Tricolor selection");
  const colors = spec.kind === "fixed" ? TRICOLOR_COLORS : [line.color!];
  return {
    version: 1,
    revision: "tricolor-preparation-v1",
    capacity: spec.capacity,
    components: colors.map((color) => ({
      componentSkuId: `${line.productId}--${color}`,
      units: 1,
      name: `${tricolorCopy.en[color]} · ${spec.size} · ${spec.grams} g`,
      names: Object.fromEntries(
        (["en", "es", "ar"] as const).map((lang) => [
          lang,
          `${tricolorCopy[lang][color]} · ${tricolorCopy[lang][spec.size === "Mini" ? "mini" : "individual"]} · ${spec.grams} ${tricolorCopy[lang].grams}`,
        ]),
      ) as Record<"en" | "es" | "ar", string>,
    })),
  };
}
export function validTricolorSnapshot(line: Selection) {
  const spec = tricolorSpec(line.productId);
  if (!spec) return false;
  // Existing paid single-piece orders did not capture a colour. Keep them readable.
  if (spec.kind === "single" && line.color === undefined && !line.packSnapshot)
    return !line.composition;
  try {
    const expected = snapshotTricolor(line),
      frozen = line.packSnapshot;
    return (
      !!frozen &&
      frozen.version === 1 &&
      frozen.revision === expected.revision &&
      frozen.capacity === expected.capacity &&
      Array.isArray(frozen.components) &&
      frozen.components.length === expected.components.length &&
      frozen.components.every(
        (c, i) =>
          c.componentSkuId === expected.components[i]!.componentSkuId &&
          c.units === 1 &&
          typeof c.name === "string" &&
          !!c.name.trim(),
      )
    );
  } catch {
    return false;
  }
}
export function tricolorPreparation(
  line: Selection,
  language: "en" | "es" | "ar" = "en",
) {
  const spec = tricolorSpec(line.productId);
  if (!spec) return "";
  const copy = tricolorCopy[language];
  let frozen = line.packSnapshot;
  if (frozen && !validTricolorSnapshot(line)) return copy.review;
  if (!frozen) {
    try {
      frozen = snapshotTricolor(line);
    } catch {
      return copy.review;
    }
  }
  const pieces = frozen.components
    .map((c) => `${c.units} × ${c.names?.[language] ?? c.name}`)
    .join(" · ");
  return `${spec.kind === "fixed" ? copy.pack : copy.piece} · ${pieces} · ${copy.total}: ${frozen.capacity * line.quantity}`;
}
