import { zoneSeed } from "../../server/domain/zones";
import type { State } from "../../server/domain/model";
const scenarios = [
  "WA1 inbound and reply",
  "WA2 GPS and commercial rule",
  "Below minimum blocked",
  "Paymennt TEST link through origin",
  "Authoritative payment reconciliation",
  "Duplicate notification",
  "Ambiguous location and manual zone",
  "Provider send failure recovery",
  "Fulfillment audit",
  "Responsive 390/768/1024/1440",
];
export function stagingSeed(
  aliases: { id: string; phone: string }[],
  includeUat: boolean,
): State {
  const at = new Date().toISOString();
  const conversations: State["conversations"] = includeUat
    ? aliases.map((n) => ({
        id: `TEST-CONVERSATION-${n.id}`,
        customer: `TEST — ${n.id.toUpperCase()}`,
        phone: `TEST-NOT-DELIVERABLE-${n.id}`,
        sourceNumberId: n.id,
        sourcePhoneNumber: n.phone,
        assignedAgent: null,
        status: "open",
        unread: true,
        version: 0,
        messages: [
          {
            id: `TEST-MESSAGE-${n.id}`,
            direction: "in",
            text: "TEST — UAT fixture. No provider event received.",
            at,
            status: "received",
          },
        ],
        audit: [
          {
            at,
            actor: "staging-seed",
            action: "TEST fixture created; not a real provider event",
          },
        ],
      }))
    : [];
  return {
    zones: structuredClone(zoneSeed),
    conversations,
    orders: conversations.map((c) => ({
      id: `TEST-ORDER-${c.sourceNumberId}`,
      conversationId: c.id,
      state: "Building",
      version: 0,
      lines: [],
      quote: null,
      audit: [
        {
          at,
          actor: "staging-seed",
          action: "TEST — empty order fixture; no payment",
        },
      ],
    })),
    payments: [],
    jobs: [],
    events: {},
    commands: {},
    audit: [],
    uatScenarios: scenarios.map((title, index) => ({
      id: index + 1,
      title: `TEST — ${title}`,
      status: "BLOCKED",
      reason: "BLOCKED — EXTERNAL CREDENTIALS / client acceptance pending",
    })),
  };
}
