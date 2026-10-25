import type { CustomerNotification } from "../../server/domain/model";
/** Provider acceptance is not evidence of delivery to the customer's inbox. */
export function paidEmailLabel(n: CustomerNotification): string {
  if (n.deliveryOutcome === "unknown") return "Email outcome unknown — review";
  if (n.status === "sent" && n.providerMessageId)
    return "Email provider accepted — delivery unverified";
  if (n.status === "sent") return "Email outcome unknown — review";
  if (n.status === "failed")
    return n.lastError?.startsWith("Expired")
      ? "No enviado · caducó"
      : "Confirmation failed — review";
  if (n.status === "sending") return "Sending confirmation";
  return "Confirmation queued";
}
