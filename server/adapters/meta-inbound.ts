/** Documented Meta messages, SMB echoes, history and contact-sync contracts.
 * No provider fetches, media URLs, downloads, registration or outbound work.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { inboundSchema } from "../domain/commands";
import { locationSchema } from "../domain/model";
import { ProviderFailure } from "./failure";
import type { MetaNumber } from "./meta";
const phone = z.string().regex(/^\+?[0-9]{7,16}$/);
const id = z.string().min(1).max(256);
const timestamp = z.string().regex(/^\d{1,12}$/);
const media = z.object({
  id: id.optional(),
  mime_type: z.string().max(120).optional(),
  sha256: z.string().max(128).optional(),
  filename: z.string().max(255).optional(),
  caption: z.string().max(4000).optional(),
  voice: z.boolean().optional(),
});
const message = z.object({
  id,
  from: phone,
  to: phone.optional(),
  timestamp,
  type: z.string().max(80),
  text: z.object({ body: z.string().max(4000) }).optional(),
  location: z
    .object({ latitude: z.number(), longitude: z.number() })
    .optional(),
  image: media.optional(),
  audio: media.optional(),
  video: media.optional(),
  document: media.optional(),
  sticker: media.optional(),
  history_context: z.object({ status: z.string().max(40) }).optional(),
});
const envelope = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z
    .array(
      z.object({
        id,
        time: z.union([timestamp, z.number().int().nonnegative()]).optional(),
        changes: z
          .array(z.object({ field: z.string(), value: z.unknown() }))
          .max(100),
      }),
    )
    .max(100),
});
const valueSchema = z.object({
  metadata: z.object({ phone_number_id: id }),
  contacts: z
    .array(
      z.object({
        wa_id: phone,
        profile: z.object({ name: z.string().min(1).max(100) }),
      }),
    )
    .max(5000)
    .optional(),
  messages: z.array(message).max(5000).optional(),
  message_echoes: z.array(message).max(5000).optional(),
  statuses: z
    .array(z.object({ id, status: z.string(), timestamp }))
    .max(5000)
    .optional(),
  history: z
    .array(
      z.object({
        metadata: z
          .object({
            phase: z.number().int().min(0).max(2),
            chunk_order: z.number().int().nonnegative(),
            progress: z.number().min(0).max(100),
          })
          .optional(),
        threads: z
          .array(z.object({ id: phone, messages: z.array(message).max(5000) }))
          .max(5000)
          .optional(),
        errors: z.array(z.object({ code: z.number() })).optional(),
      }),
    )
    .max(100)
    .optional(),
  state_sync: z
    .array(
      z.object({
        type: z.literal("contact"),
        contact: z.object({
          phone_number: phone,
          full_name: z.string().max(100).optional(),
          first_name: z.string().max(100).optional(),
        }),
        action: z.enum(["add", "remove"]),
        metadata: z.object({
          timestamp: z
            .union([
              timestamp,
              z.number().int().nonnegative().max(999999999999),
            ])
            .transform(String),
        }),
      }),
    )
    .max(5000)
    .optional(),
});
const digits = (s: string) => s.replace(/^\+/, "");
const identity = (...values: string[]) =>
  "meta:" + createHash("sha256").update(JSON.stringify(values)).digest("hex");
const instant = (value: string) => {
  const date = new Date(Number(value) * 1000);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 300000)
    throw new ProviderFailure("rejected", false);
  return date.toISOString();
};
type Event = z.infer<typeof inboundSchema>;
const supported = new Set([
  "messages",
  "smb_message_echoes",
  "history",
  "smb_app_state_sync",
]);
export function normalizeMetaInbound(
  raw: unknown,
  numbers: MetaNumber[],
): Event[] {
  const result: Event[] = [];
  for (const entry of envelope.parse(raw).entry) {
    if (!numbers.some((n) => n.wabaId === entry.id))
      throw new ProviderFailure("rejected", false);
    for (const change of entry.changes) {
      if (change.field === "account_update") {
        const account = z
          .object({
            event: z.string().max(80),
            phone_number: phone.optional(),
            disconnection_info: z
              .object({
                reason: z.string().max(100).optional(),
                initiated_by: z.enum(["USER", "SYSTEM"]).optional(),
              })
              .optional(),
          })
          .parse(change.value);
        if (
          ![
            "PARTNER_REMOVED",
            "ACCOUNT_OFFBOARDED",
            "ACCOUNT_RECONNECTED",
          ].includes(account.event)
        )
          continue;
        const source = account.phone_number
          ? numbers.find(
              (n) =>
                n.wabaId === entry.id &&
                digits(n.phone) === digits(account.phone_number!),
            )
          : undefined;
        if (account.phone_number && !source)
          throw new ProviderFailure("rejected", false);
        const reason = account.disconnection_info?.reason;
        result.push(
          inboundSchema.parse({
            type: "coexistence",
            eventId: identity(
              entry.id,
              "account_update",
              JSON.stringify(account),
              String(entry.time ?? ""),
            ),
            wabaId: entry.id,
            sourceNumberId: source?.id,
            event: account.event,
            ...(entry.time === undefined
              ? {}
              : { at: instant(String(entry.time)) }),
            reason: [
              "ACCOUNT_DISCONNECTED",
              "BUSINESS_DOWNGRADE",
              "CHANGE_NUMBER",
              "COMPANION_INACTIVITY",
              "PRIMARY_INACTIVITY",
              "USER_RE_REGISTERED",
            ].includes(reason ?? "")
              ? reason
              : undefined,
            initiatedBy: account.disconnection_info?.initiated_by,
          }),
        );
        if (result.length > 10000) throw new ProviderFailure("rejected", false);
        continue;
      }
      // Other lifecycle/template fields are not conversation messages.
      if (!supported.has(change.field)) continue;
      const value = valueSchema.parse(change.value);
      const number = numbers.find(
        (n) =>
          n.wabaId === entry.id &&
          n.phoneNumberId === value.metadata.phone_number_id,
      );
      if (!number) throw new ProviderFailure("rejected", false);
      const pushMessage = (
        m: z.infer<typeof message>,
        origin: "cloud" | "business-app" | "history",
        thread?: string,
      ) => {
        const outbound =
          origin === "business-app" ||
          (origin === "history" && digits(m.from) === digits(number.phone));
        const recipient = outbound ? (m.to ?? thread) : m.from;
        if (
          !recipient ||
          (outbound && digits(m.from) !== digits(number.phone)) ||
          (thread && digits(recipient) !== digits(thread)) ||
          (!outbound && m.to && digits(m.to) !== digits(number.phone)) ||
          digits(recipient) === digits(number.phone)
        )
          throw new ProviderFailure("rejected", false);
        const kind = m.type as
          "image" | "audio" | "video" | "document" | "sticker";
        const data = m[kind];
        const supportedMedia = [
          "image",
          "audio",
          "video",
          "document",
          "sticker",
          "media_placeholder",
        ].includes(m.type);
        const historyStatus = (
          {
            SENT: "sent",
            DELIVERED: "delivered",
            READ: "read",
            ERROR: "failed",
            PLAYED: "read",
            PENDING: "unknown",
          } as const
        )[m.history_context?.status as "SENT"];
        result.push(
          inboundSchema.parse({
            type: "message",
            eventId: identity(
              number.id,
              origin,
              m.id,
              origin === "history" ? (m.history_context?.status ?? "") : "",
            ),
            providerMessageId: m.id,
            sourceNumberId: number.id,
            phone: digits(recipient),
            direction: outbound ? "out" : "in",
            origin,
            at: instant(m.timestamp),
            customer:
              value.contacts?.find((c) => digits(c.wa_id) === digits(recipient))
                ?.profile.name ?? "Cliente WhatsApp",
            text:
              m.type === "text" && m.text
                ? m.text.body
                : m.type === "location"
                  ? "Ubicación compartida"
                  : supportedMedia
                    ? data?.caption || `[${m.type}]`
                    : "Mensaje no compatible; revisar en WhatsApp",
            ...(m.type === "location" && m.location
              ? {
                  location: locationSchema.parse({
                    lat: m.location.latitude,
                    lng: m.location.longitude,
                  }),
                }
              : {}),
            ...(supportedMedia
              ? {
                  media: {
                    type: m.type,
                    id: data?.id,
                    mimeType: data?.mime_type,
                    filename: data?.filename,
                    sha256: data?.sha256,
                    voice: data?.voice,
                  },
                }
              : {}),
            observedStatus: outbound
              ? (historyStatus ?? (origin === "history" ? "unknown" : "sent"))
              : "received",
          }),
        );
      };
      if (change.field === "messages") {
        for (const m of value.messages ?? []) pushMessage(m, "cloud");
        for (const s of value.statuses ?? []) {
          instant(s.timestamp);
          if (!["sent", "delivered", "read", "failed"].includes(s.status))
            continue;
          result.push(
            inboundSchema.parse({
              type: "status",
              eventId: identity(number.id, s.id, s.status, s.timestamp),
              providerId: s.id,
              sourceNumberId: number.id,
              status: s.status,
            }),
          );
        }
      } else if (change.field === "smb_message_echoes") {
        for (const m of value.message_echoes ?? [])
          pushMessage(m, "business-app");
      } else if (change.field === "history") {
        // Documented separate history-media delivery uses value.messages, not threads.
        for (const m of value.messages ?? []) {
          const type = m.type as
            "image" | "audio" | "video" | "document" | "sticker";
          if (
            !["image", "audio", "video", "document", "sticker"].includes(type)
          )
            continue;
          const asset = m[type];
          if (!asset?.id) throw new ProviderFailure("rejected", false);
          instant(m.timestamp);
          const recipient =
            digits(m.from) === digits(number.phone) ? m.to : m.from;
          if (!recipient || digits(recipient) === digits(number.phone))
            throw new ProviderFailure("rejected", false);
          const observed = {
            type,
            id: asset.id,
            mimeType: asset.mime_type,
            sha256: asset.sha256,
            filename: asset.filename,
            voice: asset.voice,
          };
          result.push(
            inboundSchema.parse({
              type: "historyMedia",
              eventId: identity(
                number.id,
                "history-media",
                m.id,
                JSON.stringify(observed),
                asset.caption ?? "",
              ),
              sourceNumberId: number.id,
              providerMessageId: m.id,
              phone: digits(recipient),
              media: observed,
              caption: asset.caption,
            }),
          );
        }
        if (
          value.history?.some((batch) =>
            batch.errors?.some((e) => e.code === 2593109),
          )
        ) {
          result.push(
            inboundSchema.parse({
              type: "coexistence",
              eventId: identity(number.id, "history-sharing-declined"),
              wabaId: entry.id,
              sourceNumberId: number.id,
              event: "HISTORY_SHARING_DECLINED",
            }),
          );
        }
        for (const batch of value.history ?? [])
          for (const thread of batch.threads ?? [])
            for (const m of thread.messages)
              pushMessage(m, "history", thread.id);
      } else {
        for (const c of value.state_sync ?? [])
          result.push(
            inboundSchema.parse({
              type: "contact",
              eventId: identity(
                number.id,
                c.contact.phone_number,
                c.metadata.timestamp,
                c.action,
              ),
              sourceNumberId: number.id,
              phone: digits(c.contact.phone_number),
              at: instant(c.metadata.timestamp),
              action: c.action,
              customer:
                c.contact.full_name || c.contact.first_name || undefined,
            }),
          );
      }
      if (result.length > 10000) throw new ProviderFailure("rejected", false);
    }
  }
  return result;
}
