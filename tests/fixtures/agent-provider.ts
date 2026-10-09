import type {
  AgentContext,
  AgentModelProvider,
  AgentPlan,
} from "../../server/agents/model";
export const agentPlan = (patch: Partial<AgentPlan> = {}): AgentPlan => ({
  intent: "greeting",
  confidence: 0.99,
  language: "en",
  tools: [],
  reply: "greeting",
  faqKey: null,
  ...patch,
});
export class MockAgentProvider implements AgentModelProvider {
  readonly name = "mock-agent";
  readonly model = "test-only";
  calls = 0;
  constructor(
    private result:
      | unknown
      | ((
          context: AgentContext,
          signal: AbortSignal,
        ) => unknown | Promise<unknown>) = agentPlan(),
  ) {}
  async infer(context: AgentContext, signal: AbortSignal) {
    this.calls++;
    return {
      plan:
        typeof this.result === "function"
          ? await this.result(context, signal)
          : this.result,
      usage: { inputTokens: 10, outputTokens: 20 },
    };
  }
}

export function orderingFixtureProvider(productId: string) {
  return new MockAgentProvider((context: AgentContext) => {
    const last =
      context.recentMessages.filter((m) => m.direction === "in").at(-1)?.text ??
      "";
    if (/wedding|boda|custom/i.test(last))
      return agentPlan({ intent: "custom_cake", reply: "custom_details" });
    if (context.hasLocation && context.currentOrder)
      return agentPlan({
        intent: "delivery_location",
        reply: "order_summary",
        tools: [
          { name: "resolve_delivery_zone", arguments: "{}" },
          { name: "check_order_eligibility", arguments: "{}" },
          { name: "prepare_payment_request", arguments: "{}" },
        ],
      });
    if (/order|quiero|tres leches/i.test(last))
      return agentPlan({
        intent: "order_intent",
        reply: "products",
        tools: [
          { name: "get_product", arguments: JSON.stringify({ productId }) },
          ...(!context.currentOrder
            ? [
                { name: "create_draft_order" as const, arguments: "{}" },
                {
                  name: "add_order_item" as const,
                  arguments: JSON.stringify({ productId, quantity: 1 }),
                },
              ]
            : []),
        ],
      });
    return agentPlan();
  });
}
