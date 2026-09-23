import { ProviderFailure } from "../adapters/failure";
/** Tokens are request-scoped only. A durable claim precedes the provider call. */
import { z } from "zod";
import { PaymenntProvider } from "../adapters/paymennt";
import type { CommerceService } from "./service";
import { requireThat } from "./model";
import {
  readWebCheckoutStatus,
  quoteWebCheckout,
  WEB_ACTOR,
} from "./web-checkout";
export const tokenSubmissionSchema = z
  .object({
    key: z.uuid(),
    orderId: z.string().min(1).max(100),
    token: z.string().regex(/^ptk_[A-Za-z0-9_]{10,500}$/),
    email: z.email().max(254),
  })
  .strict();
function owned(service: CommerceService, key: string) {
  const result = readWebCheckoutStatus(service, key);
  const s = service.store.read();
  const order = s.orders.find((o) => o.id === result.orderId)!;
  const payment = s.payments.find((p) => p.id === order.paymentId)!;

  return { order, payment, s };
}
export async function submitEmbeddedPayment(
  service: CommerceService,
  raw: unknown,
  origin: string,
) {
  const input = tokenSubmissionSchema.parse(raw);
  requireThat(
    service.payment instanceof PaymenntProvider,
    "Direct payment unavailable",
    503,
  );
  const provider = service.payment;
  const { order, payment, s } = owned(service, input.key);
  requireThat(
    order.id === input.orderId && payment.directAttempt,
    "Checkout mismatch",
    403,
  );
  if (payment.directAttempt !== "ready")
    return readWebCheckoutStatus(service, input.key);
  requireThat(
    order.state === "Awaiting Payment",
    "Order cannot accept payment",
    409,
  );
  requireThat(
    order.lines.length === 1 && order.lines[0]!.productId === "pan-de-muerto",
    "Invalid checkout product",
    409,
  );
  const quantity = order.lines[0]!.quantity;
  const quote = quoteWebCheckout(service, {
    productId: "pan-de-muerto",
    quantity,
    zoneId: order.manualZoneId,
  });
  requireThat(
    quote.eligible &&
      quote.totalFils === payment.amountFils &&
      payment.currency === "AED",
    "Order changed; contact 3L before paying",
    409,
  );
  const product = s.catalog!.find((p) => p.id === "pan-de-muerto")!;
  const customer = s.conversations.find((c) => c.id === order.conversationId)!;
  service.store.write((state) => {
    const current = state.payments.find((p) => p.id === payment.id)!;
    requireThat(
      current.directAttempt === "ready",
      "Payment already submitted",
      409,
    );
    current.directAttempt = "submitted";
    current.timeline.push({
      at: new Date().toISOString(),
      actor: WEB_ACTOR.id,
      action: "Direct payment submitted",
    });
  });
  try {
    const names = customer.customer.trim().split(/\s+/);
    const result = await provider.createTokenPayment({
      token: input.token,
      paymentId: payment.id,
      orderId: order.id,
      amountFils: payment.amountFils,
      quantity,
      unitPriceFils: product.priceFils,
      feeFils: quote.feeFils!,
      customer: {
        firstName: names[0]!,
        lastName: names.slice(1).join(" ") || names[0]!,
        email: input.email,
        phone: customer.phone,
      },
      returnUrl: new URL("/checkout/return", origin).href,
    });
    requireThat(
      result.checkout.requestId === payment.id &&
        result.checkout.orderId === order.id &&
        result.checkout.amountFils === payment.amountFils,
      "Provider result mismatch",
      409,
    );
    service.store.transaction(() => {
      service.store.write((state) => {
        const p = state.payments.find((p) => p.id === payment.id)!;
        p.transactionId = result.id;
        p.providerReference = result.checkout.checkoutId;
        p.providerCheckoutId = result.checkout.checkoutId;
        p.directAttempt = "resolved";
        p.url = result.redirectUrl;
      });
      service.applyCheckout(payment.id, result.checkout, WEB_ACTOR.id);
    });
    return readWebCheckoutStatus(service, input.key);
  } catch (error) {
    service.store.write((state) => {
      const p = state.payments.find((p) => p.id === payment.id)!;
      if (p.directAttempt === "submitted") p.directAttempt = "unknown";
      const category =
        error instanceof ProviderFailure
          ? `Provider ${error.certainty}${error.httpStatus ? ` HTTP ${error.httpStatus}` : ""}`
          : "Provider response could not be verified";
      p.timeline.push({
        at: new Date().toISOString(),
        actor: WEB_ACTOR.id,
        action: `${category}; payment held for reconciliation`,
      });
    });
    // No blind retry: an interrupted request could have charged successfully.
    throw new Error(
      "Payment result could not be confirmed. Check this order before trying another payment.",
    );
  }
}
export async function reconcileEmbeddedPayment(
  service: CommerceService,
  key: string,
) {
  const { payment } = owned(service, key);
  requireThat(
    service.payment instanceof PaymenntProvider,
    "Direct payment unavailable",
    503,
  );
  if (!payment.directAttempt) {
    await service.reconcile(payment.id, WEB_ACTOR);
  } else if (payment.transactionId) {
    const result = await service.payment.getPayment(payment.transactionId);
    service.applyCheckout(payment.id, result.checkout, WEB_ACTOR.id);
  } else if (
    payment.directAttempt === "unknown" ||
    payment.directAttempt === "submitted"
  ) {
    const checkout = await service.payment.findCheckout(payment.id);
    if (checkout) {
      requireThat(
        checkout.requestId === payment.id &&
          checkout.orderId === payment.orderId &&
          checkout.amountFils === payment.amountFils &&
          checkout.currency === payment.currency,
        "Recovered checkout mismatch",
        409,
      );
      service.store.transaction(() => {
        service.store.write((state) => {
          const p = state.payments.find((p) => p.id === payment.id)!;
          p.providerReference = checkout.checkoutId;
          p.providerCheckoutId = checkout.checkoutId;
          p.directAttempt = "resolved";
        });
        service.applyCheckout(payment.id, checkout, WEB_ACTOR.id);
      });
    }
  } else if (payment.providerReference)
    await service.reconcile(payment.id, WEB_ACTOR);
  return readWebCheckoutStatus(service, key);
}

/** Explicit retry only after an authoritative terminal failure; keep the same order. */
export async function retryEmbeddedPayment(
  service: CommerceService,
  key: string,
) {
  await reconcileEmbeddedPayment(service, key);
  const { order, payment } = owned(service, key);
  requireThat(
    payment.directAttempt &&
      ["failed", "cancelled", "expired"].includes(payment.status),
    "Existing payment is not confirmed failed",
    409,
  );
  service.store.transaction(() => {
    let current = service.store.read().orders.find((o) => o.id === order.id)!;
    if (current.state === "Building")
      current = service.command(
        {
          type: "manualZone",
          id: current.id,
          version: current.version,
          zoneId: current.manualZoneId,
          reason: "Customer explicitly retries a verified failed payment",
        },
        `retry-zone-${payment.id}`,
        WEB_ACTOR,
      ) as typeof current;
    service.command(
      { type: "requestPayment", id: current.id, version: current.version },
      `retry-${payment.id}`,
      WEB_ACTOR,
    );
    service.store.write((s) => {
      const o = s.orders.find((o) => o.id === order.id)!;
      const p = s.payments.find((p) => p.id === o.paymentId)!;
      p.directAttempt = "ready";
      s.jobs = s.jobs.filter(
        (j) => !(j.kind === "payment" && j.entityId === p.id),
      );
    });
  });
  return readWebCheckoutStatus(service, key);
}
