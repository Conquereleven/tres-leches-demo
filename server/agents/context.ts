import { latestCustomerInbound } from "../domain/whatsapp-inbound";
import type { Conversation, State } from "../domain/model";
import type { AgentContext, Summary } from "./model";
const clean = (text: string) =>
  text
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\+?\d[\d ()-]{7,}\d/g, "[phone]")
    .slice(0, 1000);
export class ConversationContextBuilder {
  build(
    conversation: Conversation,
    state: State,
    summary?: Summary,
  ): AgentContext {
    const incoming = latestCustomerInbound(conversation)?.text ?? "";
    const language =
      /[¿¡ñáéíóú]|\b(hola|quiero|pastel|pedido|gracias|entrega|pagar|precio)\b/i.test(
        incoming,
      )
        ? "es"
        : (summary?.language ?? "en");
    const words = incoming
      .toLowerCase()
      .split(/[^\p{L}\d]+/u)
      .filter((w) => w.length > 2);
    const order = state.orders
      .filter((o) => o.conversationId === conversation.id)
      .at(-1);
    return {
      recentMessages: conversation.messages
        .slice(-16)
        .map((m) => ({ direction: m.direction, text: clean(m.text) })),
      summary,
      language,
      hasLocation: !!conversation.location,
      catalog: (state.catalog ?? [])
        .filter(
          (p) =>
            p.active !== false &&
            p.availability !== "unavailable" &&
            words.some((w) =>
              (p.name + " " + (p.category ?? "")).toLowerCase().includes(w),
            ),
        )
        .slice(0, 8)
        .map((p) => ({ id: p.id, name: p.name, category: p.category })),
      currentOrder: order
        ? { id: order.id, state: order.state, lines: order.lines }
        : undefined,
      delivery: order?.quote,
      paymentStatus: state.payments.find((p) => p.id === order?.paymentId)
        ?.status,
      faq: (state.ai?.knowledge ?? [])
        .filter((k) => k.approved && k.content && k.language === language)
        .slice(0, 9)
        .map((k) => ({ key: k.key, content: k.content!.slice(0, 1200) })),
    };
  }
}
