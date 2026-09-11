import type {
  Actor,
  Conversation,
  Order,
  Payment,
  DeliveryZone,
  Job,
} from "../../server/domain/model";
export type Workspace = {
  ai?: {
    configured: boolean;
    enabled: boolean;
    defaultMode: import("../../server/agents/model").Mode;
    autonomousAllowed: boolean;
    sessions: Record<string, import("../../server/agents/model").AgentSession>;
    runs: import("../../server/agents/model").AgentRun[];
    knowledge?: import("../../server/agents/model").Knowledge[];
    enquiries: import("../../server/agents/model").Enquiry[];
  };
  mode: "integration";
  environment?: "development" | "test" | "staging";
  readiness?: {
    overall:
      | "NOT READY"
      | "INTERNAL READY / EXTERNAL INPUT REQUIRED"
      | "INTEGRATION READY"
      | "PILOT READY";
    components: Record<
      string,
      {
        status: "READY" | "NOT CONFIGURED" | "BLOCKED" | "FAILED";
        detail: string;
        checkedAt?: string;
      }
    >;
  };
  uatScenarios?: {
    id: number;
    title: string;
    status: string;
    reason: string;
  }[];
  integrationHealth?: { inboundFailed: number };
  actor: Actor;
  agents: { id: string; name: string }[];
  numbers: { id: string; label: string; phone: string }[];
  catalog: { id: string; name: string; priceFils: number }[];
  zones: DeliveryZone[];
  conversations: Conversation[];
  orders: Order[];
  payments: Payment[];
  jobs: Job[];
};
export async function api<T>(
  path: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  const res = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: body
      ? {
          "Content-Type": "application/json",
          "Idempotency-Key": key ?? crypto.randomUUID(),
        }
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data: unknown = await res.json();
  if (!res.ok)
    throw new Error(
      (data as { error?: string }).error ??
        "No se pudo conectar. Intenta de nuevo.",
    );
  return data as T;
}
export const money = (fils: number | null | undefined) =>
  fils == null ? "Por confirmar" : `AED ${(fils / 100).toFixed(2)}`;
