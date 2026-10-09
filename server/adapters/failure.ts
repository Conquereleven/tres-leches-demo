export class ProviderFailure extends Error {
  constructor(
    public readonly certainty: "rejected" | "unknown",
    public readonly retryable: boolean,
    public readonly code?:
      | "OUTBOUND_DISABLED"
      | "NOT_CONFIGURED"
      | "PAYMENT_TEMPLATE_REQUIRED"
      | "ORIGIN_NOT_CONFIGURED",
    public readonly httpStatus?: number,
    public readonly diagnostic?: {
      classification:
        | "PROVIDER_HTTP_ERROR"
        | "PROVIDER_PAYMENT_REJECTED"
        | "PROVIDER_TIMEOUT"
        | "PROVIDER_NETWORK_ERROR"
        | "PROVIDER_MALFORMED_RESPONSE";
      endpointClass: "payment/debit" | "payment/get" | "other";
      safeProviderCode?: string;
      safeProviderMessage?: string;
      providerPaymentId?: string;
      providerStatus?: string;
      redirectUrlPresent: boolean;
      latencyMs: number;
    },
  ) {
    super(
      certainty === "rejected"
        ? "Provider rejected request"
        : "Provider result uncertain",
    );
  }
}
