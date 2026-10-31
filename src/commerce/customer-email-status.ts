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
/** Email flow V2 window email: queued until its window starts, then sent or explained. */
export function windowEmailLabel(n: CustomerNotification): string {
  if (n.deliveryOutcome === "unknown") return "Email outcome unknown — review";
  if (n.status === "sent" && n.providerMessageId)
    return "Email provider accepted — delivery unverified";
  if (n.status === "sent") return "Email outcome unknown — review";
  if (n.status === "sending") return "Enviando";
  if (n.status === "failed") {
    const e = n.lastError ?? "";
    if (e.startsWith("Late")) return "No enviado · fuera de tiempo";
    if (e.startsWith("Invalid or missing schedule"))
      return "No programado · horario inválido";
    if (e.startsWith("Expired")) return "No enviado · caducó";
    if (/^(Order|Payment|Schedule|Customer email)/.test(e))
      return "No enviado · pedido no elegible";
    return "Falló · revisar";
  }
  return "Programado para el inicio de la ventana";
}
