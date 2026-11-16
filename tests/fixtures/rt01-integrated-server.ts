/** Disposable integration fixture. No runtime route/control/provider modification. */
import { mock } from "node:test";
import { scryptSync } from "node:crypto";
import { startServer } from "../../server/http";
import { paidFixture } from "./customer-paid";
import { fixtureAddressGeo } from "./website-address";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { resolve, dirname, join } from "node:path";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import {
  publishedRevision,
  storefrontCatalogMode,
} from "../../server/catalog/storefront-api";
import { loadWebhookSecret } from "../../server/adapters/paymennt-secrets";
import { fileURLToPath } from "node:url";
/** Same initial state used by the HTTP/browser fixture; safe to inspect without a listener. */
export function integratedFixture() {
  const f = paidFixture();
  const initial = f.store.read();
  f.store.close();
  const plan = planCatalogBootstrap(
    initial.catalog!,
    loadBootstrapSources(process.cwd()),
  );
  assert.equal(
    plan.report.valid,
    true,
    "Synthetic catalog bootstrap must validate",
  );
  initial.catalogFoundation = plan.foundation;
  assert.equal(publishedRevision(initial, "on").sellable, true);
  return { initial, payment: f.payment, providerState: f.providerState };
}
/** Fake registration only, matching existing checkout fixtures; never a real credential. */
export function integratedWebhookFixture(directory: string) {
  const path = join(directory, "synthetic-webhook.json");
  writeFileSync(
    path,
    JSON.stringify({
      id: "rt01-synthetic-webhook",
      hmacKey: "rt01-synthetic-hmac-only",
      address: "https://fixture.invalid/api/webhooks/payment",
    }),
    { mode: 0o600, flag: "wx" },
  );
  assert.ok(loadWebhookSecret(path));
  return path;
}
async function main() {
  const allowed = new Set([
    "PATH",
    "HOME",
    "TMPDIR",
    "DB_PATH",
    "PORT",
    "API_PORT",
    "HOST",
    "APP_ORIGIN",
  ]);
  for (const key of Object.keys(process.env))
    if (!allowed.has(key)) delete process.env[key];
  if (!process.env.DB_PATH?.includes("rt01-integrated-"))
    throw new Error("New disposable rt01-integrated DB required");
  process.env.APP_ENV = "test";
  process.env.NODE_ENV = "production";
  process.env.PROVIDER_MODE = "offline";
  // Exercise adoption ON explicitly; no off-mode fallback may mask fixture omissions.
  process.env.STOREFRONT_DYNAMIC_CATALOG_ENABLED = "true";
  process.env.PAYMENNT_WEBHOOK_SECRET_FILE = integratedWebhookFixture(
    dirname(process.env.DB_PATH),
  );
  process.env.WEBHOOK_SECRET = "synthetic-integrated-only-secret-12345";
  process.env.OPERATOR_USERS_JSON = JSON.stringify(
    ["admin", "manager", "operator", "agent"].map((role) => ({
      id: `fixture-${role}`,
      role,
      salt: "integrated-fixture-only-salt",
      hash: scryptSync(
        "fictional-password",
        "integrated-fixture-only-salt",
        64,
      ).toString("hex"),
    })),
  );
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-12T10:38:00Z") });
  const { initial, payment, providerState } = integratedFixture();
  assert.equal(storefrontCatalogMode(process.env), "on");
  const started = await startServer({
    initial,
    payment,
    whatsapp: new DisabledWhatsAppProvider(),
    geo: fixtureAddressGeo,
  });
  started.service.customerPaidEmailSince = "2026-11-12T10:00:00Z";
  started.service.operationsEmailRecipients = ["ops@example.invalid"];
  process.on(
    "message",
    (message: {
      id: number;
      action: string;
      now?: string;
      orderId?: string;
    }) => {
      try {
        if (message.action === "paid") providerState.status = "PAID";
        if (message.action === "pending") providerState.status = "PENDING";
        if (message.action === "clock")
          mock.timers.setTime(Date.parse(message.now!));
        if (message.action === "hold")
          started.store.write((s) => {
            const o = s.orders.find((o) => o.id === message.orderId)!;
            delete s.payments.find((p) => p.id === o.paymentId)!
              .fulfillmentIntent;
          });
        if (message.action === "assign")
          started.store.write((s) => {
            for (const c of s.conversations) c.assignedAgent = "fixture-admin";
          });
        process.send?.({
          id: message.id,
          state: started.store.read(),
          creates: providerState.creates,
        });
      } catch (error) {
        process.send?.({ id: message.id, error: String(error) });
      }
    },
  );
  if (started.server.listening) process.send?.({ ready: true });
  else started.server.once("listening", () => process.send?.({ ready: true }));
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
