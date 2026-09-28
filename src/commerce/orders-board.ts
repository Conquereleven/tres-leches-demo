/**
 * Orders board presentation rules. Pure functions over the workspace
 * snapshot: they decide what the kitchen sees, never what state an order is
 * in. Transitions still go through the existing `transition` command.
 */
import type { Order, OrderState, Payment } from "../../server/domain/model";

export type BoardView = "today" | "upcoming" | "all";
export type BoardFilter =
  "any" | "paid" | "preparing" | "ready" | "delivery" | "completed";

export const BOARD_VIEWS: [BoardView, string][] = [
  ["today", "Hoy"],
  ["upcoming", "Próximos"],
  ["all", "Todos los pedidos"],
];
export const BOARD_FILTERS: [BoardFilter, string][] = [
  ["any", "Todos"],
  ["paid", "Pagados"],
  ["preparing", "En preparación"],
  ["ready", "Listos"],
  ["delivery", "En camino"],
  ["completed", "Completados"],
];

/** Only paid orders enter the production queue; never Awaiting Payment. */
export const QUEUE_STATES: readonly OrderState[] = [
  "Paid",
  "Confirmed",
  "Production",
  "Ready",
  "Out for Delivery",
  "Delivered",
];
export const inQueue = (o: Pick<Order, "state">) =>
  QUEUE_STATES.includes(o.state);

export const dubaiDate = (at: Date | string = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof at === "string" ? new Date(at) : at);

type BoardOrder = Pick<Order, "state" | "delivery">;

/**
 * Today is the kitchen's working list: due today, overdue and still open, or
 * open without a delivery date. Upcoming is anything due after today.
 */
export function matchesView(o: BoardOrder, view: BoardView, today: string) {
  const date = o.delivery?.date;
  if (view === "upcoming") return !!date && date > today;
  if (view === "today")
    return o.state === "Delivered" ? date === today : !date || date <= today;
  return true;
}
export function matchesFilter(o: BoardOrder, filter: BoardFilter) {
  switch (filter) {
    case "paid":
      return o.state === "Paid" || o.state === "Confirmed";
    case "preparing":
      return o.state === "Production";
    case "ready":
      return o.state === "Ready";
    case "delivery":
      return o.state === "Out for Delivery";
    case "completed":
      return o.state === "Delivered";
    default:
      return true;
  }
}

/** Soonest delivery first; undated after dated; then most recent activity. */
export function byDue(a: Order, b: Order) {
  return (
    (a.delivery?.date ?? "9999").localeCompare(b.delivery?.date ?? "9999") ||
    (b.audit.at(-1)?.at ?? "").localeCompare(a.audit.at(-1)?.at ?? "")
  );
}

/** When the order was paid, from its own audit trail. */
export const paidAt = (o: Pick<Order, "audit">) =>
  o.audit.find((a) => a.to === "Paid")?.at;

export function boardMetrics(
  orders: Order[],
  payments: Pick<Payment, "id" | "status" | "amountFils">[],
  today: string,
) {
  const queue = orders.filter(inQueue);
  return {
    todayOrders: queue.filter((o) => o.delivery?.date === today).length,
    todayRevenueFils: queue
      .filter((o) => {
        const at = paidAt(o);
        return at && dubaiDate(at) === today;
      })
      .reduce((sum, o) => {
        const p = payments.find((p) => p.id === o.paymentId);
        return p?.status === "paid" ? sum + p.amountFils : sum;
      }, 0),
    preparing: queue.filter((o) => o.state === "Production").length,
    outForDelivery: queue.filter((o) => o.state === "Out for Delivery").length,
  };
}

/** The one next fulfilment step, using existing state-machine transitions only. */
export const NEXT_ACTION: Partial<
  Record<OrderState, { to: OrderState; label: string }>
> = {
  Confirmed: { to: "Production", label: "Empezar preparación" },
  Production: { to: "Ready", label: "Marcar como listo" },
  Ready: { to: "Out for Delivery", label: "Enviar a reparto" },
  "Out for Delivery": { to: "Delivered", label: "Marcar entregado" },
};

export const FULFILMENT: { state: OrderState; label: string }[] = [
  { state: "Confirmed", label: "Confirmado" },
  { state: "Production", label: "Preparando" },
  { state: "Ready", label: "Listo" },
  { state: "Out for Delivery", label: "En camino" },
  { state: "Delivered", label: "Entregado" },
];
export function fulfilmentIndex(state: OrderState) {
  if (state === "Paid") return -1;
  return FULFILMENT.findIndex((s) => s.state === state);
}
export const FULFILMENT_LABEL: Partial<Record<OrderState, string>> = {
  Paid: "Por confirmar",
  Confirmed: "Confirmado",
  Production: "En preparación",
  Ready: "Listo",
  "Out for Delivery": "En camino",
  Delivered: "Entregado",
  "Awaiting Payment": "Esperando pago",
  Cancelled: "Cancelado",
};

export type PaymentTone = "paid" | "review" | "pending" | "issue" | "none";
export function paymentBadge(p?: Pick<Payment, "status" | "directAttempt">): {
  tone: PaymentTone;
  label: string;
} {
  if (!p) return { tone: "none", label: "Sin pago" };
  if (p.status === "paid") return { tone: "paid", label: "Pagado" };
  if (p.directAttempt === "unknown")
    return { tone: "review", label: "Pago en revisión" };
  if (
    ["creating", "pending", "authorized", "pending_confirmation"].includes(
      p.status,
    )
  )
    return { tone: "pending", label: "Esperando pago" };
  const labels: Record<string, string> = {
    failed: "Pago fallido",
    expired: "Pago expirado",
    cancelled: "Pago cancelado",
    refunded: "Reembolsado",
    partially_refunded: "Reembolso parcial",
    chargeback: "Contracargo",
  };
  return { tone: "issue", label: labels[p.status] ?? p.status };
}

/** "Hoy", "Mañana", "Atrasado · lun 28 sep" or "mié 30 sep". */
export function dueLabel(date: string | undefined, today: string) {
  if (!date) return { label: "Sin fecha", tone: "none" as const };
  const pretty = new Date(`${date}T12:00:00Z`).toLocaleDateString("es", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const tomorrow = dubaiDate(
    new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000),
  );
  if (date === today) return { label: "Hoy", tone: "today" as const };
  if (date === tomorrow) return { label: "Mañana", tone: "soon" as const };
  if (date < today)
    return { label: `Atrasado · ${pretty}`, tone: "late" as const };
  return { label: pretty, tone: "later" as const };
}
