import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../server/http";
import { integratedFixture, integratedWebhookFixture } from "./rt01-integrated-server";
import { draftPanettoneFixture } from "./rt012-panettone";

const dir = mkdtempSync(join(tmpdir(), "rt012-panettone-"));
const port = process.env.PORT ?? "4178";
for (const key of Object.keys(process.env))
  if (!["PATH", "HOME", "TMPDIR"].includes(key)) delete process.env[key];
Object.assign(process.env, {
  APP_ENV: "test",
  NODE_ENV: "test",
  PROVIDER_MODE: "offline",
  META_OUTBOUND_ENABLED: "false",
  STOREFRONT_DYNAMIC_CATALOG_ENABLED: "true",
  HOST: "127.0.0.1",
  PORT: port,
  APP_ORIGIN: `http://127.0.0.1:${port}`,
  DB_PATH: join(dir, "synthetic.sqlite"),
  PAYMENNT_WEBHOOK_SECRET_FILE: integratedWebhookFixture(dir),
});
const fixture = integratedFixture();
const runtime = await startServer({ initial: fixture.initial, payment: fixture.payment });
draftPanettoneFixture(runtime.store).publish();
