import type { WebhookVerifier } from "./providers";
/** Isolated implementation slot. No unverified protocol is inferred from Meta or another PSP.
 * TODO obtain official documentation + signed test vectors for:
 * - notification payload schema
 * - signature header
 * - algorithm and encoding
 * - canonical signed bytes/string
 * - hmacKey usage
 * - stable event identifier
 * - retries, acknowledgment requirements and delivery order
 * Then implement schema normalization and durable authoritative reconciliation scheduling.
 * Until reviewed, HTTP remains 503 and every verification fails closed.
 */
export class PaymenntNotificationVerifier implements WebhookVerifier {
  readonly status = "BLOCKED" as const;
  verify(): boolean {
    return false;
  }
}
