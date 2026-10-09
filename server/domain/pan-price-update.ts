import type { CatalogItem } from "./model";

/**
 * Pan de Muerto prices approved by Joel on 9 October 2026, as [previous, new]
 * fils per existing SKU. This is the whole of the change: 24 price fields.
 * Conchas and every other product are deliberately absent.
 */
const pair = (
  prefix: string,
  grams: boolean,
  mini: [number, number],
  individual: [number, number],
) => ({
  [`${prefix}-mini${grams ? "-40-g" : ""}`]: mini,
  [`${prefix}-individual${grams ? "-70-g" : ""}`]: individual,
});
export const PAN_PRICE_CHANGES: Readonly<Record<string, [number, number]>> = {
  ...pair("pan-de-muerto-traditional-azucar", true, [1100, 1300], [1300, 1500]),
  ...pair(
    "pan-de-muerto-traditional-ajonjoli",
    true,
    [1100, 1300],
    [1300, 1500],
  ),
  "pan-de-muerto-traditional-azucar-mini-40-g-chocolate-covering": [1100, 1300],
  "pan-de-muerto-traditional-azucar-individual-70-g-chocolate-covering": [
    1300, 1500,
  ],
  ...Object.assign(
    {},
    ...[
      "crema-diplomatica-vainilla",
      "chocolate",
      "mascarpone-y-cajeta",
      "mascarpone-y-fresas",
    ].map((f) =>
      pair(`pan-de-muerto-filled-${f}`, false, [1800, 2100], [2100, 2300]),
    ),
  ),
  ...pair("pan-de-muerto-filled-pistachio", false, [1800, 2300], [2100, 2600]),
  "pan-de-muerto-traditional-pack-6-mini": [6000, 7200],
  "pan-de-muerto-traditional-pack-12-mini": [11500, 14000],
  "pan-de-muerto-traditional-pack-6-individuales": [7200, 8000],
  "pan-de-muerto-traditional-pack-12-individuales": [14000, 15500],
  "pan-de-muerto-filled-pack-6-mini": [10000, 12000],
  "pan-de-muerto-filled-pack-12-mini": [19000, 23500],
  "pan-de-muerto-filled-pack-6-individuales": [12000, 13000],
  "pan-de-muerto-filled-pack-12-individuales": [23500, 25500],
};

export type PanPricePlan = {
  /** SKUs still at the previous price: these will be written. */
  change: { id: string; from: number; to: number }[];
  /** SKUs already at the approved price: nothing to do. */
  current: string[];
  /** Anything unexpected. A non-empty list means no write may happen. */
  blocked: { id: string; reason: string }[];
};

/** Read-only: what a targeted update would do to this catalog. */
export function planPanPriceUpdate(catalog: CatalogItem[]): PanPricePlan {
  const plan: PanPricePlan = { change: [], current: [], blocked: [] };
  for (const [id, [from, to]] of Object.entries(PAN_PRICE_CHANGES)) {
    const found = catalog.filter((p) => p.id === id);
    if (found.length !== 1)
      plan.blocked.push({ id, reason: `found ${found.length} records` });
    else if (found[0]!.priceFils === to) plan.current.push(id);
    else if (found[0]!.priceFils === from) plan.change.push({ id, from, to });
    else
      plan.blocked.push({
        id,
        reason: `stored price ${found[0]!.priceFils} is neither the previous nor the approved one`,
      });
  }
  return plan;
}

/**
 * The same catalog with only the approved price fields changed. Every other
 * record and every other field is returned untouched; a blocked plan throws.
 */
export function applyPanPriceUpdate(catalog: CatalogItem[]): CatalogItem[] {
  const plan = planPanPriceUpdate(catalog);
  if (plan.blocked.length) throw new Error("Pan price update blocked");
  const next = new Map(plan.change.map((c) => [c.id, c.to]));
  return catalog.map((p) =>
    next.has(p.id) ? { ...p, priceFils: next.get(p.id)! } : p,
  );
}
