/**
 * One controlled transactional test email. Explicit administrator invocation:
 *
 *   node dist/node/send-test-email.js <recipient> [production|pickup|delivery]
 *
 * It sends ONE message through the configured provider, rendered from the real
 * template with a clearly fictitious order. It opens no database, reads and
 * writes no order, creates no event, and works whether or not customer email
 * is enabled — so the provider can be proven before anything is switched on.
 * Prints only the provider's message ID; never the key or the recipient.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ResendEmailProvider } from "../server/adapters/resend";
import { renderCustomerEmail } from "../server/domain/customer-notifications";
import type { Order } from "../server/domain/model";
try {
  const [recipient, kind = "production"] = process.argv.slice(2);
  const to = z.email().max(254).parse(recipient);
  const event = z
    .enum(["production", "pickup", "delivery"])
    .transform(
      (k) =>
        ({
          production: "ORDER_PRODUCTION_STARTED",
          pickup: "ORDER_READY_FOR_PICKUP",
          delivery: "ORDER_OUT_FOR_DELIVERY",
        })[k] as
          | "ORDER_PRODUCTION_STARTED"
          | "ORDER_READY_FOR_PICKUP"
          | "ORDER_OUT_FOR_DELIVERY",
    )
    .parse(kind);
  if (!process.env.RESEND_API_KEY || !process.env.CUSTOMER_EMAIL_FROM)
    throw new Error("not-configured");
  const provider = new ResendEmailProvider({
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.CUSTOMER_EMAIL_FROM,
  });
  const tomorrow = new Date(Date.now() + 28 * 3600e3)
    .toISOString()
    .slice(0, 10);
  // Not a stored order: a fixture that exists only in this process.
  const sample = {
    id: "TEST",
    publicOrderNumber: 1,
    fulfillmentMethod: kind === "pickup" ? "pickup" : "delivery",
    customerDetails: { firstName: "Test", lastName: "Recipient" },
    ...(kind === "pickup"
      ? { pickup: { pickupDate: tomorrow, preferredTime: "4:00 PM – 9:00 PM" } }
      : { delivery: { date: tomorrow, slot: "4:00 PM – 9:00 PM" } }),
  } as unknown as Order;
  const email = renderCustomerEmail(event, sample, {
    zoneName: "JLT Cluster C",
  });
  const result = await provider.send({
    to,
    subject: `[TEST] ${email.subject}`,
    text: `This is a test of 3L order emails. No order exists.\n\n${email.body}`,
    idempotencyKey: `test-${randomUUID()}`,
  });
  console.log(
    JSON.stringify({ sent: true, messageId: result.messageId, event }),
  );
} catch (error) {
  // Never echo the recipient, the sender or provider text.
  console.error(
    JSON.stringify({
      sent: false,
      reason:
        error instanceof Error && error.message === "not-configured"
          ? "RESEND_API_KEY or CUSTOMER_EMAIL_FROM is not set"
          : error instanceof Error && /^Resend HTTP \d+$/.test(error.message)
            ? error.message
            : "invalid arguments or sender identity",
    }),
  );
  process.exitCode = 1;
}
