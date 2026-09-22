// Isolated UAT harness; never imported by the production server.
import { startServer } from "../../server/http";
import { seed } from "../../server/db/store";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { validateCatalog } from "../../server/domain/catalog";
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
process.env.APP_ENV = "test";
process.env.NODE_ENV = "test";
process.env.PROVIDER_MODE = "offline";
process.env.META_OUTBOUND_ENABLED = "false";
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
let status = "PENDING";
const checkouts = new Map<string, Record<string, unknown>>();
process.on("message", (value) => {
  if (value === "PAID" || value === "FAILED" || value === "CANCELLED") {
    status = value;
    process.send?.("updated");
  }
});
const initial = seed();
initial.catalog = validateCatalog(
  JSON.parse(readFileSync("data-imports/pan-de-muerto.json", "utf8")),
);
const provider = new PaymenntProvider(
  { apiKey: "fixture-key", apiSecret: "fixture-secret", environment: "test" },
  async (url, init) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const id = randomUUID();
      checkouts.set(id, {
        ...body,
        id,
        redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
      });
      return Response.json({
        success: true,
        result: { ...checkouts.get(id), status },
      });
    }
    const id = String(url).split("/").at(-1)!;
    return Response.json({
      success: true,
      result: { ...checkouts.get(id), status },
    });
  },
);
await startServer({ initial, payment: provider });
