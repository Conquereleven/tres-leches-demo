import { createHash } from "node:crypto";
import type { State, Conversation } from "./model";
export function agentFingerprint(s: State, c: Conversation) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        catalog: s.catalog,
        zones: s.zones,
        knowledge: s.ai?.knowledge ?? [],
        orders: s.orders.filter((o) => o.conversationId === c.id),
        payments: s.payments.filter((p) =>
          s.orders.some((o) => o.id === p.orderId && o.conversationId === c.id),
        ),
      }),
    )
    .digest("hex");
}
