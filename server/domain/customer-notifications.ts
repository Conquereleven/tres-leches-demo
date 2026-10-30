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
import { ProviderFailure } from "../adapters/failure";
import { z } from "zod";
import { renderCustomerEmailHtml } from "./customer-email-html";
import {
  customerEmailItems,
  customerEmailItemsText,
} from "./customer-email-items";
import { orderReference } from "../../shared/order-number";
import { PICKUP_LOCATION } from "../../shared/pickup-location";
import { customerName } from "./order-number";
import type {
  CustomerEvent,
  CustomerNotification,
  Order,
  OrderState,
  Payment,
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
  context: {
    fallbackName?: string;
    zoneName?: string;
    paidAmountFils?: number;
  } = {},
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
  const items = customerEmailItems(order);
  const reminder = ["", ...customerEmailItemsText(items)];
  const html = renderCustomerEmailHtml({
    event,
    first,
    reference,
    when,
    pickup,
    zoneName: context.zoneName,
    items,
    ...(order.quote?.feeFils != null
      ? {
          subtotal: `AED ${(order.quote.subtotalFils / 100).toFixed(2)}`,
          deliveryFee: `AED ${(order.quote.feeFils / 100).toFixed(2)}`,
        }
      : {}),
    paidTotal:
      context.paidAmountFils === undefined
        ? undefined
        : `AED ${(context.paidAmountFils / 100).toFixed(2)}`,
  });
  if (event === "ORDER_PAID")
    return {
      subject: `Your 3L order ${reference} is confirmed!`,
      html,
      body: [
        `Hi ${first},`,
        "",
        `Your payment is verified and your 3L order ${reference} is confirmed.`,
        "",
        ...reminder,
        ...(context.paidAmountFils === undefined
          ? []
          : [
              "",
              ...(order.quote?.feeFils != null
                ? [
                    `Subtotal: AED ${(order.quote.subtotalFils / 100).toFixed(2)}`,
                    `Delivery fee: AED ${(order.quote.feeFils / 100).toFixed(2)}`,
                  ]
                : []),
              `Total paid: AED ${(context.paidAmountFils / 100).toFixed(2)}`,
            ]),
        "",
        `${pickup ? "Pickup" : "Delivery"}${when ? `: ${when}` : ""}`,
        ...(pickup
          ? [PICKUP_LOCATION.name, ...PICKUP_LOCATION.lines]
          : ["Please be available during your selected delivery window."]),
        "",
        "We'll let you know when our team starts preparing your order.",
        "For help, contact 3L: +971 58 594 3319.",
        ...sign,
      ].join("\n"),
    };
  if (event === "ORDER_PRODUCTION_STARTED")
    return {
      subject: `Your 3L order ${reference} is now being prepared`,
      html,
      body: [
        `Hi ${first},`,
        "",
        `Good news — your 3L order ${reference} is now being prepared by our team.`,
        ...(when ? ["", `${pickup ? "Pickup" : "Delivery"}: ${when}`] : []),
        "",
        ...reminder,
        "",
        "We'll let you know as soon as it's ready.",
        ...sign,
      ].join("\n"),
    };
  if (event === "ORDER_READY_FOR_PICKUP")
    return {
      subject: `Your 3L order ${reference} is ready for pickup`,
      html,
      body: [
        `Hi ${first},`,
        "",
        `Your 3L order ${reference} is ready for pickup.`,
        ...(when ? ["", `Pickup: ${when}`] : []),
        "",
        PICKUP_LOCATION.name,
        ...PICKUP_LOCATION.lines,
        "",
        ...reminder,
        "",
        "See you soon.",
        ...sign,
      ].join("\n"),
    };
  return {
    subject: `Your 3L order ${reference} is on the way`,
    html,
    body: [
      `Hi ${first},`,
      "",
      `Your 3L order ${reference} is on the way.`,
      // Area only: a full address does not belong in an email.
      ...(context.zoneName ? ["", `Delivering to: ${context.zoneName}`] : []),
      "",
      ...(when ? ["", `${pickup ? "Pickup" : "Delivery"}: ${when}`] : []),
      ...reminder,
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
  return recordEvent(s, order, event);
}

/** Off unless explicitly configured; invalid or incomplete activation fails closed. */
export function customerPaidEmailSince(
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (env.CUSTOMER_ORDER_PAID_EMAIL_ENABLED !== "true") return undefined;
  if (env.CUSTOMER_EMAIL_ENABLED !== "true")
    throw new Error(
      "Paid confirmation requires customer email delivery enabled",
    );
  const since = z.iso
    .datetime({ offset: true })
    .safeParse(env.CUSTOMER_ORDER_PAID_EMAIL_SINCE);
  if (!since.success)
    throw new Error("Paid confirmation requires a valid activation timestamp");
  return new Date(since.data).toISOString();
}

/** Only called in the authoritative paid+confirmed transaction; no historical scan. */
export function recordPaidCustomerConfirmation(
  s: State,
  order: Order,
  payment: Payment,
  since?: string,
) {
  const cutoff = since ? Date.parse(since) : NaN;
  const created = order.audit[0]?.at;
  if (
    !Number.isFinite(cutoff) ||
    order.state !== "Confirmed" ||
    order.paymentId !== payment.id ||
    payment.orderId !== order.id ||
    payment.status !== "paid" ||
    !payment.paidAt ||
    !payment.lastReconciledAt ||
    order.paidAt !== payment.paidAt ||
    !created ||
    ![created, payment.createdAt, payment.paidAt].every(
      (at) => Number.isFinite(Date.parse(at)) && Date.parse(at) >= cutoff,
    )
  )
    return null;
  return recordEvent(s, order, "ORDER_PAID", {
    paidAmountFils: payment.amountFils,
    activationSince: since,
  });
}

function recordEvent(
  s: State,
  order: Order,
  event: CustomerEvent,
  paid?: { paidAmountFils: number; activationSince?: string },
): CustomerNotification | null {
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
      paidAmountFils: paid?.paidAmountFils,
    }),
    ...(paid ? { activationSince: paid.activationSince } : {}),
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
    html?: string;
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
  collection:
    | "customerNotifications"
    | "operationsEmailNotifications" = "customerNotifications",
  paidActivationSince?: string,
) {
  if (!provider) return { attempted: 0, skipped: "no-email-provider" as const };
  let attempted = 0;
  const cutoff = Date.now() - CUSTOMER_EMAIL_MAX_AGE_MS;
  if (
    (store.read()[collection] ?? []).some(
      (n) => n.status === "pending" && Date.parse(n.createdAt) < cutoff,
    )
  )
    store.write((s) => {
      for (const row of s[collection] ?? [])
        if (row.status === "pending" && Date.parse(row.createdAt) < cutoff) {
          row.status = "failed";
          row.lastError = "Expired before it could be sent; not sent";
        }
    });
  for (const pending of (store.read()[collection] ?? []).filter(
    (n) =>
      n.status === "pending" &&
      (n.event !== "ORDER_PAID" ||
        collection !== "customerNotifications" ||
        !!paidActivationSince),
  )) {
    const claimed = store.write((s) => {
      const row = s[collection]?.find((r) => r.id === pending.id);
      if (!row || row.status !== "pending") return null;
      if (
        collection === "customerNotifications" &&
        row.event === "ORDER_PAID" &&
        row.activationSince !== paidActivationSince
      ) {
        row.status = "failed";
        row.deliveryOutcome = "failed";
        row.lastError = "Expired activation window; not sent";
        return null;
      }
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
        ...(claimed.html ? { html: claimed.html } : {}),
        idempotencyKey: claimed.id,
      });
      store.write((s) => {
        const row = s[collection]!.find((r) => r.id === claimed.id)!;
        row.status = "sent";
        if (
          collection === "customerNotifications" &&
          row.event === "ORDER_PAID"
        )
          row.deliveryOutcome = "accepted";
        row.sentAt = new Date().toISOString();
        row.providerMessageId = result.messageId;
        row.lastError = undefined;
      });
    } catch (error) {
      store.write((s) => {
        const row = s[collection]!.find((r) => r.id === claimed.id)!;
        row.status = "failed";
        if (
          collection === "customerNotifications" &&
          row.event === "ORDER_PAID"
        ) {
          row.deliveryOutcome =
            error instanceof ProviderFailure && error.certainty === "rejected"
              ? "failed"
              : "unknown";
          row.lastError =
            row.deliveryOutcome === "unknown"
              ? "Provider outcome unknown; review before resending"
              : "Provider rejected email; review before resending";
        } else row.lastError = "Delivery failed; review before resending";
      });
    }
  }
  return { attempted, skipped: null };
}

/** After a restart, an email left mid-send has an unknown outcome. */
export function recoverInterruptedCustomerNotifications(
  store: {
    write<T>(fn: (s: State) => T): T;
  },
  collection:
    | "customerNotifications"
    | "operationsEmailNotifications" = "customerNotifications",
) {
  return store.write((s) => {
    let recovered = 0;
    for (const row of s[collection] ?? [])
      if (row.status === "sending") {
        row.status = "failed";
        row.lastError = "Interrupted while sending; review before resending";
        if (
          collection === "customerNotifications" &&
          row.event === "ORDER_PAID"
        )
          row.deliveryOutcome = "unknown";
        recovered++;
      }
    return recovered;
  });
}
