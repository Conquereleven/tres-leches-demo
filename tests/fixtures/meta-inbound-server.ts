import { startServer } from "../../server/http";
import { seed } from "../../server/db/store";
import { metaNumber } from "./meta-coexistence";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
Object.assign(process.env, {
  APP_ENV: "test",
  NODE_ENV: "test",
  PROVIDER_MODE: "offline",
  PORT: process.env.PORT ?? "0",
  APP_ORIGIN: "http://127.0.0.1",
  META_OUTBOUND_ENABLED: "false",
  OPERATIONS_WHATSAPP_ENABLED: "false",
  CUSTOMER_EMAIL_ENABLED: "false",
  OPERATIONS_EMAIL_ENABLED: "false",
  AI_ENABLED: "false",
  AI_AUTONOMOUS_ALLOWED: "false",
  META_ACCESS_TOKEN: "synthetic-local-token",
  META_APP_SECRET: "synthetic-app-secret-for-local-test",
  META_VERIFY_TOKEN: "synthetic-verify-token-for-local-test",
  META_GRAPH_VERSION: "v26.0",
  META_NUMBERS_JSON: JSON.stringify([metaNumber]),
});
let providerCalls = 0;
globalThis.fetch = (async () => {
  providerCalls++;
  throw Error("External transport forbidden in local inbound fixture");
}) as typeof fetch;
const initial = seed();
initial.orders.push({
  id: "synthetic-paid-order",
  conversationId: "historical",
  state: "Confirmed",
  version: 3,
  lines: [],
  quote: null,
  audit: [],
  paidAt: "2026-01-01T00:00:00.000Z",
  paymentId: "synthetic-paid-payment",
});
initial.payments.push({
  id: "synthetic-paid-payment",
  orderId: "synthetic-paid-order",
  amountFils: 10800,
  currency: "AED",
  status: "paid",
  paidAt: "2026-01-01T00:00:00.000Z",
  lastReconciledAt: "2026-01-01T00:00:00.000Z",
  timeline: [],
  idempotencyKey: "synthetic-only",
} as import("../../server/domain/model").Payment);
const app = await startServer({ initial });
if (!app.server.listening)
  await new Promise<void>((r) => app.server.once("listening", r));
const addr = app.server.address();
const inspect = () => ({
  port: typeof addr === "object" ? addr?.port : undefined,
  disabled: app.service.wa instanceof DisabledWhatsAppProvider,
  providerCalls,
  state: app.store.read(),
});
process.send?.(inspect());
process.on("message", () => process.send?.(inspect()));
