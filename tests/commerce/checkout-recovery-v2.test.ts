import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import {
  createWebCheckout,
  recoverWebCheckout,
  readWebCheckoutStatus,
  addDays,
  dubaiToday,
} from "../../server/domain/web-checkout";
import { fixtureAddressGeo } from "../fixtures/website-address";

function fixture(path = ":memory:") {
  const store = new Store(path, "test");
  store.write((s) => {
    s.catalog = [
      {
        id: "fixture-recovery",
        name: "Synthetic bakery",
        priceFils: 3600,
        active: true,
        availability: "available",
      },
    ];
  });
  const checkouts = new Map<string, Record<string, unknown>>();
  let posts = 0,
    gets = 0,
    failedGet = false,
    mismatch = false;
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url, init) => {
      if (init?.method === "POST") {
        posts++;
        const id = randomUUID();
        const checkout = {
          ...JSON.parse(String(init.body)),
          id,
          status: "PENDING",
          redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
        };
        checkouts.set(id, checkout);
        return Response.json({ success: true, result: checkout });
      }
      gets++;
      if (failedGet) throw new Error("Synthetic timeout");
      const checkout = checkouts.get(String(url).split("/").at(-1)!);
      return Response.json({
        success: true,
        result: { ...checkout, ...(mismatch ? { amount: 1 } : {}) },
      });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
    fixtureAddressGeo,
  );
  service.deliveryAddressMode = "legacy";
  service.operationsManagerPhone = "+971500000001";
  const input = (quantity = 3) => ({
    lines: [{ productId: "fixture-recovery", quantity }],
    delivery: {
      zoneId: "jlt-cluster-c",
      address: "Synthetic address",
      building: "Fixture Tower",
      date: addDays(dubaiToday(), 2),
      slot: "4:00 PM – 9:00 PM",
    },
    customer: {
      firstName: "Synthetic",
      lastName: "Buyer",
      phone: "0500000000",
      email: "fixture@example.invalid",
    },
    billing: { sameAsDelivery: true },
  });
  const create = (key: string, body: unknown = input()) =>
    createWebCheckout(service, body, key, "web", "https://fixture.invalid");
  const setStatus = (value: string, index = 0) => {
    const payment = store.read().payments[index]!;
    checkouts.get(payment.providerCheckoutId!)!.status = value;
  };
  return {
    store,
    service,
    provider,
    input,
    create,
    setStatus,
    counts: () => ({ posts, gets }),
    failGet: () => {
      failedGet = true;
    },
    mismatch: () => {
      mismatch = true;
    },
  };
}

test("recovery checks provider before reusing pending URL; paid truth never offers another attempt", async () => {
  const f = fixture();
  try {
    const key = randomUUID(),
      first = await f.create(key);
    const pending = await recoverWebCheckout(f.service, {
      key,
      checkout: f.input(),
    });
    assert.equal(pending.status?.url, first.url);
    assert.equal(f.counts().gets, 1);
    f.setStatus("PAID");
    const paid = await recoverWebCheckout(f.service, {
      key,
      checkout: f.input(),
    });
    assert.equal(paid.status?.paymentStatus, "paid");
    assert.equal(paid.status?.url, null);
    assert.equal(paid.key, key);
    assert.equal(f.counts().posts, 1);
    assert.equal(f.store.read().orders[0]!.state, "Confirmed");
  } finally {
    f.store.close();
  }
});

for (const status of ["EXPIRED", "FAILED", "CANCELLED"])
  test(`authoritative ${status} reserves one successor, preserves frozen original and creates only on explicit pay`, async () => {
    const f = fixture();
    try {
      const key = randomUUID();
      await f.create(key);
      const snapshot = JSON.stringify(
        f.store.read().orders[0]!.catalogSnapshot,
      );
      f.setStatus(status);
      const recovered = await recoverWebCheckout(f.service, {
        key,
        checkout: f.input(),
      });
      assert.ok(recovered.key && recovered.key !== key);
      assert.equal(recovered.status, undefined);
      assert.equal(f.counts().posts, 1);
      assert.equal(f.store.read().orders.length, 1);
      assert.equal(f.store.read().operationsNotifications?.length ?? 0, 0);
      const replay = await recoverWebCheckout(f.service, {
        key,
        checkout: f.input(),
      });
      assert.equal(replay.key, recovered.key);
      const current = await f.create(recovered.key!);
      assert.equal(f.counts().posts, 2);
      assert.equal(current.amountFils, 10800);
      assert.equal(f.store.read().orders[0]!.state, "Building");
      assert.equal(f.store.read().orders[1]!.state, "Awaiting Payment");
      assert.equal(
        JSON.stringify(f.store.read().orders[0]!.catalogSnapshot),
        snapshot,
      );
      const resumed = await recoverWebCheckout(f.service, {
        key,
        checkout: f.input(),
      });
      assert.equal(resumed.key, recovered.key);
      assert.equal(resumed.status?.url, current.url);
      assert.equal(f.counts().posts, 2);
      f.setStatus("PAID", 1);
      await f.service.reconcile(f.store.read().payments[1]!.id, {
        id: "fixture-admin",
        role: "admin",
      });
      await f.service.reconcile(f.store.read().payments[1]!.id, {
        id: "fixture-admin",
        role: "admin",
      });
      assert.equal(f.store.read().operationsNotifications?.length, 1);
    } finally {
      f.store.close();
    }
  });

