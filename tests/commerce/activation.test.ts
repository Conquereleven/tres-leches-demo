import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store, seed } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import {
  PaymenntNotificationVerifier,
  notificationIdentity,
} from "../../server/adapters/paymennt-notification";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { importCatalog, validateCatalog } from "../../server/domain/catalog";
import { zoneSeed, matchZone, quoteOrder } from "../../server/domain/zones";
import { activationConfig } from "../../server/config";
const key = "fixture-only-hmac-never-used-with-provider";
const raw = Buffer.from('{"id":"checkout-1","status":"PAID"}');
const sign = (bytes: Buffer) =>
  createHmac("sha256", key).update(bytes).digest("base64");
test("TL25 Base64 signatures authenticate exact raw bytes, not equivalent JSON", () => {
  const v = new PaymenntNotificationVerifier(key);
  assert.equal(v.verify(raw, sign(raw)), true);
  for (const signature of [
    "",
    "invalid",
    "sha256=" + sign(raw),
    sign(Buffer.from("changed")),
  ])
    assert.equal(v.verify(raw, signature), false);
  assert.equal(
    v.verify(Buffer.from('{ "id":"checkout-1", "status":"PAID" }'), sign(raw)),
    false,
  );
  assert.equal(
    v.verify(Buffer.concat([raw, Buffer.from(" ")]), sign(raw)),
    false,
  );
  assert.equal(
    new PaymenntNotificationVerifier().verify(raw, sign(raw)),
    false,
  );
  assert.notEqual(
    notificationIdentity({ id: "a", status: "PAID" }),
    notificationIdentity({ id: "a", status: "REFUNDED" }),
  );
  assert.notEqual(
    notificationIdentity({ id: "a", status: "PAID", statusUpdateTimestamp: 1 }),
    notificationIdentity({ id: "a", status: "PAID", statusUpdateTimestamp: 2 }),
  );
});
function setup() {
  const state = seed();
  state.orders.push({
    id: "order-1",
    conversationId: "c",
    state: "Awaiting Payment",
    version: 0,
    lines: [],
    quote: null,
    paymentId: "payment-1",
    audit: [],
  });
  state.payments.push({
    id: "payment-1",
    orderId: "order-1",
    amountFils: 3000,
    currency: "AED",
    provider: "paymennt",
    providerReference: "checkout-1",
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeline: [],
  });
  const store = new Store(":memory:", "test", state);
  let response: Record<string, unknown> = {
    id: "checkout-1",
    requestId: "payment-1",
    orderId: "order-1",
    amount: 30,
    currency: "AED",
    status: "PAID",
  };
  let failure = 0;
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async () => {
      if (failure === -1) throw new DOMException("timeout", "TimeoutError");
      if (failure)
        return new Response("private provider payload", { status: failure });
      return new Response(JSON.stringify({ success: true, result: response }));
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
  );
  return {
    store,
    service,
    set: (patch: Record<string, unknown>) => {
      response = { ...response, ...patch };
    },
    fail: (status: number) => {
      failure = status;
    },
  };
}
for (const status of ["PAID", "FAILED"])
  test(`TL25 duplicate ${status} is durable and does not duplicate transitions or messages`, async () => {
    const f = setup();
    try {
      f.set({ status });
      await f.service.acceptPaymentNotification({ id: "checkout-1", status });
      const before = f.store.read();
      assert.deepEqual(
        await f.service.acceptPaymentNotification({ id: "checkout-1", status }),
        { duplicate: true },
      );
      assert.deepEqual(f.store.read(), before);
      assert.equal(before.paymentNotifications?.length, 1);
      assert.equal(before.orders[0]!.audit.length, status === "PAID" ? 2 : 1);
      assert.equal(before.jobs.length, 0);
    } finally {
      f.store.close();
    }
  });
test("TL25 webhook status cannot settle payment; paid/refunded are monotonic and preserve fulfillment", async () => {
  const f = setup();
  try {
    f.set({ status: "PENDING" });
    await assert.rejects(
      f.service.acceptPaymentNotification({
        id: "checkout-1",
        status: "PAID",
        statusUpdateTimestamp: 1,
      }),
    );
    assert.equal(f.store.read().payments[0]!.status, "pending");
    f.set({ status: "PAID" });
    await f.service.acceptPaymentNotification({
      id: "checkout-1",
      status: "PAID",
      statusUpdateTimestamp: 2,
    });
    f.set({ status: "PENDING" });
    await f.service.acceptPaymentNotification({
      id: "checkout-1",
      status: "PENDING",
    });
    assert.equal(f.store.read().payments[0]!.status, "paid");
    const history = f.store.read().orders[0]!.audit;
    f.set({ status: "REFUNDED" });
    await f.service.acceptPaymentNotification({
      id: "checkout-1",
      status: "REFUNDED",
    });
    assert.equal(f.store.read().payments[0]!.status, "refunded");
    assert.deepEqual(f.store.read().orders[0]!.audit, history);
  } finally {
    f.store.close();
  }
});
for (const mismatch of [
  { amount: 30.01 },
  { currency: "USD" },
  { requestId: "wrong" },
  { orderId: "wrong" },
  { id: "wrong" },
])
  test(`TL25 authoritative mismatch ${Object.keys(mismatch)[0]} blocks acknowledgment and confirmation`, async () => {
    const f = setup();
    try {
      f.set(mismatch);
      await assert.rejects(
        f.service.acceptPaymentNotification({
          id: "checkout-1",
          status: "PAID",
        }),
      );
      assert.equal(f.store.read().payments[0]!.status, "pending");
      assert.equal(
        f.store.read().paymentNotifications![0]!.completedAt,
        undefined,
      );
    } finally {
      f.store.close();
    }
  });
