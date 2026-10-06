/**
 * Customer-facing order number. A display of the server-allocated sequence;
 * never an identifier used for lookups, payments or idempotency.
 * 1 → "#001", 71 → "#071", 1000 → "#1000".
 */
export function formatOrderNumber(sequence: number) {
  if (!Number.isInteger(sequence) || sequence < 1)
    throw new Error("Order number must be a positive integer");
  return `#${String(sequence).padStart(3, "0")}`;
}
/**
 * What to show a person for an order. Orders paid before public numbers
 * existed keep their internal reference rather than being renumbered.
 */
export function orderReference(order: {
  id: string;
  publicOrderNumber?: number;
}) {
  return order.publicOrderNumber
    ? formatOrderNumber(order.publicOrderNumber)
    : order.id;
}
