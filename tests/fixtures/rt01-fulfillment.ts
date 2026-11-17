/** Explicitly injected synthetic decisions; never runtime seeds. */
import { docOrder, TODAY, TOMORROW } from "./order-documents";
import type { Order } from "../../server/domain/model";

export function decisionOrder(
  status = "review-required",
  method: "delivery" | "pickup" = "delivery",
): Order {
  const o = docOrder(`TL-RT01-${method}-${status}`, {
    state: "Confirmed",
    fulfillmentMethod: method,
  });
  const slot = "4:00 PM – 9:00 PM";
  o.delivery = method === "delivery" ? { ...o.delivery!, slot } : undefined;
  o.pickup =
    method === "pickup"
      ? { pickupDate: TOMORROW, preferredTime: slot }
      : undefined;
  return Object.assign(o, {
    paymentFulfillment: {
      status,
      paymentId: o.paymentId,
      actor: "fixture",
      source: "fixture",
      acknowledgedAt: "2026-11-04T06:00:00Z",
      reason: "synthetic",
      original: { method, date: TODAY, slot },
      effective: { method, date: TOMORROW, slot },
    },
  });
}
export function heldOrders() {
  const base = decisionOrder("auto-rescheduled");
  const d = base.paymentFulfillment!;
  const decisions: unknown[] = [
    decisionOrder().paymentFulfillment,
    { ...d, status: "proposed" },
    { ...d, status: "unknown" },
    null,
    {},
    { ...d, effective: undefined },
    { ...d, original: null },
    { ...d, effective: { ...d.effective, date: "2026-02-30" } },
    { ...d, effective: { ...d.effective, date: "2026-11-06" } },
    { ...d, paymentId: "other-payment" },
    { ...d, acknowledgedAt: "invalid" },
    { ...d, actor: "" },
    { ...d, status: "unchanged" },
  ];
  const held = decisions.map(
    (paymentFulfillment, i) =>
      Object.assign(structuredClone(base), {
        id: `TL-RT01-HELD${i}`,
        paymentFulfillment,
      }) as Order,
  );
  const pickup = decisionOrder("review-required", "pickup");
  pickup.id = "TL-RT01-HELD-PICKUP";
  return [...held, pickup];
}

/** A coherent accepted decision with an unrelated historical opposite block.
 * Consumers must retain that block and read the accepted effective promise. */
export function acceptedResidualOrder(method: "pickup" | "delivery") {
  const o = decisionOrder("auto-rescheduled", method);
  o.id = `TL-RT01-RESIDUAL-${method}`;
  o.paymentId = `pay-${o.id}`;
  o.paymentFulfillment!.paymentId = o.paymentId;
  if (method === "delivery")
    o.pickup = { pickupDate: "2026-11-09", preferredTime: "8:00 AM – 1:00 PM" };
  else
    o.delivery = {
      zoneId: "fixture",
      address: "Fictional",
      building: "Fixture",
      date: "2026-11-09",
      slot: "8:00 AM – 1:00 PM",
    };
  return o;
}
