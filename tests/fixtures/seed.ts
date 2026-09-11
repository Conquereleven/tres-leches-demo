import { type State, numbers, now } from "../../server/domain/model";
import { zoneSeed } from "../../server/domain/zones";
export function seed(): State {
  return {
    zones: structuredClone(zoneSeed),
    conversations: numbers.map((n, i) => ({
      id: `conversation-${n.id}`,
      customer: ["Ana Torres", "Valentina García", "Mónica Silva"][i]!,
      phone: `+97150000100${i}`,
      sourceNumberId: n.id,
      sourcePhoneNumber: n.phone,
      assignedAgent: null,
      status: "open",
      unread: true,
      version: 0,
      audit: [],
      messages: [
        {
          id: `seed-${n.id}`,
          direction: "in",
          text: "¡Hola! Quiero pedir un pastel para entrega.",
          translation: "Hello! I would like to order a cake for delivery.",
          at: now(),
          status: "received",
        },
      ],
    })),
    orders: [],
    payments: [],
    jobs: [],
    events: {},
    commands: {},
    audit: [],
  };
}
