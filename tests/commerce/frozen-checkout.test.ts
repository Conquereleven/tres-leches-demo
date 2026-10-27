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
import { ProviderFailure } from "../../server/adapters/failure";
import { fixtureAddressGeo } from "../fixtures/website-address";
import {
  createWebCheckout,
  resumeWebCheckout,
  readWebCheckoutStatus,
  quoteWebCheckout,
  dubaiToday,
  addDays,
} from "../../server/domain/web-checkout";
function fixture(path = ":memory:", hook?: () => Promise<void | Response>) {
  const store = new Store(path, "test");
  store.write((s) => {
    s.catalog = ["sku-a", "sku-b", "sku-variant"].map((id) => ({
      id,
      name: id,
      priceFils: 3600,
      active: true,
      availability: "available" as const,
      description: "Fixture",
    }));
  });
  const checkouts = new Map<string, Record<string, unknown>>();
  let posts = 0;
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url, init) => {
      if (init?.method === "POST") {
        posts++;
        if (hook) {
          const response = await hook();
          if (response) return response;
        }
        const body = JSON.parse(String(init.body));
        const id = randomUUID();
        checkouts.set(id, {
          ...body,
          id,
          status: "PENDING",
          redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
        });
        return Response.json({ success: true, result: checkouts.get(id) });
      }
      return Response.json({
        success: true,
        result: checkouts.get(String(url).split("/").at(-1)!),
      });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
    fixtureAddressGeo,
  );
  const input = (quantity = 1, sku = "sku-a") => ({
    lines: [{ productId: sku, quantity }],
    delivery: {
      zoneId: "jlt-cluster-c",
      address: "Fixture only address",
      building: "Fixture Tower",
      date: addDays(dubaiToday(), 2),
      slot: "4:00 PM – 9:00 PM",
    },
    customer: {
      name: "Fixture Customer",
      phone: "0500000000",
      email: "fixture@example.invalid",
    },
    billing: { sameAsDelivery: true },
  });
  const cart = (body: ReturnType<typeof input>) => ({
    lines: body.lines,
    zoneId: body.delivery.zoneId,
  });
  return { store, service, input, cart, checkouts, posts: () => posts };
}
const origin = "https://fixture.invalid";
function hold(f: ReturnType<typeof fixture>) {
  const drain = f.service.drain.bind(f.service);
  f.service.drain = async () => {};
  return () => {
    f.service.drain = drain;
    return drain();
  };
}
function payload(f: ReturnType<typeof fixture>) {
  return [...f.checkouts.values()][0]!;
}

test("preaccept price change rejects displayed revision atomically; fresh quote accepts current price", async () => {
  const f = fixture();
  try {
    const revision = quoteWebCheckout(
      f.service,
      f.cart(f.input()),
    ).quoteRevision;
    f.store.write((s) => {
      s.catalog![0]!.priceFils = 4200;
    });
    await assert.rejects(
      createWebCheckout(
        f.service,
        f.input(),
        randomUUID(),
        "web",
        origin,
        revision,
      ),
      /cart price or availability changed/,
    );
    assert.equal(f.store.read().orders.length, 0);
    assert.equal(f.posts(), 0);
    const current = quoteWebCheckout(
      f.service,
      f.cart(f.input()),
    ).quoteRevision;
    const result = await createWebCheckout(
      f.service,
      f.input(),
      randomUUID(),
      "web",
      origin,
      current,
    );
    assert.equal(result.amountFils, 4200);
    f.store.write((s) => {
      s.catalog![0]!.active = false;
    });
    await assert.rejects(
      createWebCheckout(f.service, f.input(), randomUUID(), "web", origin),
      /unavailable|no disponible/i,
    );
    assert.equal(f.posts(), 1);
  } finally {
    f.store.close();
  }
});

for (const change of ["price", "deactivate", "remove", "rename"] as const)
  test(`postaccept ${change}: frozen provider lines, replay and resume`, async () => {
    const f = fixture();
    const drain = hold(f);
    try {
      const key = randomUUID();
      await createWebCheckout(f.service, f.input(), key, "web", origin);
      const before = JSON.stringify(f.store.read().orders[0]);
      f.store.write((s) => {
        if (change === "price") s.catalog![0]!.priceFils = 4200;
        if (change === "deactivate") s.catalog![0]!.active = false;
        if (change === "remove") s.catalog = [];
        if (change === "rename") s.catalog![0]!.name = "Changed name";
      });
      assert.equal(
        resumeWebCheckout(f.service, { key, checkout: f.input() }).changed,
        false,
      );
      await drain();
      const replay = await createWebCheckout(
        f.service,
        f.input(),
        key,
        "web",
        origin,
      );
      assert.equal(f.posts(), 1);
      assert.equal(replay.amountFils, 3600);
      assert.deepEqual(payload(f).items, [
        {
          sku: "sku-a",
          name: "sku-a",
          quantity: 1,
          unitprice: 36,
          linetotal: 36,
        },
      ]);
      assert.equal(replay.summary!.items[0]!.lineFils, 3600);
      assert.equal(JSON.stringify(f.store.read().orders[0]), before);
    } finally {
      f.store.close();
    }
  });

