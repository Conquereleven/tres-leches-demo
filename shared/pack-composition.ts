import { z } from "zod";
import { MAX_ITEM_QUANTITY } from "./commerce-policy";

/** Approved preparation identities, not stock or an additional price list. */
const traditional = [
  ["azucar", "Sugar", "Azúcar", "سكر"],
  ["ajonjoli", "Sesame", "Ajonjolí", "سمسم"],
  [
    "azucar-chocolate",
    "Sugar with chocolate covering",
    "Azúcar con cobertura de chocolate",
    "سكر مع تغطية الشوكولاتة",
  ],
] as const;
const filled = [
  [
    "crema-diplomatica-vainilla",
    "Diplomat cream (vanilla)",
    "Crema diplomática (vainilla)",
    "كريمة دبلوماسية (فانيليا)",
  ],
  ["chocolate", "Chocolate", "Chocolate", "شوكولاتة"],
  [
    "mascarpone-y-cajeta",
    "Mascarpone and cajeta",
    "Mascarpone y cajeta",
    "ماسكاربوني وكاجيتا",
  ],
  [
    "mascarpone-y-fresas",
    "Mascarpone and strawberries",
    "Mascarpone y fresas",
    "ماسكاربوني وفراولة",
  ],
  ["pistachio", "Pistachio", "Pistache", "فستق"],
] as const;
export const PACK_SPECS = ["traditional", "filled"].flatMap((family) =>
  [6, 12].flatMap((capacity) =>
    ["mini", "individuales"].map((size) => ({
      packSkuId: `pan-de-muerto-${family}-pack-${capacity}-${size}`,
      capacity,
      family,
      size,
      components: (family === "traditional" ? traditional : filled).map(
        ([id, en, es, ar]) => {
          const retailSize = size === "mini" ? "mini" : "individual";
          const componentSkuId =
            family === "filled"
              ? `pan-de-muerto-filled-${id}-${retailSize}`
              : `pan-de-muerto-traditional-${id === "azucar-chocolate" ? "azucar" : id}-${retailSize}-${size === "mini" ? "40" : "70"}-g${id === "azucar-chocolate" ? "-chocolate-covering" : ""}`;
          return { componentSkuId, names: { en, es, ar } };
        },
      ),
    })),
  ),
);
export const packSpec = (sku: string) =>
  PACK_SPECS.find((p) => p.packSkuId === sku);
export const componentName = (sku: string, language = "en") => {
  const c = PACK_SPECS.flatMap((p) => p.components).find(
    (c) => c.componentSkuId === sku,
  );
  return c?.names[language as "en" | "es" | "ar"] ?? c?.names.en ?? sku;
};
const componentSchema = z
  .object({
    componentSkuId: z.string().min(1).max(150),
    units: z.number().int().min(0).max(12),
  })
  .strict();
export const compositionSchema = z
  .array(componentSchema)
  .min(1)
  .max(5)
  .refine(
    (cs) => new Set(cs.map((c) => c.componentSkuId)).size === cs.length,
    "Duplicate pack component",
  );
export type Composition = z.infer<typeof compositionSchema>;
export const normalizeComposition = (c: Composition) =>
  c
    .filter((x) => x.units > 0)
    .map((x) => ({ componentSkuId: x.componentSkuId, units: x.units }))
    .sort((a, b) => a.componentSkuId.localeCompare(b.componentSkuId, "en"));
