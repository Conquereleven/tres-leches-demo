import {
  decisionOrder,
  heldOrders,
  acceptedResidualOrder,
} from "./rt01-fulfillment";
import { docPayment } from "./order-documents";
import { scryptSync } from "node:crypto";
import { startServer } from "../../server/http";
import { printState } from "./print-documents";
import { documentsState } from "./order-documents";
import { MockPaymentProvider, MockWhatsAppProvider } from "./providers";
import { MockGeoService } from "./geo";
import { HmacVerifier } from "../../server/adapters/providers";
const allowed = new Set([
  "PATH",
  "HOME",
  "TMPDIR",
  "PORT",
  "API_PORT",
  "HOST",
  "APP_ORIGIN",
  "DB_PATH",
  "PRINT_FIXTURES",
]);
for (const key of Object.keys(process.env))
  if (!allowed.has(key)) delete process.env[key];
if (!process.env.DB_PATH || !process.env.DB_PATH.includes("order-documents-"))
  throw new Error("Disposable order-documents database path required");
process.env.APP_ENV = "test";
process.env.NODE_ENV = "production";
process.env.WEBHOOK_SECRET = "documents-fixture-only-secret-1234567";
process.env.OPERATOR_USERS_JSON = JSON.stringify(
  ["admin", "manager", "operator", "agent"].map((role) => ({
    id: `fixture-${role}`,
    role,
    salt: "documents-fixture-salt-12345",
    hash: scryptSync(
      "fictional-password",
      "documents-fixture-salt-12345",
      64,
    ).toString("hex"),
  })),
);
await startServer({
  initial: (() => {
    const state = documentsState();
    const decisions = [
      ...heldOrders(),
      decisionOrder("auto-rescheduled"),
      decisionOrder("auto-rescheduled", "pickup"),
      acceptedResidualOrder("delivery"),
      acceptedResidualOrder("pickup"),
    ];
    decisions[0]!.state = "Ready"; // synthetic held work must never count as ready
    state.orders.push(...decisions);
    state.payments.push(...decisions.map((o) => docPayment(o)));
    if (process.env.PRINT_FIXTURES === "true") {
      const print = printState();
      state.orders.push(...print.orders);
      state.payments.push(...print.payments);
    }
    return state;
  })(),
  payment: new MockPaymentProvider(
    new HmacVerifier(process.env.WEBHOOK_SECRET),
  ),
  whatsapp: new MockWhatsAppProvider(),
  geo: new MockGeoService(),
});
