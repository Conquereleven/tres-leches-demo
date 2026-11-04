import { scryptSync } from "node:crypto";
import { startServer } from "../../server/http";
import { documentsState } from "./order-documents";
import { MockPaymentProvider, MockWhatsAppProvider } from "./providers";
import { MockGeoService } from "./geo";
import { HmacVerifier } from "../../server/adapters/providers";
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
  initial: documentsState(),
  payment: new MockPaymentProvider(
    new HmacVerifier(process.env.WEBHOOK_SECRET),
  ),
  whatsapp: new MockWhatsAppProvider(),
  geo: new MockGeoService(),
});
