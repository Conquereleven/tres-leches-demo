import { z } from "zod";
import type { Actor, CatalogItem, Order, Quote } from "../domain/model";
export const modes = [
  "copilot",
  "supervised_auto",
  "autonomous_bounded",
] as const;
export const aiStates = [
  "AI_ACTIVE",
  "AI_WAITING_APPROVAL",
  "HUMAN_REQUIRED",
  "HUMAN_ACTIVE",
  "AI_PAUSED",
  "RESOLVED",
] as const;
export const intents = [
  "greeting",
  "general_question",
  "product_inquiry",
  "availability",
  "order_intent",
  "delivery_location",
  "order_change",
  "payment_question",
  "custom_cake",
  "complaint",
  "cancellation",
  "refund",
  "human_request",
  "unknown",
] as const;
export const faqKeys = [
  "ordering",
  "payments",
  "delivery",
  "custom_cakes",
  "storage",
  "allergens",
  "lead_times",
  "operating_hours",
  "cancellations",
] as const;
export type Mode = (typeof modes)[number];
export type AIState = (typeof aiStates)[number];
export type Intent = (typeof intents)[number];
export const toolNames = [
  "search_catalog",
  "get_product",
  "get_current_order",
  "create_draft_order",
  "add_order_item",
  "remove_order_item",
  "set_delivery_location",
  "resolve_delivery_zone",
  "check_order_eligibility",
  "get_payment_status",
  "prepare_payment_request",
  "get_business_faq",
  "request_human_handoff",
] as const;
const empty = z.object({}).strict();
export const toolSchemas = {
  search_catalog: z.object({ query: z.string().max(150) }).strict(),
  get_product: z.object({ productId: z.string().min(1).max(100) }).strict(),
  get_current_order: empty,
  create_draft_order: empty,
  add_order_item: z
    .object({
      productId: z.string().min(1).max(100),
      quantity: z.number().int().min(1).max(100),
    })
    .strict(),
  remove_order_item: z
    .object({ productId: z.string().min(1).max(100) })
    .strict(),
  set_delivery_location: z
    .object({ address: z.string().min(2).max(500) })
    .strict(),
  resolve_delivery_zone: empty,
  check_order_eligibility: empty,
  get_payment_status: empty,
  prepare_payment_request: empty,
  get_business_faq: z.object({ key: z.enum(faqKeys) }).strict(),
  request_human_handoff: empty,
};
// Model never supplies prices, authority, phone number, order ID, actor or arbitrary customer-facing prose.
export const planSchema = z
  .object({
    intent: z.enum(intents),
    confidence: z.number().min(0).max(1),
    language: z.enum(["en", "es"]),
    tools: z
      .array(
        z
          .object({ name: z.enum(toolNames), arguments: z.string().max(1500) })
          .strict(),
      )
      .max(8),
    reply: z.enum([
      "greeting",
      "products",
      "faq",
      "ask_location",
      "ask_selection",
      "order_summary",
      "payment_status",
      "confirmation_needed",
      "custom_details",
      "handoff",
    ]),
    faqKey: z.enum(faqKeys).nullable(),
  })
  .strict();
