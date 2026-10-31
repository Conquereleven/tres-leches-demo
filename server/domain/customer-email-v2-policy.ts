/**
 * Email flow V2 policy used at dispatch time: activation, enrolment, the
 * accepted schedule and send-time eligibility. No rendering and no JSON
 * imports, so the outbox can load it in native ESM email previews.
 */
import { z } from "zod";
import { DELIVERY_WINDOWS } from "../../shared/commerce-policy";
import type { CustomerNotification, Order, State } from "./model";

/** A window email later than this after the window started is not sent. */
export const CUSTOMER_EMAIL_V2_GRACE_MS = 30 * 60 * 1000;
/** Off unless explicitly configured; invalid or incomplete activation fails closed. */
export function customerEmailV2Since(
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (env.CUSTOMER_EMAIL_V2_ENABLED !== "true") return undefined;
  if (env.CUSTOMER_EMAIL_ENABLED !== "true")
    throw new Error(
      "Customer email V2 requires customer email delivery enabled",
    );
  const since = z.iso
    .datetime({ offset: true })
    .safeParse(env.CUSTOMER_EMAIL_V2_SINCE);
  if (!since.success)
    throw new Error("Customer email V2 requires a valid activation timestamp");
  return new Date(since.data).toISOString();
}

export const enrolmentKey = (orderId: string) => `customer-email-v2:${orderId}`;
/** Whether this order follows V2 under the currently active epoch. */
export function customerEmailV2Enrolled(
  s: State,
  orderId: string,
  since?: string,
) {
  return !!since && s.events[enrolmentKey(orderId)] === since;
}

/** Start of a configured window on a Dubai date, as a UTC ISO instant; null if invalid. */
export function windowStartsAt(date: string, slot: string): string | null {
  const window = DELIVERY_WINDOWS.find((w) => w.label === slot);
  if (!window || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const midnight = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(midnight.valueOf()) ||
    midnight.toISOString().slice(0, 10) !== date
  )
    return null;
  return new Date(
    `${date}T${String(window.startHour).padStart(2, "0")}:00:00+04:00`,
  ).toISOString();
}

/** The accepted schedule, from stored order fields only. */
export function acceptedSchedule(order: Order) {
  const pickup = order.fulfillmentMethod === "pickup";
  const date = pickup ? order.pickup?.pickupDate : order.delivery?.date;
  const slot = pickup ? order.pickup?.preferredTime : order.delivery?.slot;
  const dueAt = date && slot ? windowStartsAt(date, slot) : null;
  return {
    method: pickup ? ("pickup" as const) : ("delivery" as const),
    date: date ?? "",
    slot: slot ?? "",
    dueAt,
  };
}

/**
 * Why a due window email must not be sent now, or null when it may be.
 * Checked inside the claiming transaction, against current stored facts.
 */
export function scheduledEmailBlocker(
  s: State,
  row: CustomerNotification,
  now: number,
): string | null {
  const due = Date.parse(row.dueAt ?? "");
  if (!Number.isFinite(due)) return "Invalid or missing schedule; not sent";
  if (now > due + CUSTOMER_EMAIL_V2_GRACE_MS)
    return "Late: window started more than 30 minutes ago; not sent";
  const order = s.orders.find((o) => o.id === row.orderId);
  if (!order) return "Order not found; not sent";
  if (order.state === "Cancelled") return "Order cancelled; not sent";
  const payment = s.payments.find((p) => p.id === order.paymentId);
  // Same gate as fulfilment: a refunded, disputed or unreconciled payment
  // means review, not an automatic customer promise.
  if (payment?.status !== "paid")
    return "Payment not in paid state (refund or review required); not sent";
  const current = acceptedSchedule(order);
  if (
    !row.schedule ||
    current.method !== row.schedule.method ||
    current.date !== row.schedule.date ||
    current.slot !== row.schedule.slot ||
    current.dueAt !== row.dueAt
  )
    return "Schedule changed after payment; not sent";
  if (
    !order.customerDetails?.email ||
    order.customerDetails.email !== row.recipient
  )
    return "Customer email address changed or missing; not sent";
  return null;
}
