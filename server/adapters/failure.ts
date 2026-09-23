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
  ) {
    super(
      certainty === "rejected"
        ? "Provider rejected request"
        : "Provider result uncertain",
    );
  }
}
