import {
  planSchema,
  toolSchemas,
  type AgentGateway,
  type AgentConfig,
  type AgentModelProvider,
  type AgentRun,
  type ToolCall,
  type Enquiry,
} from "./model";
import { AgentPolicy, injectionAttempt, protectedIntent } from "./policy";
import { groundedReply } from "./replies";
export class AgentOrchestrator {
  private policy = new AgentPolicy();
  constructor(
    readonly gateway: AgentGateway,
    readonly config: AgentConfig,
    private provider?: AgentModelProvider,
  ) {}
  async process(id: string, manual = false): Promise<AgentRun | null> {
    if (!this.config.enabled || !this.provider || !this.config.configured)
      return null;
    const snapshot = this.gateway.snapshot(id);
    const run = this.gateway.claim(
      snapshot,
      manual,
      this.config,
      this.provider,
    );
    if (!run) return null;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const output = await Promise.race([
        this.provider.infer(snapshot.context, controller.signal),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error("AI_TIMEOUT"));
          }, this.config.timeoutMs);
        }),
      ]);
      const plan = planSchema.parse(output.plan);
      plan.intent = protectedIntent(snapshot.inboundText) ?? plan.intent;
      plan.tools = plan.tools.map((call) => ({
        ...call,
        arguments: JSON.stringify(
          toolSchemas[call.name].parse(JSON.parse(call.arguments)),
        ),
      }));
      run.intent = plan.intent;
      run.confidence = plan.confidence;
      run.language = plan.language;
      const calls = [...plan.tools];
      const ensure = (call: ToolCall) => {
        if (!calls.some((c) => c.name === call.name)) calls.push(call);
      };
      if (
        ["product_inquiry", "availability", "order_intent"].includes(
          plan.intent,
        ) &&
        !calls.some(
          (c) => c.name === "search_catalog" || c.name === "get_product",
        )
      )
        ensure({
          name: "search_catalog",
          arguments: JSON.stringify({
            query:
              snapshot.context.catalog[0]?.name ??
              snapshot.inboundText.slice(0, 150),
          }),
        });
      if (plan.reply === "faq") {
        if (!plan.faqKey) throw new Error("POLICY_VIOLATION");
        ensure({
          name: "get_business_faq",
          arguments: JSON.stringify({ key: plan.faqKey }),
        });
      }
      if (plan.reply === "payment_status")
        ensure({ name: "get_payment_status", arguments: "{}" });
      if (
        snapshot.context.hasLocation &&
        snapshot.context.currentOrder &&
        plan.intent === "delivery_location"
      )
        ensure({ name: "check_order_eligibility", arguments: "{}" });
      if (
        calls.length > this.config.maxTools ||
        new Set(calls.map((c) => c.name + c.arguments)).size !== calls.length
      )
        throw new Error("TOOL_LOOP_LIMIT");
      if (!injectionAttempt(snapshot.inboundText))
        for (const call of calls) {
          const result = await this.gateway.tool(snapshot, call, plan.language);
          run.tools.push(result);
          if (result.action) run.actions.push(result.action);
          if (
            [
              "ERROR",
              "DATA_NOT_AVAILABLE",
              "NOT_FOUND",
              "BLOCKED",
              "HANDOFF",
            ].includes(result.code)
          )
            break;
        }
      run.handoffReason = this.policy.reason(plan, snapshot, run.tools);
      if (
        /screenshot|captura|proof of payment|comprobante|ya pagu[eé]/i.test(
          snapshot.inboundText,
        )
      )
        run.handoffReason = "PAYMENT_PROOF_REQUIRES_RECONCILIATION";
      if (run.handoffReason) run.actions = [];
      const inWindow =
        Date.now() - Date.parse(snapshot.inboundAt) < 86400000 &&
        Date.parse(snapshot.inboundAt) <= Date.now();
      let auto =
        !manual &&
        !run.actions.length &&
        this.policy.mayAutoSend(plan, snapshot, this.config, run.handoffReason);
      if (auto && !inWindow) {
        auto = false;
        run.handoffReason = "SERVICE_WINDOW_BLOCKED";
      }
      run.suggestion = groundedReply(plan, run.tools, run.handoffReason);
      run.disposition = run.handoffReason
        ? "HUMAN_REQUIRED"
        : auto
          ? "AUTOMATED_LOW_RISK"
          : "APPROVAL_REQUIRED";
      run.latencyMs = Date.now() - Date.parse(run.at);
      run.usage = output.usage
        ? {
            inputTokens: output.usage.inputTokens,
            outputTokens: output.usage.outputTokens,
            costUsd: output.usage.costUsd,
          }
        : undefined;
      run.summary = {
        intent: plan.intent,
        language: plan.language,
        messageCount: snapshot.messageCount,
        lastInboundId: snapshot.inboundId,
        openNeeds: run.handoffReason
          ? [run.handoffReason]
          : run.actions.map((a) => a.name),
      };
      let enquiry: Enquiry | undefined;
      if (plan.intent === "custom_cake") {
        const t = snapshot.inboundText;
        enquiry = {
          conversationId: id,
          inboundId: snapshot.inboundId,
          at: new Date().toISOString(),
          referenceNotes: t.slice(0, 1000),
          requiresQuote: true,
          theme: t.match(/(?:theme|tema)\s*:\s*([^;\n]{1,200})/i)?.[1],
          preferences: t.match(
            /(?:preferences|preferencias|flavou?r|sabor)\s*:\s*([^;\n]{1,200})/i,
          )?.[1],
          specialRequirements: t.match(
            /(?:requirements|requisitos|restricciones)\s*:\s*([^;\n]{1,200})/i,
          )?.[1],
          occasion: t.match(/wedding|birthday|boda|cumpleaños/i)?.[0],
          desiredDate: t.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0],
          servings: t.match(
            /\b(\d{1,4})\s*(?:people|guests|servings|personas|porciones)/i,
          )
            ? Number(
                t.match(
                  /\b(\d{1,4})\s*(?:people|guests|servings|personas|porciones)/i,
                )![1],
              )
            : undefined,
        };
      }
      return this.gateway.complete(run, snapshot, auto, enquiry);
    } catch (error) {
      const reason =
        error instanceof Error &&
        ["AI_TIMEOUT", "TOOL_LOOP_LIMIT", "POLICY_VIOLATION"].includes(
          error.message,
        )
          ? error.message
          : "PROVIDER_OR_SCHEMA_FAILURE";
      this.gateway.fail(run, reason);
      return null;
    } finally {
      if (timeout) clearTimeout(timeout);
      controller.abort();
    }
  }
  async tick() {
    if (!this.config.enabled || !this.config.configured) return;
    for (const id of this.gateway.candidates().slice(0, 100)) {
      try {
        await this.process(id);
      } catch {
        /* Durable errors are private and sanitized. */
      }
    }
  }
}
