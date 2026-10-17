import { acceptedLinePrice } from "../../shared/pack-pricing";
import { tricolorSpec, tricolorPreparation } from "../../shared/tricolor";
import { packSpec, validPackSnapshot } from "../../shared/pack-composition";
import { renderOperationsEmail } from "./operations-email-template";
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
    const isPack =
      tricolorSpec(line.productId)?.kind === "single"
        ? false
        : !!packSpec(line.productId) ||
          /(?:^|-)(?:pack|bundle)(?:-|$)/.test(line.productId) ||
          !!line.composition ||
          !!line.packSnapshot;
    const valid =
      Number.isSafeInteger(line.quantity) &&
      line.quantity > 0 &&
      validPackSnapshot(line);
    return {
      sku: line.productId,
      name,
      quantity: line.quantity,
      priceFils: p
        ? (acceptedLinePrice(line, p.priceFils) ?? undefined)
        : undefined,
      isPack,
      preparation:
        tricolorSpec(line.productId)?.kind === "single"
          ? tricolorPreparation(line)
          : undefined,
      // Never infer historical preparation from current catalog or approvals.
      pack:
        isPack &&
        (line.composition || tricolorSpec(line.productId)?.kind === "fixed") &&
        valid
          ? line.packSnapshot
          : undefined,
      review:
        isPack &&
        ((!line.composition &&
          tricolorSpec(line.productId)?.kind !== "fixed") ||
          !valid)
          ? "MANUAL REVIEW REQUIRED: Pack composition missing or invalid. Do not infer included flavors."
          : undefined,
    };
  });
  const pickup = order.fulfillmentMethod === "pickup";
  const message = renderOperationsEmail({
    reference,
    orderId: order.id,
    customer: customerName(order, conversation?.customer) || "Not stored",
    phone: conversation?.phone ?? "Not stored",
    email: order.customerDetails?.email ?? "Not stored",
    whatsapp: order.customerDetails?.whatsappNumber ?? "Not stored",
    items,
    amountFils: payment.amountFils,
    quote: order.quote,
    pickup,
    date: order.pickup?.pickupDate ?? order.delivery?.date ?? "Not stored",
    time: order.pickup?.preferredTime ?? order.delivery?.slot ?? "Not stored",
    address: pickup
      ? [`Pickup: ${PICKUP_LOCATION.name}`, ...PICKUP_LOCATION.lines]
      : [
          `Full address: ${order.address ?? "Not stored — review required"}`,
          `Street/address: ${order.delivery?.address ?? "Not stored"}`,
          `Building/villa: ${order.delivery?.building ?? "Not stored"}`,
          `Apartment/unit: ${order.delivery?.unit || "Not stored"}`,
          `Area: ${zone?.name ?? order.quote?.zoneName ?? order.delivery?.zoneId ?? "Not stored"}`,
          `Address verification: ${order.delivery?.addressVerification ?? "Not recorded — manual review required"}`,
        ],
    instructions: order.customerDetails?.instructions || "Not stored",
    deliveryNotes: order.delivery?.notes || "Not stored",
    origin,
  });
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
      body: message.text,
      html: message.html,
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
