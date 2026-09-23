import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runtimeConfig, activationConfig } from "../../server/config";
import { Store } from "../../server/db/store";
import { stagingEnv } from "../fixtures/staging";
import { MetaWhatsAppProvider } from "../../server/adapters/meta";
import { ProviderFailure } from "../../server/adapters/failure";
function env() {
  const value: NodeJS.ProcessEnv = {
    ...stagingEnv("/private/tmp/production-contract"),
    APP_ENV: "production",
    AI_ENABLED: "false",
    AI_AGENT_DEFAULT_MODE: "copilot",
    AI_AUTONOMOUS_ALLOWED: "false",
  };
  delete value.STAGING_SEED;
  return value;
}
test("production release boots only with secure offline configuration", () => {
  const e = env();
  const r = runtimeConfig(e);
  assert.equal(r.environment, "production");
  assert.ok(r.staging);
  assert.equal(r.sessionTtlSeconds, 1800);
  assert.deepEqual(activationConfig(e), {
    meta: undefined,
    paymennt: undefined,
    geoToken: undefined,
  });
});
test("production accepts one inbound Meta origin while outbound and payments stay offline", () => {
  const e = {
    ...env(),
    META_OUTBOUND_ENABLED: "false",
    META_ACCESS_TOKEN: "server-only-token",
    META_APP_SECRET: "server-only-app-secret-at-least-24-characters",
    META_VERIFY_TOKEN: "server-only-verify-token-at-least-24-characters",
    META_GRAPH_VERSION: "v99.0",
    META_NUMBERS_JSON: JSON.stringify([
      {
        id: "wa1",
        label: "Pasteleria 3L Dubai",
        phone: "+971585943319",
        phoneNumberId: "767195727350479",
        wabaId: "926440084538581",
      },
    ]),
  };
  assert.equal(runtimeConfig(e).environment, "production");
  const activation = activationConfig(e);
  assert.equal(activation.meta?.numbers.length, 1);
  assert.equal(activation.meta?.numbers[0]?.id, "wa1");
  assert.equal(activation.paymennt, undefined);
  assert.equal(activation.geoToken, undefined);
  assert.equal(e.META_OUTBOUND_ENABLED, "false");
});
for (const [key, value] of Object.entries({
  PROVIDER_MODE: "test",
  META_OUTBOUND_ENABLED: "true",
  AI_ENABLED: "true",
  AI_AUTONOMOUS_ALLOWED: "true",
  AI_AGENT_DEFAULT_MODE: "supervised_auto",
  INTEGRATION_MODE: "true",
  STAGING_SEED: "empty",
  PAYMENNT_ENVIRONMENT: "live",
  SESSION_SECURE: "false",
  PERSISTENT_VOLUME_CONFIRMED: "false",
  OPERATOR_USERS_JSON: "[]",
  APP_ORIGIN: "http://unsafe.invalid",
})) {
  test(`production rejects unsafe ${key}`, () =>
    assert.throws(() => runtimeConfig({ ...env(), [key]: value })));
}
test("production database cannot reuse staging and persists its own configuration", () => {
  const dir = mkdtempSync(join(tmpdir(), "production-db-"));
  try {
    const staging = new Store(join(dir, "staging.sqlite"), "release-staging");
    staging.close();
    assert.throws(
      () => new Store(join(dir, "staging.sqlite"), "release-production"),
      /separate database/,
    );
    const prod = new Store(
      join(dir, "production.sqlite"),
      "release-production",
    );
    const before = prod.read();
    assert.equal(
      before.conversations.length +
        before.orders.length +
        before.payments.length +
        (before.catalog?.length ?? 0),
      0,
    );
    prod.write((s) =>
      s.audit.push({
        at: new Date().toISOString(),
        actor: "release-validation",
        action: "persistence-check",
      }),
    );
    prod.close();
    const after = new Store(
      join(dir, "production.sqlite"),
      "release-production",
    );
    assert.equal(after.read().audit.at(-1)?.action, "persistence-check");
    after.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("production HTTP clean boot, auth, admin readiness and PORT binding", async () => {
  const { spawn } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "production-http-"));
  const base = "http://127.0.0.1:3129",
    origin = "https://production.example.invalid";
  const child = spawn(process.execPath, ["--import", "tsx", "server/main.ts"], {
    env: {
      ...process.env,
      ...env(),
      APP_ORIGIN: origin,
      DB_PATH: join(dir, "production.sqlite"),
      BACKUP_DIR: join(dir, "backups"),
      HOST: "127.0.0.1",
      PORT: "3129",
      API_PORT: "3130",
    },
    stdio: "ignore",
  });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, "production server started");
    const health = await (await fetch(base + "/api/health")).json();
    assert.equal(health.environment, "production");
    assert.equal(health.mode, "offline");
    assert.equal((await fetch(base + "/api/admin/diagnostics")).status, 401);
    const login = await fetch(base + "/api/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "test-admin",
        password: "fixture-password-not-shipped",
      }),
    });
    assert.equal(login.status, 200);
    const headers = {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: login.headers.get("set-cookie")!.split(";")[0]!,
    };
    const snapshot = await (
      await fetch(base + "/api/workspace", { headers })
    ).json();
    for (const k of ["conversations", "orders", "payments", "catalog"])
      assert.equal(snapshot[k].length, 0);
    const diagnostic = await (
      await fetch(base + "/api/admin/diagnostics", { headers })
    ).json();
    assert.equal(diagnostic.environment, "production");
    assert.equal(diagnostic.components.backup.status, "READY");
    assert.equal(
      (
        await fetch(base + "/api/admin/diagnostics", {
          method: "POST",
          headers,
          body: JSON.stringify({ provider: "paymennt" }),
        })
      ).status,
      409,
    );
    for (const route of [
      "/demo",
      "/mvp",
      "/legacy-inbox",
      "/admin",
      "/inbox",
      "/operations",
    ])
      assert.equal(
        (await fetch(base + route, { redirect: "manual" })).status,
        308,
      );
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", () => resolve());
    });
    rmSync(dir, { recursive: true, force: true });
  }
});

