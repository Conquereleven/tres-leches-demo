import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import type { WebhookVerifier } from "./providers";
export const paymentTopics = [
  "checkout/created",
  "checkout/paid",
  "checkout/cancelled",
  "checkout/expired",
  "checkout/failed",
  "checkout/refunded",
] as const;
export const notificationSchema = z.object({
  id: z.string().min(1).max(200),
  status: z.string().regex(/^[A-Za-z_ ]{1,40}$/),
  statusUpdateTimestamp: z
    .union([z.string().min(1).max(100), z.number().finite()])
    .optional(),
});
export type PaymenntNotification = z.infer<typeof notificationSchema>;
export function notificationIdentity(event: PaymenntNotification) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        event.id,
        event.status.toUpperCase(),
        event.statusUpdateTimestamp ?? null,
      ]),
    )
    .digest("hex");
}
/** Support contract supplied TL-25: Base64 HMAC over original bytes, before JSON parsing. */
export class PaymenntNotificationVerifier implements WebhookVerifier {
  readonly status = "IMPLEMENTED" as const;
  constructor(private hmacKey = "") {}
  get configured() {
    return this.hmacKey.length > 0;
  }
  verify(raw: string | Buffer, signature: string): boolean {
    if (!this.configured || !/^[A-Za-z0-9+/]{43}=$/.test(signature))
      return false;
    const expected = createHmac("sha256", this.hmacKey).update(raw).digest();
    const received = Buffer.from(signature, "base64");
    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  }
}

/**
 * Why a signed notification was not accepted, in a form safe to log: header
 * presence, the topic's name, and the NAMES and JSON types of body fields.
 * Never a value — no ids, amounts, statuses, customer or payment data.
 */
export function describeRejection(
  topic: unknown,
  body: unknown,
): { code: string; kind: string } {
  const kind =
    typeof topic !== "string"
      ? "missing"
      : /^[A-Za-z0-9/_.:-]{1,60}$/.test(topic)
        ? topic
        : "unprintable";
  const shape = (value: unknown) =>
    value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (body === undefined) return { code: "invalid-json", kind };
  if (shape(body) !== "object")
    return { code: `body-not-object:${shape(body)}`, kind };
  const fields = Object.entries(body as Record<string, unknown>)
    .slice(0, 40)
    .map(([key, value]) =>
      /^[A-Za-z0-9_]{1,40}$/.test(key) ? `${key}:${shape(value)}` : "?",
    )
    .join(",");
  const topicProblem =
    typeof topic !== "string"
      ? "topic-header-missing"
      : (paymentTopics as readonly string[]).includes(topic)
        ? null
        : "topic-unsupported";
  const parsed = notificationSchema.safeParse(body);
  const bodyProblem = parsed.success
    ? null
    : "body-invalid(" +
      parsed.error.issues
        .slice(0, 6)
        .map((issue) => `${issue.path.join(".") || "root"}=${issue.code}`)
        .join(";") +
      ")";
  return {
    code: `${[topicProblem, bodyProblem].filter(Boolean).join("+") || "unknown"} fields[${fields}]`.slice(
      0,
      600,
    ),
    kind,
  };
}
