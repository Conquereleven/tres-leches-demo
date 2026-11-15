import { fulfillmentPending } from "../../shared/payment-fulfillment";
export { fulfillmentPending } from "../../shared/payment-fulfillment";
import { createHash } from "node:crypto";
import {
  DELIVERY_WINDOWS,
  earliestFulfillmentDate,
  validWindow,
  leadHours,
} from "../../shared/commerce-policy";
import { frozenCheckout } from "./frozen-checkout";
import type { Order, Payment } from "./model";

export function fulfillmentIntent(order: Order) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        lines: order.lines,
        catalog: order.catalogSnapshot,
        quote: order.quote,
        method: order.fulfillmentMethod,
        pickup: order.pickup,
        delivery: order.delivery,
        address: order.address,
        billing: order.billing,
        customerDetails: order.customerDetails,
        location: order.location,
        manualZoneId: order.manualZoneId,
      }),
    )
    .digest("hex");
}
export function requestedFulfillment(order: Order) {
  return {
    method: order.fulfillmentMethod,
    date:
      order.fulfillmentMethod === "pickup"
        ? order.pickup?.pickupDate
        : order.delivery?.date,
    slot:
      order.fulfillmentMethod === "pickup"
        ? order.pickup?.preferredTime
        : order.delivery?.slot,
  };
}
export function fulfillmentNotice(order: Order) {
  const decision = order.paymentFulfillment;
  if (!fulfillmentPending(order)) return "";
  const candidate = decision?.effective;
  return `Payment verified. Fulfillment review required; preparation and dispatch are on hold.${candidate ? ` Proposed: ${candidate.date}, ${candidate.slot}.` : " Manual review required; no fulfillment date is promised."}`;
}

/** FIRST paid transaction, before outbox snapshots. Uncertainty never discards money. */
export function revalidatePaidFulfillment(
  order: Order,
  payment: Payment,
  acknowledgedAt: string,
  actor: string,
  source: string,
  eligible: boolean,
  receiptId?: string,
) {
  const pickup = order.fulfillmentMethod === "pickup";
  const original = payment.fulfillmentRequested ?? requestedFulfillment(order);
  const decision: NonNullable<Order["paymentFulfillment"]> = {
    paymentId: payment.id,
    acknowledgedAt,
    actor,
    source,
    checkoutId: payment.providerReference ?? payment.providerCheckoutId,
    ...(receiptId ? { receiptId } : {}),
    original,
    status: "review-required",
    reason: "Uncertain or changed payment intent; manual review required",
  };
  // Absence is historical; a present malformed value is evidence of uncertainty.
  // Preserve it instead of silently issuing a fresh automatic acceptance.
  if (order.paymentFulfillment !== undefined)
    return order.paymentFulfillment ?? decision;
  order.paymentFulfillment = decision;
  let consistent = false;
  try {
    frozenCheckout(order, payment);
    consistent = true;
  } catch {
    /* scheduling fails closed */
  }
  if (
    !eligible ||
    !consistent ||
    !payment.fulfillmentIntent ||
    payment.fulfillmentIntent !== fulfillmentIntent(order)
  )
    return decision;
  const current = requestedFulfillment(order);
  if (
    original.method !== current.method ||
    original.date !== current.date ||
    original.slot !== current.slot
  )
    return decision;
  if (
    !original.method ||
    !original.date ||
    !original.slot ||
    !DELIVERY_WINDOWS.some((w) => w.label === original.slot)
  ) {
    decision.reason =
      "Missing or invalid fulfillment schedule; manual review required";
    return decision;
  }
  const now = new Date(acknowledgedAt);
  const hours = leadHours(order.lines.map((l) => l.productId));
  if (!Number.isFinite(now.valueOf())) return decision;
  try {
    if (validWindow(original.date, original.slot, now, hours)) {
      decision.status = "unchanged";
      decision.reason =
        "Requested schedule remains valid at first paid acknowledgement";
      decision.effective = {
        method: original.method,
        date: original.date,
        slot: original.slot,
      };
      return decision;
    }
    const date = new Date(`${original.date}T00:00:00Z`);
    if (
      !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== original.date
    )
      return decision;
    const first = new Date(`${earliestFulfillmentDate(now, hours)}T00:00:00Z`);
    for (let i = 0; i < 32; i++) {
      const candidate = first.toISOString().slice(0, 10);
      if (validWindow(candidate, original.slot, now, hours)) {
        decision.status = "auto-rescheduled";
        decision.reason = `Requested schedule invalid at paid acknowledgement; automatically accepted earliest safe same-slot schedule (${hours}h notice)`;
        decision.effective = {
          method: original.method,
          date: candidate,
          slot: original.slot,
        };
        if (pickup) order.pickup!.pickupDate = candidate;
        else order.delivery!.date = candidate;
        return decision;
      }
      first.setUTCDate(first.getUTCDate() + 1);
    }
  } catch {
    /* scheduling fails closed */
  }
  decision.reason =
    "No safe same-slot date within booking horizon; manual review required";
  return decision;
}
