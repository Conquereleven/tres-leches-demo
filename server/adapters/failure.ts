export class ProviderFailure extends Error {
  constructor(
    public readonly certainty: "rejected" | "unknown",
    public readonly retryable: boolean,
    public readonly code?: "OUTBOUND_DISABLED" | "NOT_CONFIGURED",
  ) {
    super(
      certainty === "rejected"
        ? "Provider rejected request"
        : "Provider result uncertain",
    );
  }
}
