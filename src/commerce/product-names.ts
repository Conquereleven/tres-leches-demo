import names from "./ops-product-names.json";
import type { Order, CatalogItem } from "../../server/domain/model";

/** Versioned presentation dictionary, never a source for prices or order facts. */
const approved: Record<string, { source: string; en: string }> = names;
export const TRANSLATION_REVIEW = "Product translation requires review";
export function operationalProductName(id: string, original?: string) {
  const entry = Object.hasOwn(approved, id) ? approved[id] : undefined;
  // An ID alone cannot prove that a historical/custom definition is unchanged.
  const safe = entry && (original === entry.source || original === entry.en);
  return {
    name: safe ? entry.en : original?.trim() ? original : id,
    original: original ?? id,
    reviewRequired: !safe,
  };
}
export function orderProductName(
  order: Pick<Order, "state" | "catalogSnapshot">,
  id: string,
  catalog: Pick<CatalogItem, "id" | "name">[],
) {
  const draft = [
    "New",
    "Building",
    "Awaiting Location",
    "Minimum Check",
  ].includes(order.state);
  const source = order.catalogSnapshot ?? (draft ? catalog : []);
  const matches = source.filter((p) => p.id === id);
  return operationalProductName(
    id,
    matches.length === 1 ? matches[0]?.name : undefined,
  );
}
export function productSearchText(
  product: ReturnType<typeof operationalProductName>,
  id: string,
) {
  return `${id} ${product.original} ${product.name}`;
}
/** Plain text variant for native option elements. Warnings remain visible. */
export function productOptionLabel(id: string, original: string) {
  const product = operationalProductName(id, original);
  return (
    product.name +
    (product.reviewRequired ? ` — ${TRANSLATION_REVIEW} (${id})` : "")
  );
}
