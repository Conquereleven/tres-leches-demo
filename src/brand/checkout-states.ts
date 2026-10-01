/**
 * Customer-facing payment states. Presentation only: every state is derived
 * from the server's reconciled checkout status (or the server's own sanitised
 * error message), never from the URL or from what the browser assumes.
 */

export type CustomerPaymentState =
  | "READY"
  | "PROCESSING"
  | "PAID"
  | "DECLINED"
  | "FAILED"
  | "HELD_FOR_REVIEW"
  | "3DS_REDIRECT"
  | "HOSTED_REDIRECT";

/** Order states that follow an authoritative, reconciled payment. */
export const PAID_STATES = [
  "Confirmed",
  "Production",
  "Ready",
  "Out for Delivery",
  "Delivered",
];

export type StatusLike = {
  status: string;
  paymentStatus: string;
  paymentFlow?: "web";
  url?: string | null;
  actionRequired?: "review_payment" | "complete_payment" | null;
};

export function paymentStateOf(s: StatusLike): CustomerPaymentState {
  if (s.paymentStatus === "paid" && PAID_STATES.includes(s.status))
    return "PAID";
  if (s.actionRequired === "review_payment") return "HELD_FOR_REVIEW";
  if (s.paymentStatus === "failed") return "DECLINED";
  if (["cancelled", "expired"].includes(s.paymentStatus)) return "FAILED";
  if (s.paymentStatus === "pending" && s.url)
    return s.paymentFlow === "web" ? "HOSTED_REDIRECT" : "3DS_REDIRECT";
  if (s.actionRequired === "complete_payment") return "READY";
  return "PROCESSING";
}

/**
 * The server already replaces provider errors with customer wording; this
 * only decides which visual state that wording belongs to.
 */
export function paymentStateOfError(
  message: string,
): CustomerPaymentState | null {
  if (/held for review|could not be verified/i.test(message))
    return "HELD_FOR_REVIEW";
  if (/could not be processed/i.test(message)) return "DECLINED";
  return null;
}

export const FAILURE_COPY = {
  title: "Payment wasn't completed",
  message:
    "Your card has not been confirmed as charged. Please review the message below before trying again.",
};
export const HELD_COPY = {
  title: "We're confirming your payment",
  message:
    "Your order is saved while we verify the payment. Please don't pay again.",
};

export function stateCopy(
  state: CustomerPaymentState,
  paymentStatus?: string,
): { title: string; message: string; detail?: string } {
  switch (state) {
    case "PAID":
      return {
        title: "Your order is confirmed",
        message: "We've received your order and payment.",
      };
    case "HELD_FOR_REVIEW":
      return {
        ...HELD_COPY,
        detail:
          "Our team will confirm it with you. If you need help, contact us with your order number.",
      };
    case "DECLINED":
      return {
        ...FAILURE_COPY,
        detail:
          "The payment was declined or couldn't be processed. Check your card details, or try a different card.",
      };
    case "FAILED":
      return {
        ...FAILURE_COPY,
        detail:
          paymentStatus === "expired"
            ? "The payment session expired before it was completed."
            : "The payment was cancelled before it was completed.",
      };
    case "HOSTED_REDIRECT":
      return {
        title: "Complete your payment",
        message:
          "Payment has not been confirmed yet. Continue on Paymennt’s secure payment page, then return to check your order.",
      };
    case "3DS_REDIRECT":
      return {
        title: "Verify with your bank",
        message:
          "Your bank asked to approve this payment on its secure page. Please don't close this window.",
      };
    case "READY":
      return {
        title: "Complete your payment",
        message:
          "Your order is saved and your card hasn't been charged yet. Return to checkout to finish paying.",
      };
    default:
      return {
        title: "Confirming your payment…",
        message: "This only takes a moment. Please keep this page open.",
      };
  }
}

/** "Maria José Pérez" → "Maria". */
export const firstName = (name?: string) => name?.trim().split(/\s+/)[0] ?? "";

export const FULFILMENT_STEPS = [
  "Confirmed",
  "Preparing",
  "Out for delivery",
  "Delivered",
] as const;
/** Index of the customer-facing fulfilment step for an order state. */
export function fulfilmentStep(orderState: string) {
  if (orderState === "Delivered") return 3;
  if (orderState === "Out for Delivery") return 2;
  if (["Production", "Ready"].includes(orderState)) return 1;
  return 0;
}
