/**
 * Operations notifications: the paid-order alert for the 3L team.
 *
 * The website owns ordering and payment. WhatsApp is only an operational
 * channel, and only for orders that are already paid:
 *
 *   applyCheckout (verified PAID, once) → ORDER_PAID → outbox row
 *   → dispatcher → WhatsApp (only when outbound is explicitly enabled)
 *
 * Nothing in this module runs for carts, checkouts, unpaid, failed or abandoned
 * payments — the outbox row is created solely from the payment-confirmed
 * branch of CommerceService.applyCheckout, behind its once-only paidAt guard.
 */
import { randomUUID } from "node:crypto";
import type {
  CatalogItem,
  Conversation,
  DeliveryZone,
  OperationsNotification,
  Order,
  Payment,
  State,
} from "./model";

import { orderReference } from "../../shared/order-number";
import { PICKUP_LOCATION } from "../../shared/pickup-location";
import { customerName } from "./order-number";

/** Confirmed operations recipient for paid-order alerts. */
export const OPERATIONS_RECIPIENT = {
  name: "Liza",
  phone: "+971521683319",
} as const;
/**
 * Who is told about a paid order: one row per configured recipient. Liza's
 * number is confirmed; the manager's is private configuration and is included
 * only when a valid number has been supplied.
 */
export function operationsRecipients(managerPhone?: string) {
  const phone = managerPhone?.replace(/[\s-]/g, "") ?? "";
  return [
    { ...OPERATIONS_RECIPIENT },
    ...(/^\+[1-9]\d{7,14}$/.test(phone) ? [{ name: "3L Manager", phone }] : []),
  ];
}

const aed = (fils: number) => (fils / 100).toFixed(2);

/** Concise by design: no card, payment-provider or address detail. */
export function renderOrderPaidMessage(input: {
  order: Order;
  payment: Payment;
  conversation?: Conversation;
  catalog: CatalogItem[];
  zone?: DeliveryZone;
  origin?: string;
}) {
  const { order, payment, conversation, catalog, zone } = input;
  const items = order.lines.map((l) => {
    const name =
      (order.catalogSnapshot ?? catalog).find((p) => p.id === l.productId)
        ?.name ?? l.productId;
    return `${l.quantity} × ${name}`;
  });
  const pickup = order.fulfillmentMethod === "pickup";
  const when = [
    order.pickup?.pickupDate ?? order.delivery?.date,
    order.pickup?.preferredTime ?? order.delivery?.slot,
  ]
    .filter(Boolean)
    .join(", ");
  const link = `${input.origin ?? ""}/operations/orders?order=${encodeURIComponent(order.id)}`;
  return [
    `New paid order ${orderReference(order)} ✅`,
    "",
    `Customer: ${customerName(order, conversation?.customer) || "—"}`,
    pickup
      ? `PICKUP at ${PICKUP_LOCATION.name}`
      : `DELIVERY to ${zone?.name ?? order.quote?.zoneName ?? "—"}`,
    `When: ${when || "—"}`,
    `Total paid: AED ${aed(payment.amountFils)}`,
    "",
    // A short summary; the full order is one tap away.
    ...items.slice(0, 4),
    ...(items.length > 4 ? [`+ ${items.length - 4} more`] : []),
    "",
    link,
  ].join("\n");
}

/**
 * ORDER_PAID. Idempotent per order: a second call for the same order — a
 * duplicate webhook, a reconcile after a direct CAPTURED, a replayed return —
 * is a no-op, so the team is never alerted twice for one order.
 */
export function recordOrderPaid(
  s: State,
  order: Order,
  payment: Payment,
  origin?: string,
  managerPhone?: string,
): OperationsNotification[] {
  const key = `order-paid:${order.id}`;
  if (s.events[key]) return [];
  s.events[key] = payment.id;
  const createdAt = new Date().toISOString();
  const message = renderOrderPaidMessage({
    order,
    payment,
    conversation: s.conversations.find((c) => c.id === order.conversationId),
    catalog: s.catalog ?? [],
    zone: s.zones.find(
      (z) => z.id === (order.delivery?.zoneId ?? order.manualZoneId),
    ),
    origin,
  });
  const notifications = operationsRecipients(managerPhone).map(
    (recipient): OperationsNotification => ({
      id: randomUUID(),
      event: "ORDER_PAID",
      kind: "notify_operations_whatsapp",
      orderId: order.id,
      publicOrderNumber: order.publicOrderNumber,
      paymentId: payment.id,
      recipient,
      message,
      status: "pending-whatsapp-delivery",
      attempts: 0,
      createdAt,
    }),
  );
  s.operationsNotifications ??= [];
  s.operationsNotifications.push(...notifications);
  s.audit.push({
    at: createdAt,
    actor: "system",
    action: `ORDER_PAID ${order.id}: operations notification queued`,
  });
  return notifications;
}

