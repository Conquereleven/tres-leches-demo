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
    idempotencyKey: string;
  }): Promise<{ providerId: string; status: "sent" }>;
}
export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly idempotentSend = true;
  async send(input: Parameters<WhatsAppProvider["send"]>[0]) {
    return {
      providerId: `mock-wa-${input.idempotencyKey}`,
      status: "sent" as const,
    };
  }
}
export interface PaymentProvider {
  readonly idempotentCreate: boolean;
  readonly capabilities: { cancel: boolean; resend: boolean };
  createPaymentLink(input: {
    paymentId: string;
    orderId: string;
    amountFils: number;
    currency: "AED";
    idempotencyKey: string;
  }): Promise<{ reference: string; url: string }>;
  getStatus(reference: string): Promise<Payment["status"]>;
  verifier: WebhookVerifier;
  cancel?(reference: string): Promise<void>;
}
export class MockPaymentProvider implements PaymentProvider {
  readonly idempotentCreate = true;
  readonly capabilities = { cancel: false, resend: true };
  constructor(
    public verifier: WebhookVerifier,
    private statusLookup?: (reference: string) => Payment["status"] | undefined,
  ) {}
  private references = new Set<string>();
  async createPaymentLink(
    input: Parameters<PaymentProvider["createPaymentLink"]>[0],
  ) {
    this.references.add(`mock-pay-${input.paymentId}`);
    return {
      reference: `mock-pay-${input.paymentId}`,
      url: `https://payments.example.invalid/demo/${input.paymentId}`,
    };
  }
  async getStatus(reference: string): Promise<Payment["status"]> {
    const status = this.statusLookup?.(reference);
    if (status) return status;
    if (!this.references.has(reference))
      throw new Error("Unknown mock checkout");
    return "pending";
  }
}
export const sourceOf = (c: Conversation) => ({
  sourceNumberId: c.sourceNumberId,
  sourcePhoneNumber: c.sourcePhoneNumber,
  recipient: c.phone,
});
