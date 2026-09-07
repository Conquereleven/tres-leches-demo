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
    if (!config.apiKey || !config.apiSecret)
      throw new Error("Paymennt credentials required");
    this.base =
      config.environment === "test"
        ? "https://api.test.paymennt.com/mer/v2.0"
        : "https://api.paymennt.com/mer/v2.0";
    // Fail closed: OpenAPI exposes hmacKey but does not specify signed bytes/header/encoding.
    // Enable only after obtaining the merchant's verified webhook contract and test vector.
    this.verifier = verifier ?? { verify: () => false };
  }
  private async request(path: string, body?: unknown) {
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
    } catch {
      throw new ProviderFailure("unknown", !body);
    }
    if (!response.ok)
      throw new ProviderFailure(
        response.status >= 500 ? "unknown" : "rejected",
        response.status === 429 || response.status >= 500,
      );
    try {
      return z
        .object({ success: z.literal(true), result: z.unknown() })
        .parse(await response.json()).result;
    } catch {
      throw new ProviderFailure("unknown", !body);
    }
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
  async getStatus(reference: string) {
    return (await this.getCheckout(reference)).status;
  }
}
