import type {
  AgentPlan,
  ToolResult,
  ContextSnapshot,
  AgentConfig,
} from "./model";
export const sensitiveIntents = new Set([
  "complaint",
  "refund",
  "cancellation",
  "human_request",
  "custom_cake",
]);
export function injectionAttempt(text: string) {
  return /ignore (?:all |the |previous |your )*(?:instructions|rules)|ignora.{0,25}(?:instrucciones|reglas)|(?:mark|marca|marcar).{0,30}(?:paid|pagado)|(?:admin|administrator) access|acceso.{0,15}admin|(?:skip|bypass|omite|ignora).{0,25}(?:minimum|mínimo)|(?:change|override|cambia|cambiar).{0,25}(?:price|precio|amount|importe)|system prompt|api.?key|secret key/i.test(
    text,
  );
}
export class AgentPolicy {
  reason(plan: AgentPlan, snapshot: ContextSnapshot, results: ToolResult[]) {
    if (injectionAttempt(snapshot.inboundText)) return "POLICY_VIOLATION";
    if (plan.confidence < 0.75 || plan.intent === "unknown")
      return "LOW_CONFIDENCE";
    if (sensitiveIntents.has(plan.intent)) return plan.intent.toUpperCase();
    if (
      results.some(
        (r) => r.code === "DATA_NOT_AVAILABLE" || r.code === "NOT_FOUND",
      )
    )
      return "DATA_NOT_AVAILABLE";
    if (results.some((r) => r.code === "ERROR")) return "TOOL_FAILURE";
    if (results.some((r) => r.code === "BLOCKED"))
      return "BUSINESS_RULE_BLOCKED";
    if (results.some((r) => r.code === "HANDOFF")) return "HUMAN_REQUEST";
    if (
      ["refunded", "partially_refunded", "chargeback"].includes(
        snapshot.context.paymentStatus ?? "",
      )
    )
      return "PAYMENT_REVIEW";
    return undefined;
  }
  mayAutoSend(
    plan: AgentPlan,
    snapshot: ContextSnapshot,
    config: AgentConfig,
    reason?: string,
  ) {
    return (
      config.enabled &&
      !reason &&
      snapshot.session.state === "AI_ACTIVE" &&
      snapshot.session.mode !== "copilot" &&
      (snapshot.session.mode !== "autonomous_bounded" ||
        config.autonomousAllowed) &&
      ["greeting", "general_question", "delivery_location"].includes(
        plan.intent,
      ) &&
      ["greeting", "faq", "ask_location"].includes(plan.reply) &&
      plan.confidence >= 0.9
    );
  }
}

export function protectedIntent(text: string) {
  if (/\b(refund|reembolso|devolver dinero)\b/i.test(text))
    return "refund" as const;
  if (/\b(cancel|cancelar|cancela|cancellation)\b/i.test(text))
    return "cancellation" as const;
  if (
    /\b(human|person|persona|agente humano|hablar con alguien)\b/i.test(text) &&
    /talk|speak|need|want|hablar|quiero|necesito/i.test(text)
  )
    return "human_request" as const;
  if (
    /complaint|queja|very upset|damaged|arrived broken|lleg[oó] roto|angry/i.test(
      text,
    )
  )
    return "complaint" as const;
  if (
    /custom.{0,30}cake|wedding cake|pastel.{0,30}(?:personaliz|boda)|tarta.{0,30}boda/i.test(
      text,
    )
  )
    return "custom_cake" as const;
  return undefined;
}
