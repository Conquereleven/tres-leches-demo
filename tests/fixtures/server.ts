import { orderingFixtureProvider } from "./agent-provider";
import { scryptSync } from "node:crypto";
import { startServer } from "../../server/http";
import { seed } from "./runtime";
import { MockWhatsAppProvider, MockPaymentProvider } from "./providers";
import { MockGeoService } from "./geo";
import { HmacVerifier } from "../../server/adapters/providers";
import { numbers } from "../../server/domain/model";
process.env.APP_ENV = "test";
delete process.env.DEMO_MODE;
const verifier = new HmacVerifier(
  process.env.WEBHOOK_SECRET ?? "test-only-secret-at-least-24-characters",
);
process.env.WEBHOOK_SECRET ??= "test-only-secret-at-least-24-characters";
process.env.OPERATOR_USERS_JSON ??= JSON.stringify(
  ["liza", "andrea"].map((id) => ({
    id,
    role: "admin",
    salt: "test-only-salt-24-characters",
    hash: scryptSync(
      "test-only-password",
      "test-only-salt-24-characters",
      64,
    ).toString("hex"),
  })),
);
const app = await startServer({
  initial: seed(),
  agentProvider: orderingFixtureProvider("tres"),
  whatsapp: new MockWhatsAppProvider(),
  payment: new MockPaymentProvider(verifier),
  geo: new MockGeoService(),
  operationalNumbers: numbers,
});
// Simulation endpoints exist only in this test harness and never in the release bundle.
const [handler] = app.server.listeners("request");
app.server.removeAllListeners("request");
app.server.on("request", async (req, res) => {
  if (req.url?.startsWith("/api/demo/") && req.method === "POST") {
    try {
      let raw = "";
      for await (const part of req) raw += part;
      const body = JSON.parse(raw);
      if (req.url === "/api/demo/location") {
        const c = app.store
          .read()
          .conversations.find((c) => c.id === body.conversationId)!;
        app.service.inbound({
          type: "message",
          eventId: crypto.randomUUID(),
          sourceNumberId: c.sourceNumberId,
          phone: c.phone,
          customer: c.customer,
          text: "Test location",
          location: { lat: 25.0657, lng: 55.2089 },
        });
      } else {
        const p = app.store
          .read()
          .payments.find((p) => p.id === body.paymentId)!;
        app.service.paymentWebhook({
          eventId: crypto.randomUUID(),
          reference: p.providerReference,
          transactionId: `mock-tx-${p.id}`,
          status: body.status,
          amountFils: p.amountFils,
          currency: p.currency,
        });
      }
      res.setHeader("Content-Type", "application/json");
      res.end("{}");
    } catch {
      res.statusCode = 400;
      res.end("{}");
    }
  } else handler?.call(app.server, req, res);
});
