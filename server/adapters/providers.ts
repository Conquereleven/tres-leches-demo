import type { AuthoritativeCheckout } from "../domain/checkout";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Payment, Conversation } from "../domain/model";
export interface WebhookVerifier {
  verify(raw: string, signature: string): boolean;
}
export class HmacVerifier implements WebhookVerifier {
  constructor(private secret: string) {
    if (secret.length < 24)
      throw new Error("Webhook secret must be at least 24 characters");
  }
  sign(raw: string) {
    return (
      "sha256=" + createHmac("sha256", this.secret).update(raw).digest("hex")
    );
  }
  verify(raw: string, signature: string) {
    const expected = Buffer.from(this.sign(raw)),
      received = Buffer.from(signature);
    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  }
}
export interface WhatsAppProvider {
  readonly idempotentSend: boolean;
  send(input: {
    sourceNumberId: string;
    sourcePhoneNumber: string;
    recipient: string;
    text: string;
    lastInboundAt?: string;
    paymentContext?: { amountAed: string; url: string };
    template?: { name: string; language: string; parameters: string[] };
    idempotencyKey: string;
  }): Promise<{ providerId: string; status: "sent" }>;
}
export interface PaymentProvider {
  readonly name?: "mock" | "paymennt";
  findCheckout?(requestId: string): Promise<AuthoritativeCheckout | null>;
  readonly idempotentCreate: boolean;
  readonly capabilities: { cancel: boolean; resend: boolean };
  createPaymentLink(input: {
    paymentId: string;
    orderId: string;
    amountFils: number;
    currency: "AED";
    idempotencyKey: string;
  }): Promise<{
    reference: string;
    url: string;
    provider?: "mock" | "paymennt";
    checkoutId?: string;
  }>;
  getCheckout?(reference: string): Promise<AuthoritativeCheckout>;
  getStatus(reference: string): Promise<Payment["status"]>;
  verifier: WebhookVerifier;
  cancel?(reference: string): Promise<void>;
}
export const sourceOf = (c: Conversation) => ({
  sourceNumberId: c.sourceNumberId,
  sourcePhoneNumber: c.sourcePhoneNumber,
  recipient: c.phone,
});