const WA1 = JSON.stringify([
  {
    id: "wa1",
    label: "Pasteleria 3L Dubai",
    phone: "+971585943319",
    phoneNumberId: "767195727350479",
    wabaId: "926440084538581",
  },
]);
const VERIFY = "server-only-verify-token-at-least-24-characters";
const SECRET = "server-only-app-secret-at-least-24-characters";

test("webhook verification needs only the verify token, never the access token", () => {
  // Capability A: Meta must be able to complete hub.challenge before any
  // Graph credential exists.
  const activation = activationConfig({
    ...env(),
    META_OUTBOUND_ENABLED: "false",
    META_VERIFY_TOKEN: VERIFY,
    META_GRAPH_VERSION: "v26.0",
  });
  assert.ok(activation.meta, "meta must mount on the verify token alone");
  assert.equal(activation.meta?.token, undefined);
  assert.equal(activation.meta?.appSecret, undefined);
  const provider = new MetaWhatsAppProvider(activation.meta!);
  assert.equal(provider.outboundReady, false);
  assert.equal(provider.inboundReady, false);
  assert.equal(
    provider.challenge(
      new URLSearchParams({
        "hub.mode": "subscribe",
        "hub.verify_token": VERIFY,
        "hub.challenge": "test-value",
      }),
    ),
    "test-value",
  );
  // A wrong token must never echo the challenge back.
  assert.equal(
    provider.challenge(
      new URLSearchParams({
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong",
        "hub.challenge": "test-value",
      }),
    ),
    null,
  );
});

test("without an app secret there is no verifier, so unsigned inbound cannot be accepted", () => {
  const activation = activationConfig({
    ...env(),
    META_OUTBOUND_ENABLED: "false",
    META_VERIFY_TOKEN: VERIFY,
    META_GRAPH_VERSION: "v26.0",
    META_NUMBERS_JSON: WA1,
  });
  const provider = new MetaWhatsAppProvider(activation.meta!);
  assert.equal(provider.verifier, null);
  assert.equal(provider.inboundReady, false);
});

test("the app secret enables signed inbound while outbound stays unavailable", () => {
  const activation = activationConfig({
    ...env(),
    META_OUTBOUND_ENABLED: "false",
    META_VERIFY_TOKEN: VERIFY,
    META_APP_SECRET: SECRET,
    META_GRAPH_VERSION: "v26.0",
    META_NUMBERS_JSON: WA1,
  });
  const provider = new MetaWhatsAppProvider(activation.meta!);
  assert.ok(provider.verifier);
  assert.equal(provider.inboundReady, true);
  assert.equal(provider.outboundReady, false);
  assert.equal(activation.paymennt, undefined);
});

test("Graph calls fail closed without an access token", async () => {
  const provider = new MetaWhatsAppProvider({
    verifyToken: VERIFY,
    appSecret: SECRET,
    version: "v26.0",
    numbers: JSON.parse(WA1),
  });
  const notConfigured = (e: unknown) => {
    assert.ok(e instanceof ProviderFailure);
    assert.equal(e.code, "NOT_CONFIGURED");
    assert.equal(e.certainty, "rejected");
    assert.equal(e.retryable, false);
    return true;
  };
  await assert.rejects(provider.validateConfiguration(), notConfigured);
  await assert.rejects(
    provider.send({
      sourceNumberId: "wa1",
      sourcePhoneNumber: "+971585943319",
      recipient: "+971500000000",
      text: "must not send",
      idempotencyKey: "k",
    }),
    notConfigured,
  );
});

test("enabling outbound without the full credential set is refused", () => {
  assert.throws(
    () =>
      activationConfig({
        ...env(),
        META_OUTBOUND_ENABLED: "true",
        META_VERIFY_TOKEN: VERIFY,
        META_APP_SECRET: SECRET,
        META_GRAPH_VERSION: "v26.0",
        META_NUMBERS_JSON: WA1,
      }),
    /outbound/i,
    "no access token means outbound must not activate",
  );
});
