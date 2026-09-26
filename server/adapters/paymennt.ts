import { webhookSecretSchema } from "./paymennt-secrets";
import { PaymenntNotificationVerifier } from "./paymennt-notification";
import type { AuthoritativeCheckout } from "../domain/checkout";
import { ProviderFailure } from "./failure";
import { z } from "zod";
import type { PaymentProvider, WebhookVerifier } from "./providers";
import type { Payment } from "../domain/model";

// Official contract: https://docs.paymennt.com/openapi/paymennt.yaml
const checkoutSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  orderId: z.string().min(1),
  amount: z.number().finite().positive(),
  currency: z.string(),
  status: z.string(),
  redirectUrl: z.string().url().optional(),
  timestamp: z.string().optional(),
});
const statusMap: Record<string, Payment["status"]> = {
  PENDING: "pending",
  AUTHORIZED: "authorized",
  PAID: "paid",
  FAILED: "failed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  REFUNDED: "refunded",
  PARTIALLY_REFUNDED: "partially_refunded",
  PENDING_CONFIRMATION: "pending_confirmation",
  CHARGEBACK: "chargeback",
};
export function normalizeCheckout(value: unknown): AuthoritativeCheckout {
  const c = checkoutSchema.parse(value);
  const status = statusMap[c.status.toUpperCase().replaceAll(" ", "_")];
  if (
    !status ||
    Math.abs(c.amount * 100 - Math.round(c.amount * 100)) > 1e-6 ||
    !Number.isSafeInteger(Math.round(c.amount * 100))
  )
    throw new ProviderFailure("unknown", false);
  if (c.redirectUrl && new URL(c.redirectUrl).protocol !== "https:")
    throw new ProviderFailure("unknown", false);
  return {
    checkoutId: c.id,
    requestId: c.requestId,
    orderId: c.orderId,
    amountFils: Math.round(c.amount * 100),
    currency: c.currency,
    status,
    rawStatus: c.status,
    url: c.redirectUrl,
  };
}

type EndpointClass = "payment/debit" | "payment/get" | "other";
const endpointClass = (path: string): EndpointClass =>
  path === "/payment/debit"
    ? "payment/debit"
    : path.startsWith("/payment/")
      ? "payment/get"
      : "other";
