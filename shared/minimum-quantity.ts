/**
 * Product-specific minimum quantities, shared by browser and authoritative server.
 * TPL-21 (founder, 9 November 2026): loose Pan de Muerto and Bolillo sell in at
 * least 6 pieces per selected SKU. Exact published option ids only — packs keep
 * their fixed 6/12 box rules and every other product keeps the minimum of 1.
 * B111 is the published "Mexican Bolillo" option (catalog revision 2026-11-04).
 */
export const DEFAULT_MIN_ITEM_QUANTITY = 1;
export const MIN_SIX_SKUS: ReadonlySet<string> = new Set([
  ...["azucar", "ajonjoli"].flatMap((top) => [
    `pan-de-muerto-traditional-${top}-mini-40-g`,
    `pan-de-muerto-traditional-${top}-individual-70-g`,
  ]),
  "pan-de-muerto-traditional-azucar-mini-40-g-chocolate-covering",
  "pan-de-muerto-traditional-azucar-individual-70-g-chocolate-covering",
  ...[
    "crema-diplomatica-vainilla",
    "chocolate",
    "mascarpone-y-cajeta",
    "mascarpone-y-fresas",
    "pistachio",
  ].flatMap((filling) => [
    `pan-de-muerto-filled-${filling}-mini`,
    `pan-de-muerto-filled-${filling}-individual`,
  ]),
  "B111",
]);
export function minimumOrderQuantity(productId: string) {
  return MIN_SIX_SKUS.has(productId) ? 6 : DEFAULT_MIN_ITEM_QUANTITY;
}
/** Per selected SKU (summed across that SKU's lines); never aggregated across SKUs. */
export function belowMinimumSkus(
  lines: readonly { productId: string; quantity: number }[],
) {
  const totals = new Map<string, number>();
  for (const l of lines)
    totals.set(l.productId, (totals.get(l.productId) ?? 0) + l.quantity);
  return [...totals].flatMap(([id, n]) =>
    n < minimumOrderQuantity(id) ? [id] : [],
  );
}
export const MINIMUM_QUANTITY_MESSAGE =
  "Minimum order: 6 pieces for Pan de Muerto and Bolillo. Please update your cart.";