for (const failure of [-1, 500, 503])
  test(`TL25 authoritative failure ${failure} persists retry and replay recovers`, async () => {
    const f = setup();
    try {
      f.fail(failure);
      await assert.rejects(
        f.service.acceptPaymentNotification({
          id: "checkout-1",
          status: "PAID",
        }),
      );
      assert.equal(f.store.read().payments[0]!.status, "pending");
      assert.equal(f.store.read().paymentNotifications?.length, 1);
      f.fail(0);
      await f.service.acceptPaymentNotification({
        id: "checkout-1",
        status: "PAID",
      });
      assert.equal(f.store.read().orders[0]!.state, "Confirmed");
    } finally {
      f.store.close();
    }
  });
test("TL25 database failure cannot acknowledge notification", async () => {
  const f = setup();
  f.store.close();
  await assert.rejects(
    f.service.acceptPaymentNotification({ id: "checkout-1", status: "PAID" }),
  );
});
test("TL25 commercial facts and legacy alias preserve unknown fees", () => {
  for (const cluster of ["B", "C", "D"]) {
    const z = matchZone(zoneSeed, `JLT Cluster ${cluster}`)!;
    assert.equal(z.minOrderAed, 30);
    assert.equal(z.freeDelivery, true);
    assert.equal(z.deliveryFeeAed, 0);
  }
  assert.equal(matchZone(zoneSeed, "REMRAN")!.name, "Remraam");
  assert.equal(matchZone(zoneSeed, "Remraam")!.minOrderAed, 300);
  assert.equal(matchZone(zoneSeed, "Remraam")!.deliveryFeeAed, 0);
});
const catalog = {
  version: 1,
  items: [
    {
      id: "approved-test-sku",
      name: "Fixture only",
      category: "Fixture",
      priceAed: "30.00",
      active: true,
    },
  ],
};
test("TL25 catalog rejects malformed prices, duplicate/missing IDs and unexpected fields", () => {
  assert.equal(validateCatalog(catalog)[0]!.priceFils, 3000);
  for (const patch of [
    { id: "" },
    { id: undefined },
    { priceAed: "0.00" },
    { priceAed: "30.001" },
    { priceAed: -1 },
    { priceAed: "NaN" },
    { unknown: true },
  ])
    assert.throws(() =>
      validateCatalog({
        ...catalog,
        items: [{ ...catalog.items[0], ...patch }],
      }),
    );
  assert.throws(() =>
    validateCatalog({
      ...catalog,
      items: [catalog.items[0], catalog.items[0]],
    }),
  );
});
test("TL25 catalog dry run leaves DB untouched; apply creates recoverable backup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tl25-catalog-"));
  const store = new Store(join(dir, "db"), "test");
  try {
    const before = store.read();
    await importCatalog(store, catalog, false);
    assert.deepEqual(store.read(), before);
    await assert.rejects(importCatalog(store, catalog, true));
    await importCatalog(store, catalog, true, join(dir, "backup"));
    assert.equal(store.read().catalog![0]!.priceFils, 3000);
    const backup = new Store(join(dir, "backup"), "test");
    assert.deepEqual(backup.read(), before);
    backup.close();
    assert.equal(
      quoteOrder(
        zoneSeed,
        [{ productId: "not-approved", quantity: 1 }],
        "JLT Cluster B",
        undefined,
        undefined,
        undefined,
        store.read().catalog,
      ).eligible,
      false,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("TL25 empty catalog rejects fabricated order lines server-side", () => {
  const state = seed();
  state.conversations.push({
    id: "c",
    customer: "Fixture",
    phone: "971500001111",
    sourceNumberId: "wa2",
    sourcePhoneNumber: "fixture",
    assignedAgent: "admin",
    status: "open",
    unread: false,
    version: 0,
    messages: [],
    audit: [],
  });
  const store = new Store(":memory:", "test", state);
  const providerFixture = setup();
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    providerFixture.service.payment,
  );
  providerFixture.store.close();
  try {
    const order = service.command(
      { type: "createOrder", id: "c", version: 0 },
      randomUUID(),
      { id: "admin", role: "admin" },
    ) as { id: string; version: number };
    assert.throws(() =>
      service.command(
        {
          type: "editOrder",
          ...order,
          lines: [{ productId: "fake", quantity: 1 }],
        },
        randomUUID(),
        { id: "admin", role: "admin" },
      ),
    );
    assert.equal(store.read().payments.length, 0);
  } finally {
    store.close();
  }
});
test("TL25 TEST registration uses official API; no live host or secret returned to UI", async () => {
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url, init) => {
      assert.equal(
        String(url),
        "https://api.test.paymennt.com/mer/v2.0/webhooks",
      );
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        address: "https://staging.example.invalid/api/webhooks/payment",
      });
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            id: "hook",
            hmacKey: key,
            address: "https://staging.example.invalid/api/webhooks/payment",
          },
        }),
      );
    },
  );
  assert.equal(
    (
      await provider.registerWebhook(
        "https://staging.example.invalid/api/webhooks/payment",
      )
    ).hmacKey,
    key,
  );
  await assert.rejects(provider.registerWebhook("http://insecure.invalid"));
  assert.equal(
    activationConfig({
      PROVIDER_MODE: "test",
      PAYMENNT_API_KEY: "fixture",
      PAYMENNT_API_SECRET: "fixture",
    }).meta,
    undefined,
  );
  assert.throws(() => activationConfig({ META_OUTBOUND_ENABLED: "true" }));
});

