import { scryptSync } from "node:crypto";
import { startServer } from "../../server/http";
import { analyticsState } from "./analytics";
import { MockPaymentProvider, MockWhatsAppProvider } from "./providers";
import { MockGeoService } from "./geo";
import { HmacVerifier } from "../../server/adapters/providers";
process.env.APP_ENV = "test";
process.env.NODE_ENV = "production";
process.env.WEBHOOK_SECRET = "analytics-fixture-only-secret-12345678";
process.env.OPERATOR_USERS_JSON = JSON.stringify(
  ["admin", "manager", "operator", "agent"].map((role) => ({
    id: `fixture-${role}`,
    role,
    salt: "analytics-fixture-salt-1234",
    hash: scryptSync(
      "fictional-password",
      "analytics-fixture-salt-1234",
      64,
    ).toString("hex"),
  })),
);
await startServer({
  initial: analyticsState(),
  payment: new MockPaymentProvider(
    new HmacVerifier(process.env.WEBHOOK_SECRET),
  ),
  whatsapp: new MockWhatsAppProvider(),
  geo: new MockGeoService(),
});
