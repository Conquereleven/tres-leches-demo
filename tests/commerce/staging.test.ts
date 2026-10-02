import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runtimeConfig, integrationConfig } from "../../server/config";
import { Store } from "../fixtures/runtime";
import { stagingSeed } from "../fixtures/staging-seed";
import { BackupManager } from "../../server/db/backups";
import { Readiness } from "../../server/readiness";
import { PaymenntNotificationVerifier } from "../../server/adapters/paymennt-notification";
import {
  DisabledWhatsAppProvider,
  UnconfiguredPaymentProvider,
} from "../../server/adapters/blocked";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { MapboxGeoProvider } from "../../server/adapters/mapbox";
import { CommerceService } from "../fixtures/runtime";
import { numbers } from "../../server/domain/model";
import { stagingEnv } from "../fixtures/staging";
test("TL18 environment matrix separates framework production from staging and rejects production activation", () => {
  assert.equal(runtimeConfig({}).environment, "development");
  assert.equal(runtimeConfig({ APP_ENV: "test" }).environment, "test");
  assert.equal(
    runtimeConfig(stagingEnv("/private/tmp/tl18-fixture")).environment,
    "staging",
  );
  assert.throws(
    () => runtimeConfig({ APP_ENV: "production", PRODUCTION_APPROVED: "true" }),
    /disabled|explicit provider configuration/,
  );
  assert.throws(
    () => runtimeConfig({ NODE_ENV: "production" }),
    /disabled|explicit provider configuration/,
  );
  assert.throws(
    () => runtimeConfig({ PAYMENNT_ENVIRONMENT: "live" }),
    /disabled|explicit provider configuration/,
  );
  assert.throws(
    () => runtimeConfig({ META_OUTBOUND_ENABLED: "true" }),
    /disabled|explicit provider configuration/,
  );
});
for (const key of [
  "APP_ORIGIN",
  "DB_PATH",
  "PERSISTENT_VOLUME_CONFIRMED",
  "BACKUP_DIR",
  "BACKUP_INTERVAL_MINUTES",
  "BACKUP_RETENTION_COUNT",
  "SESSION_TTL_SECONDS",
  "SESSION_SECURE",
  "SAFE_LOGS",
  "WEBHOOK_SECRET",
  "PROVIDER_MODE",
  "PAYMENNT_ENVIRONMENT",
  "META_OUTBOUND_ENABLED",
  "OPERATOR_USERS_JSON",
  "STAGING_SEED",
] as const)
  test(`TL18 staging refuses missing ${key}`, () => {
    const env = stagingEnv("/private/tmp/tl18-fixture");
    delete env[key];
    assert.throws(() => runtimeConfig(env));
  });
