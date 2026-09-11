// TL25 isolated provider harness. Never bundled or imported by runtime.
import { createHmac, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { startServer } from "../../server/http";
import { seed } from "../../server/db/store";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import {
  MetaWhatsAppProvider,
  type MetaNumber,
} from "../../server/adapters/meta";
import { GeocodingAdapter } from "../../server/adapters/geo";
import { MapboxGeoProvider } from "../../server/adapters/mapbox";
import { validateCatalog } from "../../server/domain/catalog";
process.env.APP_ENV = "test";
process.env.OPERATOR_USERS_JSON = JSON.stringify([{ id: "liza", role: "admin", salt: "fixture-salt-only-24-chars", hash: "a".repeat(128) }]);
const secret = "tl25-private-fixture-signing-key";
const numbers: MetaNumber[] = [1, 2, 3].map((n) => ({
  id: `wa${n}` as MetaNumber["id"],
  label: `WA${n}`,
  phone: `+97150000000${n}`,
  phoneNumberId: String(n),
  wabaId: "100",
}));
const secretFile = join(
  dirname(process.env.DB_PATH!),
  "notification-secret.json",
);
writeFileSync(
  secretFile,
  JSON.stringify({
    id: "fixture-hook",
    hmacKey: secret,
    address: "https://fixture.invalid/api/webhooks/payment",
  }),
  { mode: 0o600 },
);
process.env.PAYMENNT_WEBHOOK_SECRET_FILE = secretFile;
const initial = seed();
initial.catalog = validateCatalog({
  version: 1,
  items: [
    {
      id: "fixture-product",
      name: "Approved test fixture",
      category: "Test only",
      priceAed: "30.00",
      active: true,
    },
  ],
});
const checkouts = new Map<string, Record<string, unknown>>();
const outbound: { url: string; body: unknown }[] = [];
const paymennt = new PaymenntProvider(
  { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
  async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === "POST") {
      const input = JSON.parse(String(init.body));
      const id = randomUUID();
      const c = {
        ...input,
        id,
        status: "PENDING",
        redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
      };
      checkouts.set(id, c);
      return new Response(JSON.stringify({ success: true, result: c }));
    }
    return new Response(
      JSON.stringify({
        success: true,
        result: checkouts.get(path.split("/").at(-1)!),
      }),
    );
  },
);
const meta = new MetaWhatsAppProvider(
  {
    token: "fixture",
    appSecret: secret,
    verifyToken: secret,
    version: "v99.0",
    numbers,
  },
  async (url, init) => {
    outbound.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ messages: [{ id: randomUUID() }] }));
  },
);
const geo = new GeocodingAdapter(
  new MapboxGeoProvider(
    "fixture",
    async () =>
      new Response(
        JSON.stringify({
          features: [
            {
              properties: {
                name: "JLT Cluster B",
                feature_type: "neighborhood",
                mapbox_id: "fixture-jlt-b",
                context: { country: { name: "United Arab Emirates", country_code: "AE" } },
              },
            },
          ],
        }),
      ),
  ),
);
const app = await startServer({
  initial,
  whatsapp: meta,
  payment: paymennt,
  geo,
  operationalNumbers: numbers,
});
const [handler] = app.server.listeners("request");
app.server.removeAllListeners("request");
app.server.on("request", async (req, res) => {
  if (!req.url?.startsWith("/__test/"))
    return handler?.call(app.server, req, res);
  let raw = "";
  for await (const part of req) raw += part;
  const input = raw ? JSON.parse(raw) : {};
  if (req.url === "/__test/settle") {
    const c = checkouts.get(input.id)!;
    c.status = input.status;
  }
  res.setHeader("Content-Type", "application/json");
  const notification = JSON.stringify({ id: input.id, status: input.status });
  res.end(
    JSON.stringify({
      outbound,
      notification,
      signature: createHmac("sha256", secret)
        .update(notification)
        .digest("base64"),
    }),
  );
});
