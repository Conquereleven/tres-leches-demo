import type { PaymentProvider, WhatsAppProvider } from "./providers";
import { ProviderFailure } from "./failure";
import { PaymenntNotificationVerifier } from "./paymennt-notification";
/** No network call and no fake success. TL-18 forbids external WhatsApp sends. */
export class DisabledWhatsAppProvider implements WhatsAppProvider {
  readonly idempotentSend = false;
  async send(): ReturnType<WhatsAppProvider["send"]> {
    throw new ProviderFailure("rejected", false, "OUTBOUND_DISABLED");
  }
}
export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = "paymennt";
  readonly idempotentCreate = false;
  readonly capabilities = { cancel: false, resend: false };
  readonly verifier = new PaymenntNotificationVerifier();
  async createPaymentLink(): ReturnType<PaymentProvider["createPaymentLink"]> {
    throw new ProviderFailure("rejected", false, "NOT_CONFIGURED");
  }
  async getStatus(): ReturnType<PaymentProvider["getStatus"]> {
    throw new ProviderFailure("rejected", false, "NOT_CONFIGURED");
  }
}
