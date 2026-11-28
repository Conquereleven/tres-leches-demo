import { randomUUID, scryptSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../server/http";
import { integratedFixture, integratedWebhookFixture } from "./rt01-integrated-server";
import { draftPanettoneFixture, publishBolilloPhotoFixture } from "./rt012-panettone";

const dir = mkdtempSync(join(tmpdir(), "rt012-panettone-"));
const port = process.env.PORT ?? "4178";
const mixed = process.env.PANETTONE_FIXTURE_MIXED === "true";
for (const key of Object.keys(process.env))
  if (!["PATH", "HOME", "TMPDIR"].includes(key)) delete process.env[key];
Object.assign(process.env, {
  APP_ENV: "test",
  NODE_ENV: "production",
  PROVIDER_MODE: "offline",
  META_OUTBOUND_ENABLED: "false",
  STOREFRONT_DYNAMIC_CATALOG_ENABLED: "true",
  HOST: "127.0.0.1",
  PORT: port,
  APP_ORIGIN: `http://127.0.0.1:${port}`,
  DB_PATH: join(dir, "synthetic.sqlite"),
  PAYMENNT_WEBHOOK_SECRET_FILE: integratedWebhookFixture(dir),
  WEBHOOK_SECRET: randomUUID(),
  OPERATOR_USERS_JSON: JSON.stringify([{
    id: "fixture-admin", role: "admin", salt: "rt012-fixture-only-salt",
    hash: scryptSync("fictional-password", "rt012-fixture-only-salt", 64).toString("hex"),
  }]),
});
const fixture = integratedFixture();
const runtime = await startServer({ initial: fixture.initial, payment: fixture.payment });
draftPanettoneFixture(runtime.store, {
  disabledSkus: mixed ? ["panettone-chocolate-mini", "panettone-pistacchio-mini", "panettone-pistacchio-normal"] : [],
}).publish();
publishBolilloPhotoFixture(runtime.store);
