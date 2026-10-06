/**
 * Customer emails about an order's progress.
 *
 *   operator transition (committed) → durable event row → dispatcher → email
 *
 * A row is written in the same store transaction as the state change, keyed by
 * (order, event), so opening a page, refreshing, double-clicking, retrying a
 * request or restarting the process can never create a second one. Delivery is
 * a separate step: with no email provider configured the dispatcher touches
 * nothing and rows stay visibly pending — nothing is reported as sent.
 */
import { randomUUID } from "node:crypto";
import { orderReference } from "../../shared/order-number";
import { PICKUP_LOCATION } from "../../shared/pickup-location";
import { customerName } from "./order-number";
import type {
  CustomerEvent,
  CustomerNotification,
  Order,
  OrderState,
  State,
} from "./model";

/** Which event, if any, a completed transition announces to the customer. */
export function customerEventFor(
  order: Pick<Order, "fulfillmentMethod">,
  from: OrderState,
  to: OrderState,
): CustomerEvent | null {
  const pickup = order.fulfillmentMethod === "pickup";
  if (from === "Confirmed" && to === "Production")
    return "ORDER_PRODUCTION_STARTED";
  if (from === "Production" && to === "Ready" && pickup)
    return "ORDER_READY_FOR_PICKUP";
  if (from === "Ready" && to === "Out for Delivery" && !pickup)
    return "ORDER_OUT_FOR_DELIVERY";
  return null;
}

