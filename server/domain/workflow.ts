import { type Order, type OrderState, now, requireThat } from "./model";
export const transitions: Record<OrderState, readonly OrderState[]> = {
  New: ["Building", "Cancelled"],
  Building: ["Awaiting Location", "Minimum Check", "Cancelled"],
  "Awaiting Location": ["Building", "Minimum Check", "Cancelled"],
  "Minimum Check": [
    "Building",
    "Awaiting Location",
    "Awaiting Payment",
    "Cancelled",
  ],
  "Awaiting Payment": ["Paid", "Building", "Cancelled"],
  Paid: ["Confirmed"],
  Confirmed: ["Production"],
  Production: ["Ready"],
  Ready: ["Out for Delivery"],
  "Out for Delivery": ["Delivered"],
  Delivered: [],
  Cancelled: [],
};
export function transition(order: Order, to: OrderState, actor: string) {
  requireThat(
    transitions[order.state].includes(to),
    `Transición inválida: ${order.state} → ${to}`,
  );
  const from = order.state;
  order.state = to;
  order.version++;
  order.audit.push({ from, to, at: now(), actor, action: `${from} → ${to}` });
}