const safeProviderText = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
    .replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._~+\/-]+=*\b/gi, "[redacted]")
    .replace(/\b(?:ptk|pk|sk)_[A-Za-z0-9_-]+\b/gi, "[redacted]")
    .replace(/\b\+?\d[\d -]{7,18}\d\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 200) : undefined;
};
const safeErrorFields = (value: unknown) => {
  const object =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    safeProviderCode: safeProviderText(object.code ?? object.errorCode),
    safeProviderMessage: safeProviderText(object.error ?? object.message),
    providerPaymentId: safeProviderText(
      (object.result as Record<string, unknown> | undefined)?.id,
    ),
    providerStatus: safeProviderText(
      (object.result as Record<string, unknown> | undefined)?.status,
    ),
    redirectUrlPresent: Boolean(
      (object.result as Record<string, unknown> | undefined)?.redirectUrl,
    ),
  };
};
export class PaymenntProvider implements PaymentProvider {
  readonly idempotentCreate = false; // A unique requestId is NOT a documented idempotent POST guarantee.
  readonly capabilities = { cancel: false, resend: true };
  readonly name = "paymennt";
  readonly verifier: WebhookVerifier;
  private base: string;
  constructor(
    private config: {
      apiKey: string;
      apiSecret: string;
      environment: "test" | "live";
    },
    private fetcher: typeof fetch = fetch,
    verifier?: WebhookVerifier,
  ) {
    if (config.environment !== "test")
      throw new Error("Live Paymennt disabled pending approved release");
    if (!config.apiKey || !config.apiSecret)
      throw new Error("Paymennt credentials required");
    this.base =
      config.environment === "test"
        ? "https://api.test.paymennt.com/mer/v2.0"
        : "https://api.paymennt.com/mer/v2.0";
    // TL-25 Support contract implemented; a missing registered key still fails closed.
    this.verifier = verifier ?? new PaymenntNotificationVerifier();
  }
  private async performRequest(path: string, body?: unknown) {
    const started = performance.now();
    const endpoint = endpointClass(path);
    let response: Response;
    try {
      response = await this.fetcher(this.base + path, {
        method: body ? "POST" : "GET",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: {
          "Content-Type": "application/json",
          "X-Paymennt-Api-Key": this.config.apiKey,
          "X-Paymennt-Api-Secret": this.config.apiSecret,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      const timeout =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      throw new ProviderFailure("unknown", !body, undefined, undefined, {
        classification: timeout ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_ERROR",
        endpointClass: endpoint,
        redirectUrlPresent: false,
        latencyMs: Math.round(performance.now() - started),
      });
    }
    const latencyMs = Math.round(performance.now() - started);
    let decoded: unknown;
    try {
      decoded = JSON.parse(await response.text());
    } catch {
      if (!response.ok)
        throw new ProviderFailure(
          response.status >= 500 ? "unknown" : "rejected",
          response.status === 429 || response.status >= 500,
          undefined,
          response.status,
          {
            classification: "PROVIDER_HTTP_ERROR",
            endpointClass: endpoint,
            redirectUrlPresent: false,
            latencyMs,
          },
        );
      throw new ProviderFailure("unknown", !body, undefined, response.status, {
        classification: "PROVIDER_MALFORMED_RESPONSE",
        endpointClass: endpoint,
        redirectUrlPresent: false,
        latencyMs,
      });
    }
    const safe = safeErrorFields(decoded);
    if (!response.ok)
      throw new ProviderFailure(
        response.status >= 500 ? "unknown" : "rejected",
        response.status === 429 || response.status >= 500,
        undefined,
        response.status,
        {
          classification: "PROVIDER_HTTP_ERROR",
          endpointClass: endpoint,
          ...safe,
          latencyMs,
        },
      );
    const wrapper = z
      .object({
        success: z.boolean(),
        result: z.unknown().optional(),
        error: z.unknown().optional(),
        message: z.unknown().optional(),
        code: z.unknown().optional(),
      })
      .safeParse(decoded);
    if (!wrapper.success)
      throw new ProviderFailure("unknown", !body, undefined, response.status, {
        classification: "PROVIDER_MALFORMED_RESPONSE",
        endpointClass: endpoint,
        ...safe,
        latencyMs,
      });
    if (!wrapper.data.success)
      throw new ProviderFailure("rejected", false, undefined, response.status, {
        classification: "PROVIDER_PAYMENT_REJECTED",
        endpointClass: endpoint,
        ...safe,
        latencyMs,
      });
    if (wrapper.data.result === undefined)
      throw new ProviderFailure("unknown", !body, undefined, response.status, {
        classification: "PROVIDER_MALFORMED_RESPONSE",
        endpointClass: endpoint,
        ...safe,
        latencyMs,
      });
    return {
      result: wrapper.data.result,
      httpStatus: response.status,
      latencyMs,
    };
  }
  private async request(path: string, body?: unknown) {
    return (await this.performRequest(path, body)).result;
  }
  async createPaymentLink(
    input: Parameters<PaymentProvider["createPaymentLink"]>[0],
  ) {
    const c = normalizeCheckout(
      await this.request("/checkout/link", {
        requestId: input.paymentId,
        orderId: input.orderId,
        description: `Tres Leches order ${input.orderId}`,
        amount: input.amountFils / 100,
        currency: input.currency,
        sendSms: false,
        sendEmail: false,
      }),
    );
    if (
      c.requestId !== input.paymentId ||
      c.orderId !== input.orderId ||
      c.amountFils !== input.amountFils ||
      c.currency !== input.currency ||
      !c.url
    )
      throw new ProviderFailure("unknown", false);
    return {
      reference: c.checkoutId,
      url: c.url,
      provider: "paymennt" as const,
      checkoutId: c.checkoutId,
    };
  }
  async getCheckout(reference: string): Promise<AuthoritativeCheckout> {
    const result = normalizeCheckout(
      await this.request(`/checkout/${encodeURIComponent(reference)}`),
    );
    if (result.checkoutId !== reference)
      throw new ProviderFailure("unknown", false);
    return result;
  }
  async findCheckout(requestId: string) {
    const page = z
      .object({ totalPages: z.number().int(), content: z.array(z.unknown()) })
      .parse(
        await this.request(
          `/checkout?requestId=${encodeURIComponent(requestId)}`,
        ),
      );
    if (page.totalPages > 1 || page.content.length > 1)
      throw new ProviderFailure("unknown", false);
    if (!page.content.length) return null;
    const found = normalizeCheckout(page.content[0]);
    if (found.requestId !== requestId)
      throw new ProviderFailure("unknown", false);
    return this.getCheckout(found.checkoutId);
  }
  async createTokenPayment(input: {
    token: string;
    paymentId: string;
    orderId: string;
    amountFils: number;
    items: {
      sku: string;
      name: string;
      quantity: number;
      unitPriceFils: number;
    }[];
    feeFils: number;
    customer: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    };
    returnUrl: string;
  }) {
    const response = await this.performRequest("/payment/debit", {
      source: { type: "TOKEN", token: input.token, storeCardDetails: false },
      checkoutDetails: {
        requestId: input.paymentId,
        orderId: input.orderId,
        amount: input.amountFils / 100,
        currency: "AED",
        returnUrl: input.returnUrl,
        customer: input.customer,
        items: input.items.map((i) => ({
          name: i.name,
          sku: i.sku,
          quantity: i.quantity,
          unitprice: i.unitPriceFils / 100,
          linetotal: (i.quantity * i.unitPriceFils) / 100,
        })),
        totals: {
          subtotal:
            input.items.reduce(
              (sum, i) => sum + i.quantity * i.unitPriceFils,
              0,
            ) / 100,
          tax: 0,
          shipping: input.feeFils / 100,
        },
      },
    });
    try {
      const payment = this.normalizePayment(response.result);
      return {
        ...payment,
        diagnostic: {
          classification: [
            "FAILED",
            "REJECTED",
            "VOIDED",
            "UNSUPPORTED",
          ].includes(payment.status)
            ? ("PROVIDER_PAYMENT_REJECTED" as const)
            : ("PROVIDER_RESPONSE_ACCEPTED" as const),
          endpointClass: "payment/debit" as const,
          providerHttpStatus: response.httpStatus,
          providerPaymentId: payment.id,
          providerStatus: payment.status,
          redirectUrlPresent: Boolean(payment.redirectUrl),
          latencyMs: response.latencyMs,
        },
      };
    } catch (error) {
      if (error instanceof ProviderFailure && error.diagnostic) throw error;
      const safe = safeErrorFields({ result: response.result });
      throw new ProviderFailure(
        "unknown",
        false,
        undefined,
        response.httpStatus,
        {
          classification: "PROVIDER_MALFORMED_RESPONSE",
          endpointClass: "payment/debit",
          ...safe,
          latencyMs: response.latencyMs,
        },
      );
    }
  }
  async getPayment(id: string) {
    const response = await this.performRequest(
      `/payment/${encodeURIComponent(id)}`,
    );
    let result;
    try {
      result = this.normalizePayment(response.result);
    } catch (error) {
      if (error instanceof ProviderFailure && error.diagnostic) throw error;
      const safe = safeErrorFields({ result: response.result });
      throw new ProviderFailure(
        "unknown",
        false,
        undefined,
        response.httpStatus,
        {
          classification: "PROVIDER_MALFORMED_RESPONSE",
          endpointClass: "payment/get",
          ...safe,
          latencyMs: response.latencyMs,
        },
      );
    }
    if (result.id !== id) throw new ProviderFailure("unknown", false);
    return {
      ...result,
      diagnostic: {
        classification: [
          "FAILED",
          "REJECTED",
          "VOIDED",
          "UNSUPPORTED",
        ].includes(result.status)
          ? ("PROVIDER_PAYMENT_REJECTED" as const)
          : ("PROVIDER_RESPONSE_ACCEPTED" as const),
        endpointClass: "payment/get" as const,
        providerHttpStatus: response.httpStatus,
        providerPaymentId: result.id,
        providerStatus: result.status,
        redirectUrlPresent: Boolean(result.redirectUrl),
        latencyMs: response.latencyMs,
      },
    };
  }
  private normalizePayment(value: unknown) {
    const parsed = z
      .object({
        id: z.string().min(1),
        amount: z.number().positive(),
        currency: z.literal("AED"),
        status: z.enum([
          "CAPTURED",
          "REDIRECT",
          "FAILED",
          "REJECTED",
          "VOIDED",
          "AUTHORIZED",
          "UNSUPPORTED",
          "REVERSED",
          "PARTIALLY_REVERSED",
          "CHARGEBACK",
        ]),
        redirectUrl: z.string().url().optional(),
        checkoutDetails: z.unknown(),
      })
      .parse(value);
    const checkout = normalizeCheckout(parsed.checkoutDetails);
    if (
      Math.round(parsed.amount * 100) !== checkout.amountFils ||
      parsed.currency !== checkout.currency
    )
      throw new ProviderFailure("unknown", false);
    if (parsed.status === "CAPTURED" && checkout.status !== "paid")
      throw new ProviderFailure("unknown", false);
    if (parsed.status === "REDIRECT") {
      const url = new URL(parsed.redirectUrl ?? "https://invalid.local");
      if (
        url.origin !== "https://pay.test.paymennt.com" ||
        !url.pathname.startsWith("/frames/redirect/payment/") ||
        url.username ||
        url.password
      )
        throw new ProviderFailure("unknown", false);
    }
    return {
      id: parsed.id,
      status: parsed.status,
      checkout,
      redirectUrl:
        parsed.status === "REDIRECT" ? parsed.redirectUrl : undefined,
    };
  }
  async registerWebhook(address: string) {
    const url = new URL(address);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("HTTPS webhook required");
    const result = webhookSecretSchema.parse(
      await this.request("/webhooks", { address }),
    );
    if (result.address !== address) throw new Error("Webhook address mismatch");
    return result;
  }
  async checkConnectivity() {
    // Official read-only search, deliberately requesting no customer/order data for diagnostics.
    z.object({
      totalPages: z.number().int(),
      content: z.array(z.unknown()),
    }).parse(
      await this.request("/checkout?requestId=TL18-DIAGNOSTIC-NO-CHECKOUT"),
    );
  }
  async getStatus(reference: string) {
    return (await this.getCheckout(reference)).status;
  }
}
