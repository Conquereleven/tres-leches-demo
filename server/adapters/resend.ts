import { z } from "zod";
import type { CustomerEmailProvider } from "../domain/customer-notifications";
const responseSchema = z.object({ id: z.string().min(1).max(200) });
/**
 * Resend transactional email. Constructed only from private configuration;
 * the sender identity is configuration too — no address is assumed here.
 * The outbox row's ID travels as Resend's Idempotency-Key, so a repeated
 * request for the same event cannot produce a second email.
 */
export class ResendEmailProvider implements CustomerEmailProvider {
  readonly name = "resend" as const;
  constructor(
    private config: { apiKey: string; from: string },
    private fetcher: typeof fetch = fetch,
  ) {
    z.object({
      apiKey: z.string().min(10),
      // "Name <address@domain>" or a bare address, as Resend accepts.
      from: z
        .string()
        .regex(/^(?:[^<>@]+<[^<>@\s]+@[^<>@\s]+>|[^<>@\s]+@[^<>@\s]+)$/),
    }).parse(config);
  }
  async send(email: {
    to: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }) {
    const response = await this.fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    // Never surface the provider body: it can echo the recipient address.
    if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
    return { messageId: responseSchema.parse(await response.json()).id };
  }
}
/**
 * Three independent conditions, all required: an explicit enable flag, an API
 * key and a sender identity. Anything less means "not configured": events are
 * still recorded and stay pending; nothing is sent and nothing is faked.
 */
export function resendFromEnv(env: NodeJS.ProcessEnv) {
  if (env.CUSTOMER_EMAIL_ENABLED !== "true") return null;
  if (!env.RESEND_API_KEY || !env.CUSTOMER_EMAIL_FROM)
    throw new Error("Customer email requires provider key and sender identity");
  return new ResendEmailProvider({
    apiKey: env.RESEND_API_KEY,
    from: env.CUSTOMER_EMAIL_FROM,
  });
}
