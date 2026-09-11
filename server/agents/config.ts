import { z } from "zod";
import { modes, type AgentConfig } from "./model";
export function agentConfig(env: NodeJS.ProcessEnv): AgentConfig {
  const defaultMode = z
    .enum(modes)
    .parse(env.AI_AGENT_DEFAULT_MODE ?? "copilot");
  const autonomousAllowed =
    z.enum(["true", "false"]).parse(env.AI_AUTONOMOUS_ALLOWED ?? "false") ===
    "true";
  if (defaultMode === "autonomous_bounded" && !autonomousAllowed)
    throw new Error("Autonomous mode not allowed");
  const provider = z.enum(["openai"]).parse(env.AI_PROVIDER ?? "openai");
  return {
    enabled:
      z.enum(["true", "false"]).parse(env.AI_ENABLED ?? "false") === "true",
    configured: !!env.AI_API_KEY && !!env.AI_MODEL,
    provider,
    model: env.AI_MODEL ?? "",
    defaultMode,
    autonomousAllowed,
    timeoutMs: z.coerce
      .number()
      .int()
      .min(100)
      .max(30000)
      .parse(env.AI_TIMEOUT_MS ?? 10000),
    maxTurns: z.coerce
      .number()
      .int()
      .min(1)
      .max(5)
      .parse(env.AI_MAX_TURNS_PER_INBOUND ?? 3),
    maxTools: z.coerce
      .number()
      .int()
      .min(1)
      .max(8)
      .parse(env.AI_MAX_TOOL_CALLS ?? 6),
    ratePerMinute: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .parse(env.AI_RATE_PER_MINUTE ?? 6),
  };
}