for (const status of ["PENDING", "AUTHORIZED", "PENDING_CONFIRMATION"])
  test(`${status} cannot be retired because the cart changed`, async () => {
    const f = fixture();
    try {
      const key = randomUUID();
      await f.create(key);
      f.setStatus(status);
      await assert.rejects(
        recoverWebCheckout(f.service, { key, checkout: f.input(4) }),
      );
      assert.equal(f.counts().posts, 1);
      assert.equal(f.store.read().orders.length, 1);
      assert.equal(readWebCheckoutStatus(f.service, key).superseded, false);
    } finally {
      f.store.close();
    }
  });

for (const failure of ["timeout", "mismatch"] as const)
  test(`provider ${failure} holds without exposing the stale URL or reserving another key`, async () => {
    const f = fixture();
    try {
      const key = randomUUID();
      await f.create(key);
      if (failure === "timeout") f.failGet();
      else f.mismatch();
      await assert.rejects(
        recoverWebCheckout(f.service, { key, checkout: f.input() }),
        /held for review/,
      );
      assert.equal(f.counts().posts, 1);
      assert.equal(
        Object.values(f.store.read().webCheckouts!)[0]!.recoveryKey,
        undefined,
      );
    } finally {
      f.store.close();
    }
  });

test("replacement revalidates catalog price/minimum/coverage/date; never edits the accepted snapshot", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    await f.create(key);
    f.setStatus("EXPIRED");
    const snapshot = JSON.stringify(f.store.read().orders[0]!.catalogSnapshot);
    const invalid = f.input();
    invalid.delivery.date = dubaiToday();
    await assert.rejects(
      recoverWebCheckout(f.service, { key, checkout: invalid }),
    );
    f.store.write((s) => {
      s.zones.find((z) => z.id === "jlt-cluster-c")!.minOrderAed = 200;
    });
    await assert.rejects(
      recoverWebCheckout(f.service, { key, checkout: f.input() }),
    );
    f.store.write((s) => {
      s.zones.find((z) => z.id === "jlt-cluster-c")!.minOrderAed = 30;
      s.zones.find((z) => z.id === "jlt-cluster-c")!.active = false;
    });
    await assert.rejects(
      recoverWebCheckout(f.service, { key, checkout: f.input() }),
    );
    f.store.write((s) => {
      s.zones.find((z) => z.id === "jlt-cluster-c")!.active = true;
      s.catalog![0]!.priceFils = 4000;
    });
    const fresh = await recoverWebCheckout(f.service, {
      key,
      checkout: f.input(),
    });
    assert.equal(fresh.quote?.totalFils, 12000);
    const accepted = await f.create(fresh.key!);
    assert.equal(accepted.amountFils, 12000);
    assert.equal(
      JSON.stringify(f.store.read().orders[0]!.catalogSnapshot),
      snapshot,
    );
  } finally {
    f.store.close();
  }
});

test("a changed live price cannot display a different total alongside an accepted pending URL", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    await f.create(key);
    f.store.write((s) => {
      s.catalog![0]!.priceFils = 4000;
    });
    const recovered = await recoverWebCheckout(f.service, {
      key,
      checkout: f.input(),
    });
    assert.equal(recovered.status?.amountFils, 10800);
    assert.equal(recovered.quote?.totalFils, 12000);
    assert.equal(recovered.status?.actionRequired, "review_payment");
    assert.equal(recovered.status?.url, null);
    assert.equal(f.store.read().payments[0]!.amountFils, 10800);
    assert.equal(f.counts().posts, 1);
  } finally {
    f.store.close();
  }
});

test("a late paid predecessor blocks a reserved replacement before any new provider POST", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    await f.create(key);
    f.setStatus("EXPIRED");
    const fresh = await recoverWebCheckout(f.service, {
      key,
      checkout: f.input(),
    });
    f.setStatus("PAID");
    await assert.rejects(f.create(fresh.key!), /held for review/);
    assert.equal(f.counts().posts, 1);
    assert.equal(f.store.read().orders.length, 1);
    assert.equal(f.store.read().orders[0]!.state, "Building");
    assert.equal(f.store.read().operationsNotifications?.length ?? 0, 0);
  } finally {
    f.store.close();
  }
});

test("two independent SQLite workers and restart share one reserved successor", async () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-recovery-"));
  const path = join(dir, "state.sqlite");
  const f = fixture(path);
  let second: Store | undefined;
  try {
    const key = randomUUID();
    await f.create(key);
    f.setStatus("EXPIRED");
    second = new Store(path, "test");
    const worker = new CommerceService(
      second,
      new DisabledWhatsAppProvider(),
      f.provider,
      fixtureAddressGeo,
    );
    worker.deliveryAddressMode = "legacy";
    const results = await Promise.all([
      recoverWebCheckout(f.service, { key, checkout: f.input() }),
      recoverWebCheckout(worker, { key, checkout: f.input() }),
    ]);
    assert.equal(results[0].key, results[1].key);
    assert.ok(results[0].key !== key);
    const successor = results[0].key!;
    const created = await Promise.all([
      f.create(successor),
      createWebCheckout(
        worker,
        f.input(),
        successor,
        "web",
        "https://fixture.invalid",
      ),
    ]);
    assert.equal(created[0].orderId, created[1].orderId);
    assert.equal(f.counts().posts, 2);
    second.close();
    second = undefined;
    const reopened = new Store(path, "test");
    try {
      assert.equal(
        Object.values(reopened.read().webCheckouts!).find((r) => r.recoveryKey)
          ?.recoveryKey,
        successor,
      );
    } finally {
      reopened.close();
    }
  } finally {
    second?.close();
    f.store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