test("delayed creation plus simultaneous workers/replays create one checkout", async () => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((r) => (entered = r));
  const gate = new Promise<void>((r) => (release = r));
  const f = fixture(":memory:", async () => {
    entered();
    await gate;
  });
  try {
    const key = randomUUID();
    const first = createWebCheckout(f.service, f.input(), key, "web", origin);
    await started;
    f.store.write((s) => {
      s.catalog![0]!.priceFils = 9999;
    });
    await Promise.all([
      f.service.drain(),
      ...Array.from({ length: 8 }, () =>
        createWebCheckout(f.service, f.input(), key, "web", origin),
      ),
    ]);
    assert.equal(f.posts(), 1);
    release();
    await first;
    assert.equal(payload(f).amount, 36);
    assert.equal(f.store.read().payments.length, 1);
  } finally {
    release();
    f.store.close();
  }
});

test("pending checkout survives restart and new catalog without repricing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-frozen-"));
  const path = join(dir, "state.sqlite");
  const first = fixture(path);
  const key = randomUUID();
  hold(first);
  try {
    await createWebCheckout(first.service, first.input(), key, "web", origin);
    first.store.close();
    const next = fixture(path);
    try {
      next.store.write((s) => {
        s.catalog![0]!.priceFils = 9999;
      });
      await Promise.all([
        next.service.drain(),
        createWebCheckout(next.service, next.input(), key, "web", origin),
      ]);
      assert.equal(next.posts(), 1);
      assert.equal(payload(next).amount, 36);
    } finally {
      next.store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const defect of [
  "missing",
  "partial",
  "price",
  "fee",
  "amount",
  "currency",
  "duplicate",
] as const)
  test(`incomplete/inconsistent frozen ${defect} fails closed with no historical fabrication`, async () => {
    const f = fixture();
    const drain = hold(f);
    const key = randomUUID();
    try {
      await createWebCheckout(f.service, f.input(), key, "web", origin);
      f.store.write((s) => {
        const o = s.orders[0]!,
          p = s.payments[0]!;
        if (defect === "missing") delete o.catalogSnapshot;
        if (defect === "partial") o.catalogSnapshot = [];
        if (defect === "price") o.catalogSnapshot![0]!.priceFils++;
        if (defect === "fee") o.quote!.feeFils = -1;
        if (defect === "amount") p.amountFils++;
        if (defect === "currency") Object.assign(p, { currency: "USD" });
        if (defect === "duplicate")
          o.catalogSnapshot!.push({ ...o.catalogSnapshot![0]! });
      });
      const historical = JSON.stringify(f.store.read().orders);
      assert.equal(readWebCheckoutStatus(f.service, key).summary, undefined);
      assert.equal(
        readWebCheckoutStatus(f.service, key).actionRequired,
        "review_payment",
      );
      assert.equal(readWebCheckoutStatus(f.service, key).url, null);
      assert.throws(
        () => resumeWebCheckout(f.service, { key, checkout: f.input() }),
        /Frozen checkout/,
      );
      await assert.rejects(
        createWebCheckout(f.service, f.input(), key, "web", origin),
        /Frozen checkout/,
      );
      await drain();
      assert.equal(f.posts(), 0);
      assert.equal(JSON.stringify(f.store.read().orders), historical);
    } finally {
      f.store.close();
    }
  });

test("historical multi-SKU and explicit stored fee agree with provider totals", async () => {
  const f = fixture();
  const drain = hold(f);
  const key = randomUUID();
  try {
    const input = {
      ...f.input(2),
      lines: [
        { productId: "sku-a", quantity: 2 },
        { productId: "sku-b", quantity: 3 },
      ],
    };
    await createWebCheckout(f.service, input, key, "web", origin);
    // Historical charge fixture only; current delivery rules are not changed.
    f.store.write((s) => {
      s.orders[0]!.quote!.feeFils = 500;
      s.orders[0]!.quote!.totalFils = 18500;
      s.payments[0]!.amountFils = 18500;
      s.catalog = [];
    });
    await drain();
    assert.equal(payload(f).amount, 185);
    assert.deepEqual(payload(f).totals, { subtotal: 180, tax: 0, shipping: 5 });
    assert.equal((payload(f).items as unknown[]).length, 2);
    assert.equal(readWebCheckoutStatus(f.service, key).summary!.feeFils, 500);
  } finally {
    f.store.close();
  }
});

for (const certainty of ["rejected", "unknown"] as const)
  test(`provider ${certainty} after acceptance never duplicates on replay`, async () => {
    const f = fixture(":memory:", async () => {
      if (certainty === "rejected")
        return Response.json({ success: false }, { status: 400 });
      throw new ProviderFailure(certainty, false);
    });
    try {
      const key = randomUUID();
      await createWebCheckout(f.service, f.input(), key, "web", origin);
      f.store.write((s) => {
        s.catalog = [];
      });
      await createWebCheckout(f.service, f.input(), key, "web", origin);
      await f.service.drain();
      assert.equal(f.posts(), 1);
      assert.equal(f.store.read().payments.length, 1);
      assert.equal(
        f.store.read().jobs.find((j) => j.kind === "payment")!.status,
        certainty === "unknown" ? "unknown" : "failed",
      );
    } finally {
      f.store.close();
    }
  });

test("expired same cart creates fresh priced replacement, never reuses expired URL", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    await createWebCheckout(f.service, f.input(), key, "web", origin);
    payload(f).status = "EXPIRED";
    await f.service.reconcile(f.store.read().payments[0]!.id, {
      id: "fixture-admin",
      role: "admin",
    });
    f.store.write((s) => {
      s.catalog![0]!.priceFils = 4200;
    });
    const next = resumeWebCheckout(f.service, { key, checkout: f.input() });
    assert.equal(next.changed, true);
    const result = await createWebCheckout(
      f.service,
      f.input(),
      next.key,
      "web",
      origin,
    );
    assert.equal(result.amountFils, 4200);
    assert.equal(f.posts(), 2);
  } finally {
    f.store.close();
  }
});

