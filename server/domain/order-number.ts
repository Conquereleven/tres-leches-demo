import type { Order, State } from "./model";
/**
 * Issues the customer-facing order number. Must be called inside a store
 * write: SQLite's BEGIN IMMEDIATE serialises writers, so two orders paid at
 * the same instant read different sequence values. Idempotent per order — a
 * retried payment, webhook or reconciliation never issues a second number —
 * and the sequence is never decremented, so a cancelled order's number is
 * never reused.
 */
export function assignPublicOrderNumber(s: State, order: Order) {
  if (order.publicOrderNumber) return order.publicOrderNumber;
  const issued = s.orders.reduce(
    (max, o) => Math.max(max, o.publicOrderNumber ?? 0),
    0,
  );
  // Defends against a restored older document: never fall behind an issued number.
  s.orderNumberSequence = Math.max(s.orderNumberSequence ?? 0, issued) + 1;
  order.publicOrderNumber = s.orderNumberSequence;
  return order.publicOrderNumber;
}
/** "Ana López" from separately stored names, falling back to the legacy single field. */
export function customerName(
  order: Pick<Order, "customerDetails">,
  fallback?: string,
) {
  const { firstName, lastName } = order.customerDetails ?? {};
  return [firstName, lastName].filter(Boolean).join(" ") || fallback || "";
}