export type AgentPlan = z.infer<typeof planSchema>;
export type ToolCall = AgentPlan["tools"][number];
export type ToolResult = {
  name: string;
  code:
    | "OK"
    | "READY"
    | "APPROVAL_REQUIRED"
    | "DATA_NOT_AVAILABLE"
    | "NOT_FOUND"
    | "BLOCKED"
    | "HANDOFF"
    | "ERROR";
  products?: CatalogItem[];
  faq?: string;
  order?: Pick<Order, "id" | "state" | "version" | "lines">;
  quote?: Quote | null;
  paymentStatus?: string;
  action?: ToolCall;
};
export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};
export type Summary = {
  language: "en" | "es";
  intent: Intent;
  messageCount: number;
  lastInboundId: string;
  openNeeds: string[];
};
export type AgentSession = {
  state: AIState;
  mode: Mode;
  epoch: number;
  handoffReason?: string;
  failures: number;
  summary?: Summary;
  activeRunId?: string;
};
export type AgentRun = {
  id: string;
  conversationId: string;
  inboundId: string;
  provider: string;
  model: string;
  mode: Mode;
  status:
    | "running"
    | "suggested"
    | "queued"
    | "sent"
    | "approved"
    | "rejected"
    | "aborted"
    | "failed";
  version: number;
  owner: string | null;
  sourceNumberId: string;
  epoch: number;
  fingerprint: string;
  at: string;
  finishedAt?: string;
  latencyMs?: number;
  usage?: Usage;
  correlationId: string;
  intent?: Intent;
  confidence?: number;
  disposition?: string;
  language?: "en" | "es";
  suggestion?: string;
  tools: ToolResult[];
  actions: ToolCall[];
  approvedActions: number;
  responseApproved?: boolean;
  handoffReason?: string;
  summary?: Summary;
};
export const knowledgeSchema = z
  .object({
    key: z.enum(faqKeys),
    language: z.enum(["en", "es"]),
    content: z.string().trim().min(1).max(3000).nullable(),
    approved: z.boolean(),
    version: z.number().int().nonnegative(),
  })
  .strict();
export type Knowledge = z.infer<typeof knowledgeSchema> & {
  approvedBy?: string;
  updatedAt?: string;
};
export type Enquiry = {
  conversationId: string;
  inboundId: string;
  at: string;
  occasion?: string;
  desiredDate?: string;
  servings?: number;
  theme?: string;
  preferences?: string;
  referenceNotes: string;
  specialRequirements?: string;
  requiresQuote: true;
};
export type AgentData = {
  sessions: Record<string, AgentSession>;
  runs: AgentRun[];
  knowledge: Knowledge[];
  enquiries: Enquiry[];
};
export type AgentContext = {
  recentMessages: { direction: "in" | "out"; text: string }[];
  summary?: Summary;
  language: "en" | "es";
  hasLocation: boolean;
  catalog: { id: string; name: string; category?: string }[];
  currentOrder?: Pick<Order, "id" | "state" | "lines">;
  delivery?: Quote | null;
  paymentStatus?: string;
  faq: { key: string; content: string }[];
};
export type ContextSnapshot = {
  context: AgentContext;
  conversationId: string;
  version: number;
  owner: string | null;
  sourceNumberId: string;
  inboundId: string;
  inboundAt: string;
  inboundText: string;
  epoch: number;
  fingerprint: string;
  session: AgentSession;
  messageCount: number;
};
export interface AgentModelProvider {
  readonly name: string;
  readonly model: string;
  infer(
    context: AgentContext,
    signal: AbortSignal,
  ): Promise<{ plan: unknown; usage?: Usage }>;
}
export type AgentConfig = {
  enabled: boolean;
  configured: boolean;
  provider: string;
  model: string;
  defaultMode: Mode;
  autonomousAllowed: boolean;
  timeoutMs: number;
  maxTurns: number;
  maxTools: number;
  ratePerMinute: number;
};
export interface AgentGateway {
  snapshot(id: string): ContextSnapshot;
  candidates(): string[];
  claim(
    snapshot: ContextSnapshot,
    manual: boolean,
    config: AgentConfig,
    provider: AgentModelProvider,
  ): AgentRun | null;
  tool(
    snapshot: ContextSnapshot,
    call: ToolCall,
    language: "en" | "es",
  ): Promise<ToolResult>;
  complete(
    run: AgentRun,
    snapshot: ContextSnapshot,
    autoSend: boolean,
    enquiry?: Enquiry,
  ): AgentRun;
  fail(run: AgentRun, reason: string): void;
  control(
    id: string,
    actor: Actor,
    version: number,
    action: "takeover" | "return" | "pause" | "resolve",
    mode?: Mode,
  ): void;
  approve(
    id: string,
    runId: string,
    actor: Actor,
    version: number,
    action: "send" | "reject" | "action",
    text?: string,
  ): void;
  summary(): {
    sessions: Record<string, AgentSession>;
    runs: AgentRun[];
    configuredKnowledge: number;
    lastSuccess?: string;
    errors: number;
  };
  updateKnowledge(value: unknown, actor: Actor): void;
}
