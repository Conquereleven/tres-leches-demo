import { z } from "zod";
import { HmacVerifier, type WhatsAppProvider } from "./providers";
import { ProviderFailure } from "./failure";
import { inboundSchema } from "../domain/commands";
import { normalizeMetaInbound } from "./meta-inbound";
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
/**
 * Meta WhatsApp integration, split into three independent capabilities so that
 * receiving messages never depends on credentials it does not need:
 *
 *   1. Webhook verification (GET hub.challenge) — needs only `verifyToken`.
 *   2. Inbound authenticity (POST)             — additionally needs `appSecret`
 *                                                 and configured `numbers`.
 *   3. Graph API / outbound                    — additionally needs `token`.
 *
 * A missing credential disables only its own capability. It never silently
 * downgrades another: without an app secret the POST route rejects rather than
 * accepting unsigned payloads, and without a token outbound fails closed.
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly idempotentSend = false;
  /** Null when no app secret is configured; POST must then be refused. */
  readonly verifier: HmacVerifier | null;
  readonly numbers: MetaNumber[];
  constructor(
    private config: {
      token?: string;
      appSecret?: string;
      version: string;
      verifyToken: string;
      numbers?: MetaNumber[];
      paymentTemplate?: { name: string; language: string };
    },
    private fetcher: typeof fetch = fetch,
  ) {
    // Numbers are only required to process inbound payloads, so an empty list
    // is valid while the app is still being verified with Meta.
    this.numbers = config.numbers?.length
      ? metaNumbersSchema.parse(config.numbers)
      : [];
    if (!/^v\d+\.0$/.test(config.version) || config.verifyToken.length < 24)
      throw new Error("Meta configuration required");
    this.verifier = config.appSecret
      ? new HmacVerifier(config.appSecret)
      : null;
  }
  /** Signed inbound payloads can be authenticated and attributed to a number. */
  get inboundReady() {
    return !!this.verifier && this.numbers.length > 0;
  }
  /** Graph API calls (validation and outbound sending) are possible. */
  get outboundReady() {
    return !!this.config.token;
  }
  private requireToken() {
    if (!this.config.token)
      throw new ProviderFailure("rejected", false, "NOT_CONFIGURED");
    return this.config.token;
  }
  challenge(params: URLSearchParams): string | null {
    return params.get("hub.mode") === "subscribe" &&
      params.get("hub.verify_token") === this.config.verifyToken
      ? params.get("hub.challenge")
      : null;
  }
  normalize(raw: unknown): z.infer<typeof inboundSchema>[] {
    return normalizeMetaInbound(raw, this.numbers);
  }
  async validateConfiguration() {
    const token = this.requireToken();
    for (const n of this.numbers) {
      let response: Response;
      try {
        response = await this.fetcher(
          `https://graph.facebook.com/${this.config.version}/${n.wabaId}/phone_numbers?fields=id&limit=100`,
          {
            method: "GET",
            redirect: "error",
            signal: AbortSignal.timeout(8000),
            headers: { Authorization: `Bearer ${token}` },
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
  /** Read-only activation proof, never registers or changes a number/template. */
  async validateOperationsConfiguration(
    sourceId: string,
    template: { name: string; language: string },
    expectedBody: string,
    expectedCategory: "UTILITY" | "MARKETING",
  ) {
    const n = this.numbers.find((number) => number.id === sourceId);
    if (!n)
      throw new ProviderFailure("rejected", false, "ORIGIN_NOT_CONFIGURED");
    const token = this.requireToken();
    const get = async (path: string) => {
      const response = await this.fetcher(
        `https://graph.facebook.com/${this.config.version}/${path}`,
        {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(8000),
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) throw new ProviderFailure("rejected", false);
      return response.json();
    };
    const numbers = z
      .object({
        data: z.array(
          z.object({
            id: z.string(),
            display_phone_number: z.string(),
            code_verification_status: z.string(),
            platform_type: z.string(),
            status: z.string(),
          }),
        ),
      })
      .parse(
        await get(
          `${n.wabaId}/phone_numbers?fields=id,display_phone_number,code_verification_status,platform_type,status&limit=100`,
        ),
      );
    const sender = numbers.data.find((number) => number.id === n.phoneNumberId);
    if (
      !sender ||
      sender.display_phone_number.replace(/\D/g, "") !==
        n.phone.replace(/\D/g, "") ||
      sender.code_verification_status !== "VERIFIED" ||
      sender.platform_type !== "CLOUD_API" ||
      sender.status !== "CONNECTED"
    )
      throw new ProviderFailure("rejected", false);
    const templates = z
      .object({
        data: z.array(
          z.object({
            name: z.string(),
            language: z.string(),
            status: z.string(),
            category: z.string(),
            components: z.array(
              z.object({ type: z.string(), text: z.string().optional() }),
            ),
          }),
        ),
      })
      .parse(
        await get(
          `${n.wabaId}/message_templates?name=${encodeURIComponent(template.name)}&fields=name,language,status,category,components&limit=100`,
        ),
      );
    const approved = templates.data.find(
      (t) => t.name === template.name && t.language === template.language,
    );
    if (
      !approved ||
      approved.status !== "APPROVED" ||
      approved.category !== expectedCategory ||
      approved.components.length !== 1 ||
      approved.components[0]?.type !== "BODY" ||
      approved.components[0].text !== expectedBody
    )
      throw new ProviderFailure("rejected", false);
  }
  async send(input: Parameters<WhatsAppProvider["send"]>[0]) {
    const token = this.requireToken();
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
            Authorization: `Bearer ${token}`,
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
