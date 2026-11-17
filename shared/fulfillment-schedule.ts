import type { Order } from "../server/domain/model";
import { fulfillmentPending } from "./payment-fulfillment";

type ScheduleOrder = Partial<
  Pick<
    Order,
    | "paymentFulfillment"
    | "paymentId"
    | "fulfillmentMethod"
    | "pickup"
    | "delivery"
  >
>;
/** Read-only promise for consumers. A present decision uses only its validated
 * effective schedule; a held decision promises nothing. Historical absence keeps
 * the original pickup-first fallback, including partial legacy records. */
export function fulfillmentSchedule(order: ScheduleOrder): {
  date?: string;
  slot?: string;
} {
  if (order.paymentFulfillment !== undefined) {
    if (fulfillmentPending(order)) return {};
    const effective = order.paymentFulfillment!.effective!;
    return { date: effective.date, slot: effective.slot };
  }
  return {
    date: order.pickup?.pickupDate ?? order.delivery?.date,
    slot: order.pickup?.preferredTime ?? order.delivery?.slot,
  };
}
