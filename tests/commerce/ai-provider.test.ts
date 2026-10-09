import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIAgentProvider } from "../../server/agents/provider";
import { agentPlan } from "../fixtures/agent-provider";
const context = {
  recentMessages: [{ direction: "in" as const, text: "Hi" }],
  language: "en" as const,
  hasLocation: false,
  catalog: [],
  faq: [],
};
test("TL26 real AI adapter contract uses structured output and discards reasoning", async () => {
  const adapter = new OpenAIAgentProvider(
    "test-only-key",
    "configured-model",
    async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(init?.redirect, "error");
      const body = JSON.parse(init!.body as string);
      assert.equal(body.store, false);
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      assert.equal(body.max_output_tokens, 1600);
      return Response.json({
        status: "completed",
        output: [
          { type: "reasoning", summary: "not retained" },
          {
            type: "message",
            content: [
              { type: "output_text", text: JSON.stringify(agentPlan()) },
            ],
          },
        ],
        usage: { input_tokens: 12, output_tokens: 25 },
      });
    },
  );
  const result = await adapter.infer(context, new AbortController().signal);
  assert.equal(result.plan.intent, "greeting");
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 25 });
  assert.ok(!JSON.stringify(result).includes("not retained"));
});
for (const body of [
  { status: "incomplete", output: [] },
  {
    status: "completed",
    output: [{ type: "message", content: [{ type: "refusal" }] }],
  },
  {
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({ ...agentPlan(), secret: "forbidden" }),
          },
        ],
      },
    ],
  },
]) {
  test("TL26 real AI adapter rejects incomplete, refusal or unexpected schema safely", async () => {
    const adapter = new OpenAIAgentProvider(
      "test-only-key",
      "configured-model",
      async () => Response.json(body),
    );
    await assert.rejects(
      adapter.infer(context, new AbortController().signal),
      /^Error: AI provider unavailable or invalid structured output$/,
    );
  });
}