test("TL18 rejects insecure origins, excessive sessions, missing roles, duplicate users and legacy demo activation", () => {
  const env = stagingEnv("/private/tmp/tl18-fixture");
  for (const origin of [
    "http://staging.invalid",
    "https://staging.invalid/path",
    "https://user:secret@staging.invalid",
    "https://staging.invalid?secret=x",
  ])
    assert.throws(() => runtimeConfig({ ...env, APP_ORIGIN: origin }));
  assert.throws(() => runtimeConfig({ ...env, SESSION_TTL_SECONDS: "999999" }));
  assert.throws(() => runtimeConfig({ ...env, OPERATOR_USERS_JSON: "[]" }));
  const users = JSON.parse(env.OPERATOR_USERS_JSON!) as unknown[];
  assert.throws(() =>
    runtimeConfig({
      ...env,
      OPERATOR_USERS_JSON: JSON.stringify([...users, users[0]]),
    }),
  );
  assert.throws(() => runtimeConfig({ ...env, DEMO_MODE: "true" }));
});
test("notification rejects missing key; LIVE adapter uses explicit LIVE environment", () => {
  const verifier = new PaymenntNotificationVerifier();
  assert.equal(verifier.verify("{}", ""), false);
  assert.equal(verifier.status, "IMPLEMENTED");
  const live = new PaymenntProvider({
    apiKey: "fixture",
    apiSecret: "fixture",
    environment: "live",
  });
  assert.equal(live.environment, "live");
  assert.equal(
    live.isHostedRedirect("https://pay.test.paymennt.com/checkout/fixture"),
    false,
  );
});
test("TL18 fresh staging seed labels every record TEST and creates no payments or jobs", () => {
  const dir = mkdtempSync(join(tmpdir(), "tl18-seed-"));
  try {
    const path = join(dir, "staging.sqlite");
    const seed = stagingSeed(numbers, true);
    const store = new Store(path, "staging", seed);
    assert.equal(store.read().zones.length, 93);
    assert.equal(store.read().uatScenarios?.length, 10);
    for (const c of store.read().conversations) {
      assert.match(c.customer, /^TEST/);
      assert.match(c.phone, /^TEST-NOT-DELIVERABLE/);
      for (const m of c.messages) assert.match(m.text, /^TEST/);
    }
    assert.equal(store.read().payments.length, 0);
    assert.equal(store.read().jobs.length, 0);
    store.write((s) => {
      s.orders[0]!.version = 7;
    });
    store.close();
    const reopened = new Store(path, "staging", seed);
    assert.equal(reopened.read().orders[0]!.version, 7);
    reopened.close();
    assert.throws(() => new Store(path), /separate database/);
    const demo = new Store(join(dir, "demo.sqlite"));
    demo.close();
    assert.throws(
      () => new Store(join(dir, "demo.sqlite"), "staging", seed),
      /separate database/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("TL18 backup integrity, restoration, bounded retention and failure status", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tl18-backup-"));
  const path = join(dir, "db", "staging.sqlite");
  const store = new Store(path, "staging", stagingSeed(numbers, true));
  try {
    const manager = new BackupManager(store, path, join(dir, "backups"), 2, 60);
    writeFileSync(join(dir, "backups", "keep.txt"), "unrelated");
    assert.equal(manager.status(), "BLOCKED");
    for (let i = 0; i < 3; i++) {
      store.write((s) => {
        s.orders[0]!.version = i;
      });
      await manager.run();
    }
    assert.equal(manager.status(), "READY");
    const files = readdirSync(join(dir, "backups")).filter((n) =>
      n.endsWith(".sqlite"),
    );
    assert.equal(files.length, 2);
    assert.ok(readdirSync(join(dir, "backups")).includes("keep.txt"));
    const latest = files.sort().at(-1)!;
    const backup = join(dir, "backups", latest);
    assert.equal(statSync(backup).mode & 0o777, 0o600);
    const restored = new Store(backup, "staging");
    assert.equal(restored.read().orders[0]!.version, 2);
    restored.close();
    store.backup = async () => {
      throw new Error("private storage error");
    };
    await assert.rejects(manager.run(), /Backup failed/);
    assert.equal(manager.status(), "FAILED");
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("TL18 unavailable providers never return fake success or retry an external send", async () => {
  const store = new Store(":memory:", "staging", stagingSeed(numbers, true));
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    new UnconfiguredPaymentProvider(),
  );
  const actor = { id: "liza", role: "admin" as const };
  try {
    service.command(
      {
        type: "assign",
        id: "TEST-CONVERSATION-wa2",
        version: 0,
        agent: "liza",
      },
      randomUUID(),
      actor,
    );
    service.command(
      {
        type: "send",
        id: "TEST-CONVERSATION-wa2",
        version: 1,
        text: "TEST unsent",
      },
      randomUUID(),
      actor,
    );
    await service.drain();
    await service.drain();
    const job = store.read().jobs[0]!;
    assert.equal(job.status, "failed");
    assert.equal(job.attempts, 1);
    assert.match(job.lastError!, /deshabilitado/);
    await assert.rejects(new UnconfiguredPaymentProvider().createPaymentLink());
  } finally {
    store.close();
  }
});
test("TL18 readiness redacts credentials and connectivity probes are GET-only without pricing assertions", async () => {
  const env = {
    ...stagingEnv("/private/tmp/tl18-fixture"),
    META_ACCESS_TOKEN: "secret-meta",
    META_APP_SECRET: "secret-meta-at-least-24-characters",
    META_VERIFY_TOKEN: "secret-verify-at-least-24-characters",
    META_GRAPH_VERSION: "v99.0",
    META_NUMBERS_JSON: JSON.stringify(
      [1, 2, 3].map((n) => ({
        id: `wa${n}`,
        label: `WA${n}`,
        phone: `+97150000000${n}`,
        phoneNumberId: String(n),
        wabaId: "100",
      })),
    ),
    PAYMENNT_API_KEY: "secret-key",
    PAYMENNT_API_SECRET: "secret-paymennt",
    MAPBOX_ACCESS_TOKEN: "secret-mapbox",
    MAPBOX_PERMANENT_ENABLED: "true",
  };
  const config = integrationConfig({ ...env, INTEGRATION_MODE: "true" })!;
  const store = new Store(":memory:", "staging");
  const calls: string[] = [];
  const paymennt = new PaymenntProvider(
    {
      apiKey: config.PAYMENNT_API_KEY,
      apiSecret: config.PAYMENNT_API_SECRET,
      environment: "test",
    },
    async (url, init) => {
      calls.push(String(url));
      assert.equal(init?.method, "GET");
      return new Response(
        JSON.stringify({
          success: true,
          result: { totalPages: 0, content: [] },
        }),
      );
    },
  );
  const geo = new MapboxGeoProvider(
    config.MAPBOX_ACCESS_TOKEN,
    async () => new Response(JSON.stringify({ features: [] })),
  );
  try {
    const readiness = new Readiness(
      runtimeConfig(env),
      config,
      store,
      true,
      undefined,
      paymennt,
      geo,
    );
    assert.equal((await readiness.probe("paymennt")).status, "READY");
    assert.match(calls[0]!, /^https:\/\/api\.test\.paymennt\.com/);
    assert.equal(
      readiness.snapshot().overall,
      "INTERNAL READY / EXTERNAL INPUT REQUIRED",
    );
    assert.equal(
      readiness.snapshot().components.PaymenntNotification?.status,
      "READY",
    );
    const serialized = JSON.stringify(readiness.snapshot());
    for (const secret of [
      "secret-key",
      "secret-paymennt",
      "secret-meta",
      "secret-mapbox",
      "+971500000001",
    ])
      assert.equal(serialized.includes(secret), false);
    const geoReadiness = new Readiness(
      runtimeConfig(env),
      config,
      store,
      true,
      undefined,
      paymennt,
      geo,
    );
    assert.equal((await geoReadiness.probe("geo")).status, "BLOCKED");
    const failing = new Readiness(
      runtimeConfig(env),
      config,
      store,
      true,
      undefined,
      new PaymenntProvider(
        { apiKey: "x", apiSecret: "y", environment: "test" },
        async () => {
          throw new Error("private token");
        },
      ),
    );
    assert.equal((await failing.probe("paymennt")).status, "FAILED");
    assert.equal(
      JSON.stringify(failing.snapshot()).includes("private token"),
      false,
    );
  } finally {
    store.close();
  }
});

test("TL18 test and development databases cannot be interchanged", () => {
  const dir = mkdtempSync(join(tmpdir(), "tl18-env-db-"));
  try {
    const path = join(dir, "db.sqlite");
    const dev = new Store(path, "development");
    dev.close();
    assert.throws(() => new Store(path, "test"), /separate database/);
    assert.throws(() => new Store(path, "staging"), /separate database/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("TL18 no-go requests reject unknown zone, unknown fee and below minimum on server", () => {
  for (const scenario of ["unknown-zone", "unknown-fee", "below-minimum"]) {
    const store = new Store(":memory:", "staging", stagingSeed(numbers, true));
    const service = new CommerceService(
      store,
      new DisabledWhatsAppProvider(),
      new UnconfiguredPaymentProvider(),
    );
    const actor = { id: "liza", role: "admin" as const };
    const command = (body: unknown) =>
      service.command(body, randomUUID(), actor);
    try {
      command({
        type: "assign",
        id: "TEST-CONVERSATION-wa2",
        version: 0,
        agent: "liza",
      });
      command({
        type: "editOrder",
        id: "TEST-ORDER-wa2",
        version: 0,
        lines: [{ productId: "pan", quantity: 1 }],
      });
      if (scenario === "unknown-fee")
        store.write((s) => {
          const z = s.zones.find((z) => z.id === "jvc")!;
          z.deliveryFeeAed = null;
          z.freeDelivery = false;
        });
      if (scenario === "below-minimum")
        command({
          type: "updateZone",
          zone: {
            ...store.read().zones.find((z) => z.id === "jvc")!,
            freeDelivery: false,
            deliveryFeeAed: 10,
          },
        });
      command({
        type: "location",
        id: "TEST-ORDER-wa2",
        version: store.read().orders.find((o) => o.id === "TEST-ORDER-wa2")!
          .version,
        address:
          scenario === "unknown-zone" ? "Unknown fixture locality" : "JVC",
      });
      assert.throws(() =>
        command({
          type: "requestPayment",
          id: "TEST-ORDER-wa2",
          version: store.read().orders.find((o) => o.id === "TEST-ORDER-wa2")!
            .version,
        }),
      );
      assert.equal(store.read().payments.length, 0);
      assert.equal(store.read().jobs.length, 0);
    } finally {
      store.close();
    }
  }
});
