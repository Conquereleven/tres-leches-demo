import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { inboundSchema } from "./commands";
import {
  type Conversation,
  type Message,
  type State,
  requireThat,
} from "./model";
/** Imported history never establishes an API window or an AI trigger. */
export function latestCustomerInbound(c: Conversation) {
  return c.messages
    .filter((m) => m.direction === "in" && m.origin !== "history")
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .at(-1);
}
const digits = (phone: string) => phone.replace(/^\+/, "");
type Incoming = Extract<z.infer<typeof inboundSchema>, { type: "message" }>;
type Contact = Extract<z.infer<typeof inboundSchema>, { type: "contact" }>;
/** Meta sends history media separately; enrich the original, never infer its direction. */
export function applyWhatsAppHistoryMedia(
  s: State,
  e: Extract<z.infer<typeof inboundSchema>, { type: "historyMedia" }>,
) {
  const conversation = s.conversations.find(
    (c) =>
      c.sourceNumberId === e.sourceNumberId &&
      digits(c.phone) === digits(e.phone) &&
      c.messages.some((m) => m.providerId === e.providerMessageId),
  );
  requireThat(conversation, "Historial todavía no disponible; reintentar", 503);
  const existing = conversation.messages.find(
    (m) => m.providerId === e.providerMessageId,
  )!;
  requireThat(
    existing.media &&
      (existing.media.type === "media_placeholder" ||
        existing.media.type === e.media.type),
    "Identidad multimedia incompatible",
    400,
  );
  if (
    !existing.media?.id &&
    (existing.media.type === "media_placeholder" ||
      existing.media.type === e.media.type)
  ) {
    existing.media = e.media;
    if (existing.origin === "history")
      existing.text = e.caption || `[${e.media.type}]`;
    conversation.version++;
  }
}
export function applyWhatsAppContact(
  s: State,
  e: Contact,
  origins: { id: string }[],
) {
  requireThat(
    origins.some((n) => n.id === e.sourceNumberId),
    "Número de origen desconocido",
    400,
  );
  s.whatsappContacts ??= [];
  const previous = s.whatsappContacts.find(
    (c) =>
      c.sourceNumberId === e.sourceNumberId &&
      digits(c.phone) === digits(e.phone),
  );
  if (previous && Date.parse(previous.at) >= Date.parse(e.at)) return;
  const contact = {
    sourceNumberId: e.sourceNumberId,
    phone: digits(e.phone),
    name: e.action === "remove" ? undefined : e.customer,
    at: e.at,
    removed: e.action === "remove",
  };
  if (previous) Object.assign(previous, contact);
  else s.whatsappContacts.push(contact);
  if (contact.name && !contact.removed)
    for (const c of s.conversations.filter(
      (c) =>
        c.sourceNumberId === e.sourceNumberId &&
        digits(c.phone) === digits(e.phone),
    )) {
      c.customer = contact.name;
      c.version++;
    }
}
/** Returns a location-bearing live message only; imported observations cannot alter an order. */
export function applyWhatsAppMessage(
  s: State,
  e: Incoming,
  origins: { id: string; phone: string }[],
) {
  const n = origins.find((n) => n.id === e.sourceNumberId);
  requireThat(n, "Número de origen desconocido", 400);
  let c = s.conversations.find(
    (c) => c.sourceNumberId === n.id && digits(c.phone) === digits(e.phone),
  );
  const historical = e.origin === "history";
  const direction = e.direction ?? "in";
  const contact = s.whatsappContacts?.find(
    (x) =>
      x.sourceNumberId === n.id &&
      digits(x.phone) === digits(e.phone) &&
      !x.removed,
  );
  if (!c) {
    c = {
      id: randomUUID(),
      customer: contact?.name ?? e.customer,
      phone: e.phone,
      sourceNumberId: n.id,
      sourcePhoneNumber: n.phone,
      assignedAgent: null,
      status: "open",
      unread: !historical && direction === "in",
      version: 0,
      messages: [],
      audit: [],
    };
    s.conversations.push(c);
  }
  if (!historical && !contact?.name && e.customer !== "Cliente WhatsApp")
    c.customer = e.customer;
  if (e.origin === "business-app") {
    // A mobile operator spoke: invalidate AI in-flight/queued guards, without
    // inventing which Commerce OS agent owns the phone or clearing assignment.
    s.ai ??= { sessions: {}, runs: [], knowledge: [], enquiries: [] };
    const session = (s.ai.sessions[c.id] ??= {
      state: "HUMAN_ACTIVE",
      mode: "copilot",
      epoch: 0,
      failures: 0,
    });
    session.state = "HUMAN_ACTIVE";
    session.epoch++;
    session.handoffReason = "BUSINESS_APP_OPERATOR";
    session.activeRunId = undefined;
  }
  const existing = e.providerMessageId
    ? c.messages.find(
        (m) =>
          m.providerId === e.providerMessageId || m.id === e.providerMessageId,
      )
    : undefined;
  if (existing) {
    requireThat(
      existing.direction === direction,
      "Identidad de mensaje incompatible",
      400,
    );
    const ranks: Partial<Record<Message["status"], number>> = {
      sent: 1,
      delivered: 2,
      read: 3,
    };
    if (
      e.observedStatus &&
      (ranks[e.observedStatus] ?? 0) > (ranks[existing.status] ?? 0)
    ) {
      existing.status = e.observedStatus;
      c.version++;
    }
    // Different delivery surfaces share one provider message. Prefer live evidence;
    // don't append duplicates, regress receipts, reset assignment or reopen chats.
    if (existing.origin === "history" && !historical) {
      existing.origin = e.origin;
      existing.text = e.text;
      existing.media = e.media;
      existing.location = e.location;
      existing.at = e.at ?? existing.at;
      if (direction === "in") {
        c.unread = true;
        c.status = "open";
      }
      c.version++;
    }
    return null;
  }
  const m: Message = {
    id: e.providerMessageId ?? e.eventId,
    providerId: e.providerMessageId,
    direction,
    origin: e.origin,
    text: e.text,
    media: e.media,
    location: e.location,
    status: e.observedStatus ?? (direction === "in" ? "received" : "sent"),
    at: e.at ?? new Date().toISOString(),
  };
  c.messages.push(m);
  c.messages.sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id),
  );
  c.version++;
  if (!historical && direction === "in") {
    c.unread = true;
    c.status = "open";
  }
  return !historical && direction === "in" && e.location ? c : null;
}
