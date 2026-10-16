// Test-only loopback fixture. All commercial eligibility below is fictitious UAT
// configuration; it is never imported by the release bundle or copied to Production.
import type { IncomingMessage, ServerResponse } from "node:http";
import { startServer } from "../../server/http";
import { seed } from "../../server/db/store";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import { revisionFingerprint } from "../../server/catalog/contract";
import { PACK_SPECS } from "../../shared/pack-composition";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { scryptSync, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
process.env.APP_ENV = "test";
process.env.NODE_ENV = "production";
process.env.WEBHOOK_SECRET = "fixture-pack-webhook-secret-at-least-24-chars";
process.env.PROVIDER_MODE = "offline";
process.env.META_OUTBOUND_ENABLED = "false";
process.env.AI_ENABLED = "false";
process.env.OPERATIONS_EMAIL_ENABLED = "false";
process.env.OPERATIONS_WHATSAPP_ENABLED = "false";
process.env.PERSONALIZED_PACKS_ENABLED = "true";
process.env.PERSONALIZED_CONCHAS_PACKS_ENABLED =
  process.env.CONCHAS_PACK_FIXTURE === "true" ? "true" : "false";
process.env.PRODUCT_HUB_ENABLED = "true";
process.env.PRODUCT_HUB_PUBLISH_ENABLED = "true";
process.env.STOREFRONT_DYNAMIC_CATALOG_ENABLED = "true";
process.env.DELIVERY_ADDRESS_MODE = "legacy";
process.env.HOST = "127.0.0.1";
process.env.OPERATOR_USERS_JSON = JSON.stringify(
  ["admin", "manager", "operator"].map((role) => ({
    id: role,
    role,
    salt: "pack-fixture-only-salt",
    hash: scryptSync(
      "pack-fixture-password",
      "pack-fixture-only-salt",
      64,
    ).toString("hex"),
  })),
);
const secret = join(dirname(process.env.DB_PATH!), "fixture-webhook.json");
writeFileSync(
  secret,
  JSON.stringify({
    id: "fixture-webhook",
    hmacKey: "pack-fixture-hmac",
    address: "https://fixture.invalid/api/webhooks/payment",
  }),
  { mode: 0o600 },
);
process.env.PAYMENNT_WEBHOOK_SECRET_FILE = secret;
const sources = loadBootstrapSources(process.cwd()),
  initial = seed();
initial.catalog = structuredClone(sources.approved);
initial.catalogFoundation = planCatalogBootstrap(
  initial.catalog,
  sources,
).foundation!;
initial.catalogFoundation.packEligibility = PACK_SPECS.map((s) => ({
  packSkuId: s.packSkuId,
  componentSkuIds: s.components.map((c) => c.componentSkuId),
}));
const { revision: _revision, ...metadata } = initial.catalogFoundation;
const fingerprint = revisionFingerprint(metadata, initial.catalog);
initial.catalogFoundation.revision = {
  id: `catalog-v1-${fingerprint}`,
  fingerprint,
  publishedAt: null,
};
let status = "PENDING";
let providerPosts = 0;
const records = new Map<string, Record<string, unknown>>();
const payment = new PaymenntProvider(
  { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
  async (url, init) => {
    if (init?.method === "POST") {
      providerPosts++;
      const id = randomUUID();
      records.set(id, {
        ...JSON.parse(String(init.body)),
        id,
        redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
      });
      return Response.json({
        success: true,
        result: { ...records.get(id), status },
      });
    }
    return Response.json({
      success: true,
      result: { ...records.get(String(url).split("/").at(-1)!), status },
    });
  },
);
const app = await startServer({ initial, payment });
const [handler] = app.server.listeners("request");
app.server.removeAllListeners("request");
app.server.on("request", (req, res) => {
  if (req.url === "/__fixture/conchas-mode" && req.method === "POST") {
    process.env.PERSONALIZED_CONCHAS_PACKS_ENABLED =
      req.headers["x-fixture-enabled"] === "true" ? "true" : "false";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.url === "/__fixture/paid" && req.method === "POST") {
    status = "PAID";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.url === "/__fixture/provider-count") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ providerPosts }));
    return;
  }
  void (handler as (req: IncomingMessage, res: ServerResponse) => unknown)(
    req,
    res,
  );
});
