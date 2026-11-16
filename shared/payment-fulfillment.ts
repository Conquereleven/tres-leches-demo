import { DELIVERY_WINDOWS } from "./commerce-policy";
import type { Order } from "../server/domain/model";

type FulfillmentOrder = Partial<
  Pick<
    Order,
    | "paymentFulfillment"
    | "paymentId"
    | "fulfillmentMethod"
    | "pickup"
    | "delivery"
  >
>;
const realDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
};
const nonempty = (value: unknown) =>
  typeof value === "string" && !!value.trim();

/** Browser/server contract. Absence preserves historical behavior; every present
 * decision must prove a resolved, coherent schedule. Status alone is insufficient.
 * Never promotes legacy proposals or repairs persisted records on read. */
export function fulfillmentPending(order: FulfillmentOrder): boolean {
  const d = order.paymentFulfillment;
  if (d === undefined) return false;
  if (!d || !["unchanged", "auto-rescheduled"].includes(d.status)) return true;
  const e = d.effective,
    original = d.original;
  const method = order.fulfillmentMethod;
  const date =
    method === "pickup" ? order.pickup?.pickupDate : order.delivery?.date;
  const slot =
    method === "pickup" ? order.pickup?.preferredTime : order.delivery?.slot;
  if (
    !e ||
    !original ||
    !["pickup", "delivery"].includes(method ?? "") ||
    !nonempty(d.paymentId) ||
    d.paymentId !== order.paymentId ||
    !nonempty(d.actor) ||
    !nonempty(d.source) ||
    !nonempty(d.reason) ||
    !nonempty(d.acknowledgedAt) ||
    !Number.isFinite(Date.parse(d.acknowledgedAt)) ||
    e.method !== method ||
    original.method !== method ||
    !realDay(e.date) ||
    !realDay(original.date) ||
    e.date !== date ||
    e.slot !== slot ||
    e.slot !== original.slot ||
    !DELIVERY_WINDOWS.some((w) => w.label === e.slot)
  )
    return true;
  return d.status === "unchanged"
    ? e.date !== original.date
    : e.date <= original.date;
}
