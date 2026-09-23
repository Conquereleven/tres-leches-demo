/** Public entry into the existing catalog/quote/command/outbox/payment domain. */
import { z } from "zod";
import type { CommerceService } from "./service";
import { requireThat, type Actor, type Order } from "./model";
import { quoteOrder } from "./zones";
import { createHash, randomUUID } from "node:crypto";
export const WEB_ACTOR: Actor = { id: "web-checkout", role: "operator" };
export const WEB_SOURCE = "web";
export const webQuoteSchema = z
  .object({
    productId: z.literal("pan-de-muerto"),
    quantity: z.number().int().min(1).max(20),
    zoneId: z.string().min(1).max(100),
  })
  .strict();
export const webCheckoutSchema = webQuoteSchema
  .extend({
    customer: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{7,16}$/),
    address: z.string().trim().min(5).max(500),
  })
  .strict();
export type WebCheckoutInput = z.infer<typeof webCheckoutSchema>;
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const keySchema = z.uuid();
export function quoteWebCheckout(service: CommerceService, raw: unknown) {
  const input = webQuoteSchema.parse(raw),
    s = service.store.read();
  const zone = s.zones.find((z) => z.id === input.zoneId && z.active);
  requireThat(zone, "Delivery zone is not supported", 400);
  return quoteOrder(
    s.zones,
    [{ productId: input.productId, quantity: input.quantity }],
    undefined,
    undefined,
    service.geo,
    zone.id,
    s.catalog ?? [],
  );
}
export type WebCheckoutResult = {
  orderId: string;
  status: Order["state"];
  paymentStatus: string;
  amountFils: number;
  currency: string;
  url: string | null;
  actionRequired: "review_payment" | "complete_payment" | null;
};
/** The unguessable UUID capability is kept in the browser session, never a phone-based lookup. */
export function readWebCheckoutStatus(
  service: CommerceService,
  key: string,
): WebCheckoutResult {
  const s = service.store.read(),
    record = s.webCheckouts?.[digest(keySchema.parse(key))];
  const order = s.orders.find((o) => o.id === record?.orderId);
  const payment = s.payments.find((p) => p.id === order?.paymentId);
  requireThat(order && payment, "Checkout not found", 404);
  return {
    orderId: order.id,
    status: order.state,
    paymentStatus: payment.status,
    amountFils: payment.amountFils,
    currency: payment.currency,
    actionRequired:
      payment.directAttempt === "unknown" ||
      (payment.directAttempt === "submitted" &&
        Date.now() - Date.parse(payment.updatedAt) > 30000)
        ? "review_payment"
        : payment.directAttempt === "ready"
          ? "complete_payment"
          : null,
    url: payment.status === "pending" ? (payment.url ?? null) : null,
  };
}
/** Reservation, all domain commands and outbox entry commit together before any network request. */
export async function createWebCheckout(
  service: CommerceService,
  raw: unknown,
  key: string,
  embedded = false,
): Promise<WebCheckoutResult> {
  const input = webCheckoutSchema.parse(raw),
    receiptKey = digest(keySchema.parse(key));
  const inputHash = digest(JSON.stringify(input));
  service.store.transaction(() => {
    const previous = service.store.read().webCheckouts?.[receiptKey];
    if (previous) {
      requireThat(
        previous.inputHash === inputHash,
        "Checkout key already used with different details",
        409,
      );
      return;
    }
    const quote = quoteWebCheckout(service, {
      productId: input.productId,
      quantity: input.quantity,
      zoneId: input.zoneId,
    });
    requireThat(quote.eligible, quote.reason, 422);
    // A checkout owns its own conversation: knowing a phone cannot seize an existing order.
    const conversationId = randomUUID();
    service.store.write((s) =>
      s.conversations.push({
        id: conversationId,
        customer: input.customer,
        phone: input.phone,
        sourceNumberId: WEB_SOURCE,
        sourcePhoneNumber: WEB_SOURCE,
        assignedAgent: WEB_ACTOR.id,
        status: "open",
        unread: true,
        version: 0,
        messages: [],
        address: input.address,
        audit: [],
      }),
    );
    type Step = { id: string; version: number };
    const command = (
      type: string,
      current: Step,
      extra: Record<string, unknown> = {},
    ) =>
      service.command(
        { type, ...current, ...extra },
        `${key}-${type}`,
        WEB_ACTOR,
      ) as Step;
    let order = command("createOrder", { id: conversationId, version: 0 });
    order = command("editOrder", order, {
      lines: [{ productId: input.productId, quantity: input.quantity }],
    });
    order = command("manualZone", order, {
      zoneId: input.zoneId,
      reason:
        "Customer selected delivery zone; address retained for fulfillment",
    });
    order = command("requestPayment", order);
    if (embedded)
      service.store.write((s) => {
        const payment = s.payments.find((p) => p.orderId === order.id)!;
        payment.directAttempt = "ready";
        // Reuse the existing payment record; no hosted-link job can race token submission.
        s.jobs = s.jobs.filter(
          (j) => !(j.kind === "payment" && j.entityId === payment.id),
        );
      });
    service.store.write((s) => {
      s.webCheckouts ??= {};
      s.webCheckouts[receiptKey] = {
        inputHash,
        orderId: order.id,
        createdAt: new Date().toISOString(),
      };
    });
  });
  // Concurrent calls share the same durable payment job; unknown sends are not retried blindly.
  if (!embedded) await service.drain();
  return readWebCheckoutStatus(service, key);
}