test("independent SQLite connections share the durable worker lease", async () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-frozen-race-"));
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((r) => (entered = r));
  const gate = new Promise<void>((r) => (release = r));
  const path = join(dir, "state.sqlite");
  const first = fixture(path);
  const drainFirst = hold(first);
  const key = randomUUID();
  let second: ReturnType<typeof fixture> | undefined;
  try {
    await createWebCheckout(first.service, first.input(), key, "web", origin);
    second = fixture(path, async () => {
      entered();
      await gate;
    });
    const working = second.service.drain();
    await started;
    first.store.write((s) => {
      s.catalog![0]!.priceFils = 9999;
    });
    await drainFirst();
    await createWebCheckout(first.service, first.input(), key, "web", origin);
    assert.equal(first.posts(), 0);
    release();
    await working;
    assert.equal(second.posts(), 1);
    assert.equal(first.store.read().payments.length, 1);
  } finally {
    release();
    second?.store.close();
    first.store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a stale processing lease is held for reconciliation rather than recreated", async () => {
  const f = fixture();
  hold(f);
  try {
    const key = randomUUID();
    await createWebCheckout(f.service, f.input(), key, "web", origin);
    f.store.write((s) => {
      const j = s.jobs.find((j) => j.kind === "payment")!;
      j.status = "processing";
      j.attempts = 1;
      j.leaseUntil = Date.now() - 1;
    });
    // Model a restart by reattaching the actual drain implementation.
    await CommerceService.prototype.drain.call(f.service);
    assert.equal(f.posts(), 0);
    assert.equal(
      f.store.read().jobs.find((j) => j.kind === "payment")!.status,
      "unknown",
    );
    assert.equal(
      readWebCheckoutStatus(f.service, key).actionRequired,
      "review_payment",
    );
  } finally {
    f.store.close();
  }
});

test("late worker result does not overwrite a paid payment or historical order", async () => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((r) => (entered = r)),
    gate = new Promise<void>((r) => (release = r));
  const f = fixture(":memory:", async () => {
    entered();
    await gate;
  });
  try {
    const key = randomUUID();
    const working = createWebCheckout(f.service, f.input(), key, "web", origin);
    await started;
    // Concurrent authoritative reconciliation is represented by its committed state.
    f.store.write((s) => {
      s.payments[0]!.status = "paid";
      s.orders[0]!.state = "Confirmed";
    });
    const paid = JSON.stringify(f.store.read().payments),
      order = JSON.stringify(f.store.read().orders);
    release();
    await working;
    assert.equal(JSON.stringify(f.store.read().payments), paid);
    assert.equal(JSON.stringify(f.store.read().orders), order);
    assert.equal(f.posts(), 1);
    assert.equal(readWebCheckoutStatus(f.service, key).paymentStatus, "paid");
  } finally {
    release();
    f.store.close();
  }
});
