/** Verified against the published product IDs and exact SKU membership for RT01.1. */
const withdrawnConchas = new Map<string, readonly string[]>([
  [
    "conchas-traditional--pistache",
    [
      "conchas-traditional-pistache-mini-40-g",
      "conchas-traditional-pistache-individual-70-g",
    ],
  ],
  [
    "conchas-filled--pistache",
    ["conchas-filled-pistache-mini", "conchas-filled-pistache-individual"],
  ],
  [
    "conchas-filled-pack",
    [
      "conchas-filled-pack-6-mini",
      "conchas-filled-pack-12-mini",
      "conchas-filled-pack-6-individuales",
      "conchas-filled-pack-12-individuales",
    ],
  ],
]);

export function hiddenConcha(productId: string, skuIds: readonly string[]) {
  const approved = withdrawnConchas.get(productId);
  return (
    !!approved &&
    skuIds.length > 0 &&
    skuIds.every((sku) => approved.includes(sku))
  );
}

const withdrawnSkus = new Set([...withdrawnConchas.values()].flat());
export const withdrawnConchaSku = (sku: string) => withdrawnSkus.has(sku);
