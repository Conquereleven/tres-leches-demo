import { randomUUID } from "node:crypto";
import type {
  Order,
  Payment,
  State,
  OperationsEmailNotification,
} from "./model";
import { orderReference } from "../../shared/order-number";
import { customerName } from "./order-number";
import { PICKUP_LOCATION } from "../../shared/pickup-location";
import names from "../../src/commerce/ops-product-names.json";
import { approvedOperationsNames } from "../catalog/product-hub";

/** Freeze the complete paid-order email inside the authoritative paid transition. */
export function recordPaidOperationsEmail(
  state: State,
  order: Order,
  payment: Payment,
  recipients: string[],
  origin?: string,
): OperationsEmailNotification[] {
  if (
    payment.status !== "paid" ||
    !payment.paidAt ||
    !order.paidAt ||
    payment.orderId !== order.id ||
    !recipients.length
  )
    return [];
  const key = `operations-email-paid:${order.id}`;
  if (state.events[key]) return [];
  state.events[key] = payment.id;
  const conversation = state.conversations.find(
    (c) => c.id === order.conversationId,
  );
  const zone = state.zones.find(
    (z) => z.id === (order.delivery?.zoneId ?? order.manualZoneId),
  );
  const approved = approvedOperationsNames(state);
  const reference = orderReference(order);
  const items = order.lines.map((line) => {
    const matches =
      order.catalogSnapshot?.filter((p) => p.id === line.productId) ?? [];
    const p =
      matches.length === 1 &&
      matches[0]?.name?.trim() &&
      Number.isSafeInteger(matches[0].priceFils) &&
      matches[0].priceFils >= 0
        ? matches[0]
        : undefined;
    const dictionary = names as Record<string, { source: string; en: string }>;
    const mapping = (
      Object.hasOwn(dictionary, line.productId)
        ? [dictionary[line.productId]!]
        : []
    )
      .concat(
        Object.hasOwn(approved, line.productId)
          ? approved[line.productId]!
          : [],
      )
      .find((v) => p?.name === v.source || p?.name === v.en);
    const name =
      mapping?.en ??
      `${p?.name ?? line.productId} [translation review required]`;
    return `${line.quantity} × ${name} (${line.productId}) · ${p ? `AED ${(p.priceFils / 100).toFixed(2)} each · AED ${((p.priceFils * line.quantity) / 100).toFixed(2)}` : "Stored price missing — review required"}`;
  });
  const pickup = order.fulfillmentMethod === "pickup";
  const body = [
    `NEW PAID ORDER ${reference} (${order.id})`,
    `Customer: ${customerName(order, conversation?.customer) || "Not stored"}`,
    `Phone: ${conversation?.phone ?? "Not stored"}`,
    `Email: ${order.customerDetails?.email ?? "Not stored"}`,
    `WhatsApp: ${order.customerDetails?.whatsappNumber ?? "Not stored"}`,
    "",
    ...items,
    "",
    `Total paid: AED ${(payment.amountFils / 100).toFixed(2)}`,
    `Fulfillment: ${pickup ? "Pickup" : "Delivery"}`,
    `Date: ${order.pickup?.pickupDate ?? order.delivery?.date ?? "Not stored"}`,
    `Time: ${order.pickup?.preferredTime ?? order.delivery?.slot ?? "Not stored"}`,
    ...(pickup
      ? [`Pickup: ${PICKUP_LOCATION.name}`, ...PICKUP_LOCATION.lines]
      : [
          `Full address: ${order.address ?? "Not stored — review required"}`,
          `Street/address: ${order.delivery?.address ?? "Not stored"}`,
          `Building/villa: ${order.delivery?.building ?? "Not stored"}`,
          `Apartment/unit: ${order.delivery?.unit || "Not stored"}`,
          `Area: ${zone?.name ?? order.quote?.zoneName ?? order.delivery?.zoneId ?? "Not stored"}`,
          `Address verification: ${order.delivery?.addressVerification ?? "Not recorded — manual review required"}`,
        ]),
    `Original customer instructions: ${order.customerDetails?.instructions || "Not stored"}`,
    `Original delivery notes: ${order.delivery?.notes || "Not stored"}`,
    "",
    `${origin ?? ""}/operations/orders?order=${encodeURIComponent(order.id)}`,
  ].join("\n");
  const createdAt = new Date().toISOString();
  const rows: OperationsEmailNotification[] = [...new Set(recipients)].map(
    (recipient) => ({
      id: randomUUID(),
      event: "ORDER_PAID",
      channel: "email",
      orderId: order.id,
      paymentId: payment.id,
      publicOrderNumber: order.publicOrderNumber,
      recipient,
      subject: `New paid 3L order ${reference}`,
      body,
      status: "pending",
      attemptCount: 0,
      createdAt,
    }),
  );
  state.operationsEmailNotifications ??= [];
  state.operationsEmailNotifications.push(...rows);
  state.audit.push({
    at: createdAt,
    actor: "system",
    action: `ORDER_PAID ${order.id}: internal email queued`,
  });
  return rows;
}
