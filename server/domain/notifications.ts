import { preparationText } from "../../shared/pack-composition";
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
import { z } from "zod";
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

/** Exactly one private recipient; no implicit recipient and no source fallback. */
export function operationsRecipients(managerPhone?: string) {
  const phone = managerPhone?.replace(/[\s-]/g, "") ?? "";
  return /^\+[1-9]\d{7,14}$/.test(phone) ? [{ name: "3L Manager", phone }] : [];
}

export const PAID_ALERT_BODY =
  "3L Pastelerías: A new order has been paid. Order: {{1}}. Total: AED {{2}}. Fulfillment: {{3}}. Please review the order in Operations and coordinate production. Order details (staff login required): {{4}}.";
export function parseNotificationCutoff(value?: string): string | undefined {
  if (!value) return undefined;
  return z.iso.datetime().parse(value);
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
    return `${l.quantity} × ${name}${l.composition ? `\n${preparationText(l)}` : ""}`;
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
  if (
    payment.status !== "paid" ||
    !payment.lastReconciledAt ||
    !payment.paidAt ||
    order.paidAt !== payment.paidAt ||
    order.paymentId !== payment.id ||
    payment.orderId !== order.id ||
    order.state !== "Confirmed"
  )
    return [];
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
  const fulfillment = message
    .split("\n")
    .filter((line) => /^(PICKUP|DELIVERY|When:)/.test(line))
    .join("; ");
  let operationsLink: string | undefined;
  try {
    const url = new URL(
      `/operations/orders?order=${encodeURIComponent(order.id)}`,
      origin,
    );
    if (url.protocol === "https:" && !url.username && !url.password)
      operationsLink = url.href;
  } catch {
    /* Without a canonical secure origin, alerts cannot dispatch. */
  }
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
      paidAt: payment.paidAt,
      templateParameters: operationsLink
        ? [
            orderReference(order),
            aed(payment.amountFils),
            fulfillment,
            operationsLink,
          ]
        : undefined,
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
    action: `ORDER_PAID ${order.id}: ${notifications.length ? "operations notification queued" : "no configured WhatsApp recipient; no alert queued"}`,
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
  options: {
    outboundEnabled: boolean;
    notifier: OperationsNotifier | null;
    activationSince?: string;
    sourcePhone?: string;
    recipientPhones?: string[];
  },
) {
  if (!options.outboundEnabled || !options.notifier)
    return { attempted: 0, skipped: "outbound-disabled" as const };
  const cutoff = options.activationSince
    ? Date.parse(options.activationSince)
    : NaN;
  if (!Number.isFinite(cutoff) || cutoff > Date.now())
    return { attempted: 0, skipped: "activation-cutoff-required" as const };
  let attempted = 0;
  const pending = (store.read().operationsNotifications ?? []).filter(
    (n) => n.status === "pending-whatsapp-delivery",
  );
  for (const n of pending) {
    // Claim before sending so a concurrent dispatcher cannot send it twice.
    const claimed = store.write((s) => {
      const row = s.operationsNotifications?.find((r) => r.id === n.id);
      if (!row || row.status !== "pending-whatsapp-delivery") return null;
      const payment = s.payments.find((p) => p.id === row.paymentId);
      const order = s.orders.find((o) => o.id === row.orderId);
      const eligible =
        row.paidAt &&
        Date.parse(row.paidAt) > cutoff &&
        Date.parse(row.createdAt) > cutoff &&
        Date.now() - Date.parse(row.createdAt) >= 0 &&
        Date.now() - Date.parse(row.createdAt) <= 15 * 60 * 1000 &&
        payment?.status === "paid" &&
        payment.paidAt === row.paidAt &&
        !!payment.lastReconciledAt &&
        order?.paidAt === row.paidAt &&
        order.paymentId === payment.id &&
        (!options.sourcePhone ||
          digits(row.recipient.phone) !== digits(options.sourcePhone)) &&
        (!options.recipientPhones ||
          options.recipientPhones.some(
            (p) => digits(p) === digits(row.recipient.phone),
          ));
      if (!eligible) {
        row.status = "suppressed";
        row.lastError = "Not eligible for this activation; no send";
        return null;
      }
      row.attempts++;
      row.status = "sending";
      row.lastError = "in-flight; interrupted sends require manual review";
      return structuredClone(row);
    });
    if (!claimed) continue;
    attempted++;
    try {
      const result = await options.notifier.send(claimed);
      store.write((s) => {
        const row = s.operationsNotifications!.find((r) => r.id === n.id)!;
        row.status = "accepted";
        row.acceptedAt = new Date().toISOString();
        row.providerId = result.providerId;
        row.lastError = undefined;
      });
    } catch (error) {
      // No automatic resend: an ambiguous send is surfaced for a human.
      store.write((s) => {
        const row = s.operationsNotifications!.find((r) => r.id === n.id)!;
        row.status = "failed";
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
  validate?: () => Promise<void>,
): OperationsNotifier {
  return {
    async send(n) {
      // The alert goes FROM the business number. If a recipient is that same
      // number (the manager's phone is also the public WhatsApp line), the
      // message would be sent to itself: refuse rather than assume it works.
      if (digits(n.recipient.phone) === digits(origin.phone))
        throw new SelfRecipientError();
      if (!n.templateParameters || n.templateParameters.length !== 4)
        throw new Error("Alert parameters missing; historical row cannot send");
      if (validate) await validate();
      return provider.send({
        sourceNumberId: origin.id,
        sourcePhoneNumber: origin.phone,
        recipient: n.recipient.phone,
        text: n.message,
        template: {
          name: template.name,
          language: template.language,
          parameters: n.templateParameters,
        },
        idempotencyKey: n.id,
      });
    },
  };
}

/** Receipts change the outbox only; never an operational order state. */
export function applyOperationsReceipt(
  s: State,
  providerId: string,
  status: "sent" | "delivered" | "read" | "failed",
): boolean {
  const row = s.operationsNotifications?.find(
    (n) => n.providerId === providerId,
  );
  if (!row) return false;
  if (status === "failed") {
    if (row.status !== "delivered" && row.status !== "read") {
      row.status = "failed";
      row.lastError = "Provider reported failure; review required";
    }
  } else {
    const rank = { sent: 1, delivered: 2, read: 3 };
    const current =
      row.status in rank ? rank[row.status as keyof typeof rank] : 0;
    if (rank[status] > current) {
      row.status = status;
      if (status === "sent") row.sentAt = new Date().toISOString();
      row.lastError = undefined;
      row.statusAt = new Date().toISOString();
    }
  }
  return true;
}
