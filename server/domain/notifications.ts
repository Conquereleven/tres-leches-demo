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

/** Confirmed operations recipient for paid-order alerts. */
export const OPERATIONS_RECIPIENT = {
  name: "Liza",
  phone: "+971521683319",
} as const;

const aed = (fils: number) => (fils / 100).toFixed(2);

export function renderOrderPaidMessage(input: {
  order: Order;
  payment: Payment;
  conversation?: Conversation;
  catalog: CatalogItem[];
  zone?: DeliveryZone;
  origin?: string;
}) {
  const { order, payment, conversation, catalog, zone } = input;
  const items = order.lines
    .map((l) => {
      const name =
        (order.catalogSnapshot ?? catalog).find((p) => p.id === l.productId)
          ?.name ?? l.productId;
      return `${l.quantity} × ${name}`;
    })
    .join("\n");
  const subtotal = order.quote?.subtotalFils ?? payment.amountFils;
  const delivery = order.quote?.feeFils ?? 0;
  const pickup = order.fulfillmentMethod === "pickup";
  const d = pickup ? undefined : order.delivery;
  const address = d
    ? [
        d.unit && `Unit ${d.unit}`,
        d.building,
        d.address,
        zone?.name ?? order.quote?.zoneName,
      ]
        .filter(Boolean)
        .join(", ")
    : (order.address ?? "—");
  const notes = [d?.notes, order.customerDetails?.instructions]
    .filter(Boolean)
    .join("\n");
  const link = `${input.origin ?? ""}/operations/orders?order=${encodeURIComponent(order.id)}`;
  return [
    "New paid order ✅",
    "",
    `Order: ${order.id}`,
    `Customer: ${conversation?.customer ?? "—"}`,
    `Phone: ${conversation?.phone ?? "—"}`,
    "",
    "Items:",
    items,
    "",
    `Subtotal: AED ${aed(subtotal)}`,
    `${pickup ? "Pickup" : "Delivery"}: AED ${aed(delivery)}`,
    `Total paid: AED ${aed(payment.amountFils)}`,
    "",
    pickup ? "PICKUP:" : "DELIVERY:",
    order.pickup?.pickupDate ?? d?.date ?? "—",
    order.pickup?.preferredTime ?? d?.slot ?? "—",
    "",
    "Address:",
    pickup ? "Pickup at Pastelerías 3L" : address,
    "",
    "Notes:",
    notes || "—",
    "",
    "Payment: PAID",
    "",
    "Open order:",
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
): OperationsNotification | null {
  const key = `order-paid:${order.id}`;
  if (s.events[key]) return null;
  s.events[key] = payment.id;
  const notification: OperationsNotification = {
    id: randomUUID(),
    event: "ORDER_PAID",
    kind: "notify_operations_whatsapp",
    orderId: order.id,
    paymentId: payment.id,
    recipient: { ...OPERATIONS_RECIPIENT },
    message: renderOrderPaidMessage({
      order,
      payment,
      conversation: s.conversations.find((c) => c.id === order.conversationId),
      catalog: s.catalog ?? [],
      zone: s.zones.find(
        (z) => z.id === (order.delivery?.zoneId ?? order.manualZoneId),
      ),
      origin,
    }),
    status: "pending-whatsapp-delivery",
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  s.operationsNotifications ??= [];
  s.operationsNotifications.push(notification);
  s.audit.push({
    at: notification.createdAt,
    actor: "system",
    action: `ORDER_PAID ${order.id}: operations notification queued`,
  });
  return notification;
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
    } catch {
      // No automatic resend: an ambiguous send is surfaced for a human.
      store.write((s) => {
        const row = s.operationsNotifications!.find((r) => r.id === n.id)!;
        row.lastError = "Delivery failed; review before resending";
      });
    }
  }
  return { attempted, skipped: null };
}

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
      const total = /Total paid: AED ([0-9.]+)/.exec(n.message)?.[1] ?? "";
      return provider.send({
        sourceNumberId: origin.id,
        sourcePhoneNumber: origin.phone,
        recipient: n.recipient.phone,
        text: n.message,
        template: {
          name: template.name,
          language: template.language,
          parameters: [n.orderId, total],
        },
        idempotencyKey: n.id,
      });
    },
  };
}
