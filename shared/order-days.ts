import type { Order } from "../server/domain/model";

/** YYYY-MM-DD of an instant in Asia/Dubai (fixed UTC+4, no daylight saving). */
export const dubaiDay = (at: Date | string = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof at === "string" ? new Date(at) : at);

/** The calendar day after `day` (YYYY-MM-DD), independent of the host timezone. */
export const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

/**
 * When the order actually reached Delivered (or was collected), taken only from
 * the persisted state transition. A Delivered order without that audit entry has
 * no known completion time: null, never the due date or "now".
 */
export function completedAt(o: Pick<Order, "state" | "audit">) {
  if (o.state !== "Delivered") return null;
  const entry = o.audit.findLast((a) => a.to === "Delivered");
  return entry && !Number.isNaN(Date.parse(entry.at)) ? entry.at : null;
}

export const dueDay = (o: Pick<Order, "pickup" | "delivery">) =>
  o.pickup?.pickupDate ?? o.delivery?.date;
