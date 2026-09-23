import { z } from "zod";
import { HmacVerifier, type WhatsAppProvider } from "./providers";
import { ProviderFailure } from "./failure";
import { inboundSchema } from "../domain/commands";
import { locationSchema } from "../domain/model";
export const metaNumbersSchema = z
  .array(
    z.object({
      id: z.enum(["wa1", "wa2", "wa3"]),
      label: z.string(),
      phone: z.string().regex(/^\+[0-9]{7,16}$/),
      phoneNumberId: z.string().regex(/^[0-9]+$/),
      wabaId: z.string().regex(/^[0-9]+$/),
    }),
  )
  .min(1)
  .max(3)
  .refine(
    (ns) =>
      new Set(ns.map((n) => n.id)).size === ns.length &&
      new Set(ns.map((n) => n.phoneNumberId)).size === ns.length &&
      new Set(ns.map((n) => n.phone)).size === ns.length,
    "Configured WhatsApp origins must be unique",
  );
export type MetaNumber = z.infer<typeof metaNumbersSchema>[number];
const incoming = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string().regex(/^\d+$/),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  location: z
    .object({ latitude: z.number(), longitude: z.number() })
    .optional(),
});
const payload = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }).optional(),
            contacts: z
              .array(
                z.object({
                  wa_id: z.string(),
                  profile: z.object({ name: z.string() }),
                }),
              )
              .optional(),
            messages: z.array(incoming).optional(),
            statuses: z
              .array(
                z.object({
                  id: z.string(),
                  status: z.string(),
                  timestamp: z.string(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly idempotentSend = false;
  readonly verifier: HmacVerifier;
  readonly numbers: MetaNumber[];
  constructor(
    private config: {
      token: string;
      appSecret: string;
      version: string;
      verifyToken: string;
      numbers: MetaNumber[];
      paymentTemplate?: { name: string; language: string };
    },
    private fetcher: typeof fetch = fetch,
  ) {
    this.numbers = metaNumbersSchema.parse(config.numbers);
    if (
      !config.token ||
      !/^v\d+\.0$/.test(config.version) ||
      config.verifyToken.length < 24
    )
      throw new Error("Meta configuration required");
    this.verifier = new HmacVerifier(config.appSecret);
  }
  challenge(params: URLSearchParams): string | null {
    return params.get("hub.mode") === "subscribe" &&
      params.get("hub.verify_token") === this.config.verifyToken
      ? params.get("hub.challenge")
      : null;
  }
  normalize(raw: unknown): z.infer<typeof inboundSchema>[] {
    const result: z.infer<typeof inboundSchema>[] = [];
    for (const entry of payload.parse(raw).entry)
      for (const change of entry.changes) {
        if (change.field !== "messages") continue;
        const value = change.value;
        const number = this.numbers.find(
          (n) =>
            n.phoneNumberId === value.metadata?.phone_number_id &&
            n.wabaId === entry.id,
        );
        if (!number) throw new ProviderFailure("rejected", false);
        for (const m of value.messages ?? []) {
          const at = new Date(Number(m.timestamp) * 1000).toISOString();
          if (Date.parse(at) > Date.now() + 300000)
            throw new ProviderFailure("rejected", false);
          result.push(
            inboundSchema.parse({
              type: "message",
              eventId: m.id,
              sourceNumberId: number.id,
              phone: m.from,
              customer:
                value.contacts?.find((c) => c.wa_id === m.from)?.profile.name ??
                "Cliente WhatsApp",
              at,
              text:
                m.type === "text" && m.text
                  ? m.text.body
                  : m.type === "location"
                    ? "Ubicación compartida"
                    : "Mensaje no compatible; revisar en WhatsApp",
              ...(m.type === "location" && m.location
                ? {
                    location: locationSchema.parse({
                      lat: m.location.latitude,
                      lng: m.location.longitude,
                    }),
                  }
                : {}),
            }),
          );
        }
        for (const s of value.statuses ?? []) {
          if (!["sent", "delivered", "read", "failed"].includes(s.status))
            continue;
          result.push(
            inboundSchema.parse({
              type: "status",
              eventId: `${s.id}:${s.status}:${s.timestamp}`,
              providerId: s.id,
              status: s.status,
            }),
          );
        }
      }
    return result;
  }
  async validateConfiguration() {
    for (const n of this.numbers) {
      let response: Response;
      try {
        response = await this.fetcher(
          `https://graph.facebook.com/${this.config.version}/${n.wabaId}/phone_numbers?fields=id&limit=100`,
          {
            method: "GET",
            redirect: "error",
            signal: AbortSignal.timeout(8000),
            headers: { Authorization: `Bearer ${this.config.token}` },
          },
        );
      } catch {
        throw new ProviderFailure("unknown", true);
      }
      if (!response.ok) throw new ProviderFailure("rejected", false);
      const body = z
        .object({ data: z.array(z.object({ id: z.string() })) })
        .parse(await response.json());
      if (!body.data.some((p) => p.id === n.phoneNumberId))
        throw new ProviderFailure("rejected", false);
    }
  }
  async send(input: Parameters<WhatsAppProvider["send"]>[0]) {
    const n = this.numbers.find(
      (n) =>
        n.id === input.sourceNumberId && n.phone === input.sourcePhoneNumber,
    );
    if (!n)
      throw new ProviderFailure("rejected", false, "ORIGIN_NOT_CONFIGURED");
    const inWindow =
      input.lastInboundAt &&
      Date.now() - Date.parse(input.lastInboundAt) >= 0 &&
      Date.now() - Date.parse(input.lastInboundAt) < 86400000;
    const template =
      input.template ??
      (!inWindow && input.paymentContext && this.config.paymentTemplate
        ? {
            ...this.config.paymentTemplate,
            parameters: [
              input.paymentContext.amountAed,
              input.paymentContext.url,
            ],
          }
        : undefined);
    if (!inWindow && !template)
      throw new ProviderFailure("rejected", false, "PAYMENT_TEMPLATE_REQUIRED");
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.recipient,
      ...(template
        ? {
            type: "template",
            template: {
              name: template.name,
              language: { code: template.language },
              components: [
                {
                  type: "body",
                  parameters: template.parameters.map((text) => ({
                    type: "text",
                    text,
                  })),
                },
              ],
            },
          }
        : { type: "text", text: { body: input.text, preview_url: true } }),
    };
    let response: Response;
    try {
      response = await this.fetcher(
        `https://graph.facebook.com/${this.config.version}/${n.phoneNumberId}/messages`,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(8000),
          headers: {
            Authorization: `Bearer ${this.config.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
    } catch {
      throw new ProviderFailure("unknown", false);
    }
    if (!response.ok)
      throw new ProviderFailure(
        response.status >= 500 ? "unknown" : "rejected",
        false,
      );
    const data = z
      .object({ messages: z.array(z.object({ id: z.string().min(1) })).min(1) })
      .parse(await response.json());
    return { providerId: data.messages[0]!.id, status: "sent" as const };
  }
}