/** Delivery adapter. Implemented over the WhatsApp provider once Meta is ready. */
export interface OperationsNotifier {
  send(notification: OperationsNotification): Promise<{ providerId: string }>;
}

/**
 * Delivers queued notifications. While outbound is disabled — or no notifier
 * is configured — this returns without touching a single row and without
 * calling any provider: rows stay "pending-whatsapp-delivery" and visible.
 */
export async function dispatchOperationsNotifications(
  store: {
    read(): State;
    write<T>(fn: (s: State) => T): T;
  },
  options: { outboundEnabled: boolean; notifier: OperationsNotifier | null },
) {
  if (!options.outboundEnabled || !options.notifier)
    return { attempted: 0, skipped: "outbound-disabled" as const };
  let attempted = 0;
  const pending = (store.read().operationsNotifications ?? []).filter(
    (n) => n.status === "pending-whatsapp-delivery",
  );
  for (const n of pending) {
    // Claim before sending so a concurrent dispatcher cannot send it twice.
    const claimed = store.write((s) => {
      const row = s.operationsNotifications?.find((r) => r.id === n.id);
      if (!row || row.status !== "pending-whatsapp-delivery") return null;
      row.attempts++;
      row.status = "failed";
      row.lastError = "in-flight";
      return structuredClone(row);
    });
    if (!claimed) continue;
    attempted++;
    try {
      const result = await options.notifier.send(claimed);
      store.write((s) => {
        const row = s.operationsNotifications!.find((r) => r.id === n.id)!;
        row.status = "sent";
        row.sentAt = new Date().toISOString();
        row.providerId = result.providerId;
        row.lastError = undefined;
      });
    } catch (error) {
      // No automatic resend: an ambiguous send is surfaced for a human.
      store.write((s) => {
        const row = s.operationsNotifications!.find((r) => r.id === n.id)!;
        row.lastError =
          error instanceof SelfRecipientError
            ? "Not sent: the recipient is the sending WhatsApp number"
            : "Delivery failed; review before resending";
      });
    }
  }
  return { attempted, skipped: null };
}

/** A business number cannot usefully alert itself; refused before any provider call. */
export class SelfRecipientError extends Error {}
const digits = (phone: string) => phone.replace(/\D/g, "");

/**
 * WhatsApp delivery for operations alerts. Business-initiated messages outside
 * WhatsApp's 24-hour window require an approved template, so this adapter is
 * only constructed when one is configured; without it the provider refuses
 * (PAYMENT_TEMPLATE_REQUIRED-style rejection) and nothing off-policy is sent.
 */
export function createWhatsAppOperationsNotifier(
  provider: import("../adapters/providers").WhatsAppProvider,
  origin: { id: string; phone: string },
  template: { name: string; language: string },
): OperationsNotifier {
  return {
    async send(n) {
      // The alert goes FROM the business number. If a recipient is that same
      // number (the manager's phone is also the public WhatsApp line), the
      // message would be sent to itself: refuse rather than assume it works.
      if (digits(n.recipient.phone) === digits(origin.phone))
        throw new SelfRecipientError();
      const total = /Total paid: AED ([0-9.]+)/.exec(n.message)?.[1] ?? "";
      const reference = n.publicOrderNumber
        ? orderReference({
            id: n.orderId,
            publicOrderNumber: n.publicOrderNumber,
          })
        : n.orderId;
      return provider.send({
        sourceNumberId: origin.id,
        sourcePhoneNumber: origin.phone,
        recipient: n.recipient.phone,
        text: n.message,
        template: {
          name: template.name,
          language: template.language,
          parameters: [reference, total],
        },
        idempotencyKey: n.id,
      });
    },
  };
}
