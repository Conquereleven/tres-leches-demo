import { ProviderFailure } from "../adapters/failure";
/** Tokens are request-scoped only. A durable claim precedes the provider call. */
import { z } from "zod";
import { PaymenntProvider } from "../adapters/paymennt";
import { safeLog } from "../observability";
import type { CommerceService } from "./service";
import { orderBillingAddress, toPaymenntDeliveryAddress } from "./billing";
import { DomainError, requireThat, type Payment } from "./model";
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
type StoredDiagnostic = NonNullable<Payment["providerDiagnostics"]>[number];
function persistDiagnostic(
  service: CommerceService,
  paymentId: string,
  diagnostic: Omit<StoredDiagnostic, "orderId" | "requestId" | "at">,
) {
  service.store.write((state) => {
    const payment = state.payments.find((p) => p.id === paymentId)!;
    payment.providerDiagnostics ??= [];
    payment.providerDiagnostics.push({
      orderId: payment.orderId,
      requestId: payment.id,
      at: new Date().toISOString(),
      ...diagnostic,
    });
  });
  safeLog("payment.provider", {
    code: diagnostic.classification,
    status: diagnostic.providerHttpStatus,
    latencyMs: diagnostic.latencyMs,
  });
}
function failureResponse(error: ProviderFailure) {
  const classification = error.diagnostic?.classification;
  if (
    classification === "PROVIDER_HTTP_ERROR" &&
    error.httpStatus != null &&
    error.httpStatus < 500
  )
    return new DomainError(
      422,
      "Payment could not be processed. Please check your details or try again.",
      "PAYMENT_PROVIDER_REJECTED",
    );
  if (classification === "PROVIDER_PAYMENT_REJECTED")
    return new DomainError(
      422,
      "Payment could not be processed. Please check your details or try again.",
      "PAYMENT_PROVIDER_REJECTED",
    );
  if (classification === "PROVIDER_MALFORMED_RESPONSE")
    return new DomainError(
      502,
      "The payment result could not be verified. Your order is held for review.",
      "PAYMENT_PROVIDER_INVALID_RESPONSE",
    );
  return new DomainError(
    503,
    "The payment result could not be verified. Your order is held for review.",
    classification === "PROVIDER_TIMEOUT"
      ? "PAYMENT_PROVIDER_TIMEOUT"
      : "PAYMENT_PROVIDER_UNAVAILABLE",
  );
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
  requireThat(!payment.supersededAt, "Checkout superseded", 409);
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
    order.lines.length >= 1 && !!order.manualZoneId,
    "Invalid checkout",
    409,
  );
  // Re-price from the current catalog and zone rule: the charged amount must
  // still equal the payment created at checkout, or nothing is charged.
  const quote = quoteWebCheckout(service, {
    lines: order.lines,
    zoneId: order.manualZoneId,
  });
  requireThat(
    quote.eligible &&
      quote.totalFils === payment.amountFils &&
      payment.currency === "AED",
    "Order changed; contact 3L before paying",
    409,
  );
  const items = order.lines.map((l) => {
    const product = s.catalog!.find((p) => p.id === l.productId)!;
    return {
      sku: product.id,
      name: product.name,
      quantity: l.quantity,
      unitPriceFils: product.priceFils,
    };
  });
  const customer = s.conversations.find((c) => c.id === order.conversationId)!;
  // Both addresses are resolved and validated before the attempt is claimed:
  // an incomplete address fails here, with no provider call and nothing held.
  requireThat(
    order.delivery,
    "Please complete your delivery and billing details.",
    409,
  );
  const billingAddress = orderBillingAddress(order.billing);
  const deliveryAddress = toPaymenntDeliveryAddress(
    customer.customer,
    order.delivery,
  );
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
      items,
      feeFils: quote.feeFils!,
      customer: {
        firstName: names[0]!,
        lastName: names.slice(1).join(" ") || names[0]!,
        email: input.email,
        phone: customer.phone,
      },
      billingAddress,
      deliveryAddress,
      returnUrl: new URL("/checkout/return", origin).href,
    });
    if (
      result.checkout.requestId !== payment.id ||
      result.checkout.orderId !== order.id ||
      result.checkout.amountFils !== payment.amountFils
    )
      throw new ProviderFailure("unknown", false, undefined, undefined, {
        classification: "PROVIDER_MALFORMED_RESPONSE",
        endpointClass: "payment/debit",
        providerPaymentId: result.id,
        providerStatus: result.status,
        redirectUrlPresent: Boolean(result.redirectUrl),
        latencyMs: result.diagnostic.latencyMs,
      });
    service.store.transaction(() => {
      service.store.write((state) => {
        const p = state.payments.find((p) => p.id === payment.id)!;
        p.transactionId = result.id;
        p.providerReference = result.checkout.checkoutId;
        p.providerCheckoutId = result.checkout.checkoutId;
        p.directAttempt = "resolved";
        p.url = result.redirectUrl;
        p.providerDiagnostics ??= [];
        p.providerDiagnostics.push({
          orderId: order.id,
          requestId: payment.id,
          at: new Date().toISOString(),
          attemptState: "resolved",
          ...result.diagnostic,
        });
      });
      service.applyCheckout(payment.id, result.checkout, WEB_ACTOR.id);
    });
    safeLog("payment.provider", {
      code: result.diagnostic.classification,
      status: result.diagnostic.providerHttpStatus,
      latencyMs: result.diagnostic.latencyMs,
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
    if (error instanceof ProviderFailure) {
      const diagnostic = error.diagnostic ?? {
        classification: "PROVIDER_MALFORMED_RESPONSE" as const,
        endpointClass: "payment/debit" as const,
        redirectUrlPresent: false,
        latencyMs: 0,
      };
      persistDiagnostic(service, payment.id, {
        ...diagnostic,
        providerHttpStatus: error.httpStatus,
        attemptState: "unknown",
      });
      // No blind retry: even a rejected-looking response is held until it is auditable.
      throw failureResponse(error);
    }
    persistDiagnostic(service, payment.id, {
      classification: "PROVIDER_MALFORMED_RESPONSE",
      endpointClass: "payment/debit",
      redirectUrlPresent: false,
      latencyMs: 0,
      attemptState: "unknown",
    });
    throw new DomainError(
      502,
      "The payment result could not be verified. Your order is held for review.",
      "PAYMENT_PROVIDER_INVALID_RESPONSE",
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
    try {
      const result = await service.payment.getPayment(payment.transactionId);
      persistDiagnostic(service, payment.id, {
        ...result.diagnostic,
        attemptState: "resolved",
      });
      service.applyCheckout(payment.id, result.checkout, WEB_ACTOR.id);
    } catch (error) {
      if (!(error instanceof ProviderFailure)) throw error;
      const diagnostic = error.diagnostic ?? {
        classification: "PROVIDER_MALFORMED_RESPONSE" as const,
        endpointClass: "payment/get" as const,
        redirectUrlPresent: false,
        latencyMs: 0,
      };
      persistDiagnostic(service, payment.id, {
        ...diagnostic,
        providerHttpStatus: error.httpStatus,
        attemptState: "unknown",
      });
      throw failureResponse(error);
    }
  }
  // Direct payments without a persisted paymentId stay frozen. The documented
  // API has no payment search-by-requestId; hosted /checkout recovery is invalid here.
  return readWebCheckoutStatus(service, key);
}

/** Explicit retry only after an authoritative terminal failure; keep the same order. */
export async function retryEmbeddedPayment(
  service: CommerceService,
  key: string,
) {
  await reconcileEmbeddedPayment(service, key);
  const { order, payment } = owned(service, key);
  requireThat(!payment.supersededAt, "Checkout superseded", 409);
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
