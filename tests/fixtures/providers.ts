import type {
  WhatsAppProvider,
  PaymentProvider,
  WebhookVerifier,
} from "../../server/adapters/providers";
import type { Payment } from "../../server/domain/model";
export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly idempotentSend = true;
  async send(input: Parameters<WhatsAppProvider["send"]>[0]) {
    return {
      providerId: `mock-wa-${input.idempotencyKey}`,
      status: "sent" as const,
    };
  }
}
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;
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
