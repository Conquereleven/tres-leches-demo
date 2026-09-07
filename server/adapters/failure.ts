export class ProviderFailure extends Error {
  constructor(
    public readonly certainty: "rejected" | "unknown",
    public readonly retryable: boolean,
  ) {
    super(
      certainty === "rejected"
        ? "Provider rejected request"
        : "Provider result uncertain",
    );
  }
}