const day = (date?: string) =>
  date
    ? new Date(`${date}T12:00:00+04:00`).toLocaleDateString("en-GB", {
        timeZone: "Asia/Dubai",
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

export function renderCustomerEmail(
  event: CustomerEvent,
  order: Order,
  context: { fallbackName?: string; zoneName?: string } = {},
) {
  const reference = orderReference(order);
  const first =
    order.customerDetails?.firstName ||
    customerName(order, context.fallbackName).split(/\s+/)[0] ||
    "there";
  const pickup = order.fulfillmentMethod === "pickup";
  const when = [
    day(order.pickup?.pickupDate ?? order.delivery?.date),
    order.pickup?.preferredTime ?? order.delivery?.slot,
  ]
    .filter(Boolean)
    .join(", ");
  const sign = ["", PICKUP_LOCATION.name];
  if (event === "ORDER_PRODUCTION_STARTED")
    return {
      subject: `Your 3L order ${reference} is now being prepared`,
      body: [
        `Hi ${first},`,
        "",
        `Good news — your 3L order ${reference} is now being prepared by our team.`,
        ...(when ? ["", `${pickup ? "Pickup" : "Delivery"}: ${when}`] : []),
        "",
        "We'll let you know as soon as it's ready.",
        ...sign,
      ].join("\n"),
    };
  if (event === "ORDER_READY_FOR_PICKUP")
    return {
      subject: `Your 3L order ${reference} is ready for pickup`,
      body: [
        `Hi ${first},`,
        "",
        `Your 3L order ${reference} is ready for pickup.`,
        ...(when ? ["", `Pickup: ${when}`] : []),
        "",
        PICKUP_LOCATION.name,
        ...PICKUP_LOCATION.lines,
        "",
        "See you soon.",
        ...sign,
      ].join("\n"),
    };
  return {
    subject: `Your 3L order ${reference} is on the way`,
    body: [
      `Hi ${first},`,
      "",
      `Your 3L order ${reference} is on the way.`,
      // Area only: a full address does not belong in an email.
      ...(context.zoneName ? ["", `Delivering to: ${context.zoneName}`] : []),
      "",
      "We'll update you once your order has been delivered.",
      ...sign,
    ].join("\n"),
  };
}

/**
 * Call inside the store write that performed the transition. Returns the new
 * row, or null when the transition announces nothing, the event already
 * exists for this order, or the order has no email address.
 */
export function recordCustomerEvent(
  s: State,
  order: Order,
  from: OrderState,
  to: OrderState,
): CustomerNotification | null {
  const event = customerEventFor(order, from, to);
  if (!event) return null;
  const key = `customer-event:${event}:${order.id}`;
  if (s.events[key]) return null;
  const recipient = order.customerDetails?.email;
  if (!recipient) return null;
  const conversation = s.conversations.find(
    (c) => c.id === order.conversationId,
  );
  const zone = s.zones.find(
    (z) => z.id === (order.delivery?.zoneId ?? order.manualZoneId),
  );
  const notification: CustomerNotification = {
    id: randomUUID(),
    event,
    channel: "email",
    orderId: order.id,
    publicOrderNumber: order.publicOrderNumber,
    recipient,
    ...renderCustomerEmail(event, order, {
      fallbackName: conversation?.customer,
      zoneName: zone?.name ?? order.quote?.zoneName ?? undefined,
    }),
    status: "pending",
    attemptCount: 0,
    createdAt: new Date().toISOString(),
  };
  s.events[key] = notification.id;
  s.customerNotifications ??= [];
  s.customerNotifications.push(notification);
  s.audit.push({
    at: notification.createdAt,
    actor: "system",
    action: `${event} ${order.id}: customer email queued`,
  });
  return notification;
}

/** Delivery adapter. The idempotency key lets a provider drop a repeated send. */
export interface CustomerEmailProvider {
  readonly name: string;
  send(email: {
    to: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }): Promise<{ messageId: string }>;
}

/**
 * Delivers pending emails. Without a provider this returns before reading a
 * row. Each row is claimed ("sending") in its own transaction before the
 * network call, so two dispatchers — or a restart mid-send — cannot both send
 * it; a row found "sending" after a crash is surfaced as failed for a person
 * to review rather than resent blindly.
 */
/**
 * A progress email is only useful near the moment it describes. One still
 * unsent after this long — because no provider was configured, or it was
 * down — is retired instead of being delivered late. This also means turning
 * a provider on can never release a backlog of old emails.
 */
export const CUSTOMER_EMAIL_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export async function dispatchCustomerNotifications(
  store: { read(): State; write<T>(fn: (s: State) => T): T },
  provider: CustomerEmailProvider | null,
) {
  if (!provider) return { attempted: 0, skipped: "no-email-provider" as const };
  let attempted = 0;
  const cutoff = Date.now() - CUSTOMER_EMAIL_MAX_AGE_MS;
  if (
    (store.read().customerNotifications ?? []).some(
      (n) => n.status === "pending" && Date.parse(n.createdAt) < cutoff,
    )
  )
    store.write((s) => {
      for (const row of s.customerNotifications ?? [])
        if (row.status === "pending" && Date.parse(row.createdAt) < cutoff) {
          row.status = "failed";
          row.lastError = "Expired before it could be sent; not sent";
        }
    });
  for (const pending of (store.read().customerNotifications ?? []).filter(
    (n) => n.status === "pending",
  )) {
    const claimed = store.write((s) => {
      const row = s.customerNotifications?.find((r) => r.id === pending.id);
      if (!row || row.status !== "pending") return null;
      row.status = "sending";
      row.attemptCount++;
      row.provider = provider.name;
      row.lastAttemptAt = new Date().toISOString();
      return structuredClone(row);
    });
    if (!claimed) continue;
    attempted++;
    try {
      const result = await provider.send({
        to: claimed.recipient,
        subject: claimed.subject,
        text: claimed.body,
        idempotencyKey: claimed.id,
      });
      store.write((s) => {
        const row = s.customerNotifications!.find((r) => r.id === claimed.id)!;
        row.status = "sent";
        row.sentAt = new Date().toISOString();
        row.providerMessageId = result.messageId;
        row.lastError = undefined;
      });
    } catch {
      store.write((s) => {
        const row = s.customerNotifications!.find((r) => r.id === claimed.id)!;
        row.status = "failed";
        row.lastError = "Delivery failed; review before resending";
      });
    }
  }
  return { attempted, skipped: null };
}

/** After a restart, an email left mid-send has an unknown outcome. */
export function recoverInterruptedCustomerNotifications(store: {
  write<T>(fn: (s: State) => T): T;
}) {
  return store.write((s) => {
    let recovered = 0;
    for (const row of s.customerNotifications ?? [])
      if (row.status === "sending") {
        row.status = "failed";
        row.lastError = "Interrupted while sending; review before resending";
        recovered++;
      }
    return recovered;
  });
}
