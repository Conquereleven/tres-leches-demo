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
