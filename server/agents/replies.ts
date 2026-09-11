import type { AgentPlan, ToolResult } from "./model";
const phrases = {
  en: {
    greeting: "Hi! Welcome to 3L. How can I help you today?",
    confirmation:
      "I’ll need our team to confirm that information. I can help collect your request in the meantime.",
    location:
      "Could you share your delivery location on WhatsApp so we can check the delivery rules?",
    selection: "Which product and quantity would you like?",
    custom:
      "Our team will prepare a personal quote. Please share the occasion, date, servings, theme, preferences and any special requirements or reference notes.",
    handoff: "I’ll ask our team to help with your request.",
    summary: "Your order details are ready for the team to review.",
    payment: "Payment status confirmed by our system: ",
  },
  es: {
    greeting: "¡Hola! Te damos la bienvenida a 3L. ¿En qué podemos ayudarte?",
    confirmation:
      "Nuestro equipo necesita confirmar esa información. Mientras tanto, puedo ayudarte a recopilar tu solicitud.",
    location:
      "¿Puedes compartir tu ubicación de entrega por WhatsApp para revisar las condiciones?",
    selection: "¿Qué producto y cantidad te gustaría pedir?",
    custom:
      "Nuestro equipo preparará una cotización personalizada. Compártenos la ocasión, fecha, porciones, temática, preferencias y cualquier requisito especial o referencia.",
    handoff: "Le pediré a nuestro equipo que te ayude con tu solicitud.",
    summary:
      "Los detalles de tu pedido están listos para que el equipo los revise.",
    payment: "Estado de pago confirmado por nuestro sistema: ",
  },
};
export function groundedReply(
  plan: AgentPlan,
  results: ToolResult[],
  reason?: string,
) {
  const p = phrases[plan.language];
  if (plan.intent === "custom_cake") return p.custom;
  if (reason)
    return reason === "DATA_NOT_AVAILABLE" ? p.confirmation : p.handoff;
  switch (plan.reply) {
    case "greeting":
      return p.greeting;
    case "ask_location":
      return p.location;
    case "ask_selection":
      return p.selection;
    case "products": {
      const products = [
        ...new Map(
          results.flatMap((r) => r.products ?? []).map((p) => [p.id, p]),
        ).values(),
      ].slice(0, 5);
      return products.length
        ? products
            .map((p) => `${p.name} · AED ${(p.priceFils / 100).toFixed(2)}`)
            .join("\n") +
            "\n" +
            p.selection
        : p.confirmation;
    }
    case "faq":
      return (
        results.find((r) => r.name === "get_business_faq" && r.code === "OK")
          ?.faq ?? p.confirmation
      );
    case "payment_status":
      return results.find((r) => r.name === "get_payment_status")?.paymentStatus
        ? p.payment +
            results.find((r) => r.name === "get_payment_status")!.paymentStatus
        : p.confirmation;
    case "order_summary": {
      const q = results.find((r) => r.quote?.eligible)?.quote;
      return q?.totalFils != null
        ? `${p.summary}\n${q.zoneName} · AED ${(q.totalFils / 100).toFixed(2)}`
        : p.confirmation;
    }
    case "custom_details":
      return p.custom;
    case "handoff":
      return p.handoff;
    default:
      return p.confirmation;
  }
}