export type CommerceLine = {
  productId: string;
  quantity: number;
  composition?: Composition;
};
/** A canonical, browser-independent identity. Box quantity is deliberately excluded. */
export function lineKey(l: Pick<CommerceLine, "productId" | "composition">) {
  return (
    l.productId +
    (l.composition
      ? `~${normalizeComposition(l.composition)
          .map((c) => `${c.componentSkuId}:${c.units}`)
          .join(",")}`
      : "")
  );
}
export const commerceLineSchema = z
  .object({
    productId: z.string().min(1).max(100),
    quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY),
    composition: compositionSchema.optional(),
  })
  .strict()
  .superRefine((line, ctx) => {
    if (line.composition) {
      const spec = packSpec(line.productId);
      if (
        !spec ||
        line.composition.some(
          (c) =>
            !spec.components.some((x) => x.componentSkuId === c.componentSkuId),
        )
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Unknown, retired, cross-family or wrong-size pack component",
        });
    }
  })
  .transform((line) => ({
    ...line,
    ...(line.composition
      ? { composition: normalizeComposition(line.composition) }
      : {}),
  }));
export function distinctLines(ls: CommerceLine[]) {
  return (
    new Set(ls.map(lineKey)).size === ls.length &&
    ls.every(
      (l) =>
        ls
          .filter((x) => x.productId === l.productId)
          .reduce((n, x) => n + x.quantity, 0) <= MAX_ITEM_QUANTITY,
    )
  );
}
export const packEligibilitySchema = z
  .array(
    z
      .object({
        packSkuId: z.string().min(1).max(100),
        componentSkuIds: z.array(z.string().min(1).max(150)).max(5),
      })
      .strict(),
  )
  .max(8)
  .superRefine((rules, ctx) => {
    if (new Set(rules.map((r) => r.packSkuId)).size !== rules.length)
      ctx.addIssue({ code: "custom", message: "Duplicate pack eligibility" });
    for (const r of rules) {
      const spec = packSpec(r.packSkuId);
      if (
        !spec ||
        new Set(r.componentSkuIds).size !== r.componentSkuIds.length ||
        r.componentSkuIds.some(
          (id) => !spec.components.some((c) => c.componentSkuId === id),
        )
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Unknown, retired, cross-family or wrong-size pack component",
        });
    }
  });
export type PackEligibility = z.infer<typeof packEligibilitySchema>;
export type PackSnapshot = {
  version: 1;
  revision: string;
  capacity: number;
  components: {
    componentSkuId: string;
    units: number;
    name: string;
    names?: Record<"en" | "es" | "ar", string>;
  }[];
};
export function validPackSnapshot(
  line: CommerceLine & { packSnapshot?: PackSnapshot },
) {
  const spec = packSpec(line.productId),
    snapshot = line.packSnapshot;
  if (!line.composition) return !snapshot;
  return (
    !!spec &&
    !!snapshot &&
    Array.isArray(line.composition) &&
    line.composition.every(
      (c) =>
        c &&
        typeof c.componentSkuId === "string" &&
        Number.isSafeInteger(c.units) &&
        c.units > 0,
    ) &&
    Array.isArray(snapshot.components) &&
    snapshot.version === 1 &&
    /^catalog-v1-[a-f0-9]{64}$/.test(snapshot.revision) &&
    snapshot.capacity === spec.capacity &&
    snapshot.components.length === line.composition.length &&
    snapshot.components.every(
      (c) =>
        c &&
        typeof c.name === "string" &&
        c.name.trim() &&
        Number.isSafeInteger(c.units) &&
        c.units > 0 &&
        spec.components.some((s) => s.componentSkuId === c.componentSkuId),
    ) &&
    new Set(snapshot.components.map((c) => c.componentSkuId)).size ===
      snapshot.components.length &&
    snapshot.components.reduce((n, c) => n + c.units, 0) === spec.capacity &&
    JSON.stringify(normalizeComposition(snapshot.components)) ===
      JSON.stringify(normalizeComposition(line.composition))
  );
}
/** Frozen English preparation text; never resolves a historical name from today's catalog. */
export const preparationText = (
  line: CommerceLine & { packSnapshot?: PackSnapshot },
) =>
  !line.composition
    ? ""
    : !validPackSnapshot(line)
      ? "Pack composition review required"
      : `Per box (${line.packSnapshot!.capacity} pieces): ${line.packSnapshot!.components.map((c) => `${c.name} × ${c.units}`).join(", ")}`;