test("TL25 private webhook key rejects public permissions and checkout/static locations", async () => {
  const { writeFileSync, chmodSync } = await import("node:fs");
  const { loadWebhookSecret, privateSecretPath } =
    await import("../../server/adapters/paymennt-secrets");
  const dir = mkdtempSync(join(tmpdir(), "tl25-secret-"));
  const file = join(dir, "key.json");
  try {
    writeFileSync(
      file,
      JSON.stringify({
        id: "fixture",
        hmacKey: key,
        address: "https://fixture.invalid/api/webhooks/payment",
      }),
      { mode: 0o600 },
    );
    assert.equal(loadWebhookSecret(file)?.hmacKey, key);
    chmodSync(file, 0o644);
    assert.throws(() => loadWebhookSecret(file));
    assert.throws(() =>
      privateSecretPath(join(process.cwd(), "public", "secret.json")),
    );
    assert.equal(loadWebhookSecret(), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("TL25 catalog CLI dry-run, apply and rollback preserve newer operational records", async () => {
  const { execFileSync } = await import("node:child_process");
  const { writeFileSync, readdirSync, mkdirSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "tl25-import-cli-"));
  const db = join(dir, "db");
  const backupDir = join(dir, "backups");
  mkdirSync(backupDir);
  const store = new Store(db, "release-staging");
  store.close();
  const input = join(dir, "catalog.json");
  writeFileSync(input, JSON.stringify(catalog));
  const invoke = (mode: string, file: string) =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/catalog-import.ts", mode, file],
      {
        env: {
          ...process.env,
          APP_ENV: "staging",
          DB_PATH: db,
          BACKUP_DIR: backupDir,
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  try {
    assert.equal(JSON.parse(invoke("dry-run", input)).count, 1);
    assert.equal(JSON.parse(invoke("apply", input)).applied, true);
    const backup = join(
      backupDir,
      readdirSync(backupDir).find((f) => f.endsWith(".sqlite"))!,
    );
    const updated = new Store(db, "release-staging");
    updated.write((s) => {
      s.audit.push({
        at: new Date().toISOString(),
        actor: "fixture",
        action: "newer operational record",
      });
    });
    updated.close();
    assert.equal(JSON.parse(invoke("rollback", backup)).applied, true);
    const final = new Store(db, "release-staging");
    assert.equal(final.read().catalog?.length, 0);
    assert.ok(
      final.read().audit.some((a) => a.action === "newer operational record"),
    );
    final.close();
    assert.equal(
      readdirSync(backupDir).filter((f) => f.endsWith(".sqlite")).length,
      2,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("TL25 storage failure during settlement rolls back and leaves receipt retryable", async () => {
  const f = setup();
  const write = f.store.write.bind(f.store);
  let calls = 0;
  f.store.write = function <T>(fn: Parameters<Store["write"]>[0]): T {
    if (++calls === 2) throw new Error("fixture storage failure");
    return write(fn) as T;
  };
  try {
    await assert.rejects(
      f.service.acceptPaymentNotification({ id: "checkout-1", status: "PAID" }),
    );
    assert.equal(f.store.read().payments[0]!.status, "pending");
    assert.equal(
      f.store.read().paymentNotifications![0]!.completedAt,
      undefined,
    );
    await f.service.acceptPaymentNotification({
      id: "checkout-1",
      status: "PAID",
    });
    assert.equal(f.store.read().orders[0]!.state, "Confirmed");
  } finally {
    f.store.close();
  }
});
