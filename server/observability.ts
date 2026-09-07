import { AsyncLocalStorage } from "node:async_hooks";
export const trace = new AsyncLocalStorage<string>();
/** Allowlisted fields only: never log URLs, bodies, headers, names, phone numbers or coordinates. */
export function safeLog(
  event:
    | "http.complete"
    | "outbox.attempt"
    | "outbox.failed"
    | "reconciliation.complete"
    | "webhook.accepted"
    | "worker.failed",
  fields: {
    status?: number | string;
    attempt?: number;
    kind?: string;
    count?: number;
  } = {},
) {
  if (process.env.SAFE_LOGS === "true")
    console.log(
      JSON.stringify({
        at: new Date().toISOString(),
        event,
        correlationId: trace.getStore(),
        ...fields,
      }),
    );
}
