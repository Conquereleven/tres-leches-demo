/**
 * Catalog integrity for the TEST start wrapper.
 *
 * The stored catalog must BE the approved menu: same items, same names,
 * prices, descriptions, and the same active/availability the menu declares.
 * It must not force every item to be purchasable — the approved menu
 * intentionally carries unavailable items (retired sizes, out-of-season
 * lines), and treating those as a failure blocked every release.
 */
const priceFils = (item) => Math.round(Number(item.priceAed) * 100);
/** Returns the reasons the stored catalog differs from the approved menu; empty when identical. */
export function catalogDifferences(stored, approvedItems) {
  const reasons = [];
  const current = stored ?? [];
  if (current.length !== approvedItems.length)
    reasons.push(`count ${current.length} != ${approvedItems.length}`);
  // The retired AED 25 SKU must never return, whatever the menu file says.
  if (current.some((product) => product.id === "pan-de-muerto"))
    reasons.push("retired SKU present");
  const ids = new Set(approvedItems.map((item) => item.id));
  for (const product of current)
    if (!ids.has(product.id)) reasons.push(`unapproved ${product.id}`);
  for (const item of approvedItems) {
    const product = current.find((candidate) => candidate.id === item.id);
    if (!product) {
      reasons.push(`missing ${item.id}`);
      continue;
    }
    if (
      product.name !== item.name ||
      product.priceFils !== priceFils(item) ||
      product.description !== item.description ||
      // Integrity, not availability: the flags must equal the approved ones.
      product.active !== item.active ||
      (product.availability ?? "available") !==
        (item.availability ?? "available")
    )
      reasons.push(`differs ${item.id}`);
    if (!Number.isSafeInteger(product.priceFils) || product.priceFils <= 0)
      reasons.push(`invalid price ${item.id}`);
  }
  return reasons;
}
