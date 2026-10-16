import { lineKey, validPackSnapshot } from "../../shared/pack-composition";
import type { Order } from "../../server/domain/model";

/** Historical ticket data must come entirely from the accepted order snapshot. */
export function ticketSnapshot(
  order: Pick<Order, "lines" | "catalogSnapshot">,
) {
  const snapshot = order.catalogSnapshot;
  if (!snapshot?.length || !order.lines.length) return null;
  const seen = new Set<string>();
  const lines = [];
  for (const line of order.lines) {
    const matches = snapshot.filter((product) => product.id === line.productId);
    const product = matches[0];
    if (
      seen.has(lineKey(line)) ||
      !validPackSnapshot(line) ||
      matches.length !== 1 ||
      !product?.name?.trim() ||
      !Number.isSafeInteger(product.priceFils) ||
      product.priceFils < 0 ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0
    )
      return null;
    seen.add(lineKey(line));
    lines.push({ ...line, name: product.name, priceFils: product.priceFils });
  }
  return lines;
}
