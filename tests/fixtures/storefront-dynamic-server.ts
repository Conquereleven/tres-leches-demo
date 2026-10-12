// Isolated harness for the dynamic storefront: disposable database, approved catalog
// with its foundation, Product Hub with publication, a fake payment provider and
// dynamic adoption on. Never imported by the production server.
import { startServer } from "../../server/http";
import { seed } from "../../server/db/store";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import { fixtureAddressGeo } from "./website-address";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
process.env.APP_ENV = "test";
process.env.NODE_ENV = "test";
process.env.PROVIDER_MODE = "offline";
process.env.META_OUTBOUND_ENABLED = "false";
process.env.AI_ENABLED = "false";
process.env.DELIVERY_ADDRESS_MODE ??= "legacy";
process.env.PRODUCT_HUB_ENABLED ??= "true";
process.env.PRODUCT_HUB_PUBLISH_ENABLED ??= "true";
process.env.STOREFRONT_DYNAMIC_CATALOG_ENABLED ??= "true";
const secretFile = join(dirname(process.env.DB_PATH!), "webhook.json");
writeFileSync(
  secretFile,
  JSON.stringify({
    id: "fixture-webhook",
    hmacKey: "fixture-hmac-key",
    address: "https://fixture.invalid/api/webhooks/payment",
  }),
  { mode: 0o600 },
);
process.env.PAYMENNT_WEBHOOK_SECRET_FILE = secretFile;
const checkouts = new Map<string, Record<string, unknown>>();
const provider = new PaymenntProvider(
  { apiKey: "fixture-key", apiSecret: "fixture-secret", environment: "test" },
  async (url, init) => {
    if (init?.method === "POST") {
      const id = randomUUID();
      checkouts.set(id, {
        ...JSON.parse(String(init.body)),
        id,
        status: "PENDING",
        redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
      });
      return Response.json({ success: true, result: checkouts.get(id) });
    }
    return Response.json({
      success: true,
      result: checkouts.get(String(url).split("/").at(-1)!),
    });
  },
);
const sources = loadBootstrapSources(process.cwd());
const initial = seed();
initial.catalog = structuredClone(sources.approved);
if (process.env.FIXTURE_FOUNDATION !== "absent") {
  const plan = planCatalogBootstrap(initial.catalog, sources);
  if (!plan.report.valid) throw new Error("Fixture catalog invalid");
  initial.catalogFoundation = plan.foundation;
}
await startServer({ initial, payment: provider, geo: fixtureAddressGeo });
