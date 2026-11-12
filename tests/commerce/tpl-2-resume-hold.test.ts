import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import {
  createWebCheckout,
  resumeWebCheckout,
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

/** TPL-2 · P0 12 Nov 2026: a changed cart beside an open hosted attempt. */
const changes = {
  quantity: (b: ReturnType<ReturnType<typeof fixture>["input"]>) => {
    b.lines[0]!.quantity = 4;
  },
  slot: (b: ReturnType<ReturnType<typeof fixture>["input"]>) => {
    b.delivery.slot = "8:00 AM – 1:00 PM";
  },
  date: (b: ReturnType<ReturnType<typeof fixture>["input"]>) => {
    b.delivery.date = addDays(dubaiToday(), 3);
  },
  notes: (b: ReturnType<ReturnType<typeof fixture>["input"]>) => {
    Object.assign(b.delivery, { notes: "Synthetic note" });
  },
};
const changed = (f: ReturnType<typeof fixture>, kind: keyof typeof changes) => {
  const body = f.input();
  changes[kind](body);
  return body;
};

for (const kind of Object.keys(changes) as (keyof typeof changes)[])
  test(`TPL-2 changed ${kind} beside a PENDING attempt reports that attempt instead of a repeatable 409`, async () => {
    const f = fixture();
    try {
      const key = randomUUID(),
        first = await f.create(key);
      const before = JSON.stringify(f.store.read().orders[0]);
      for (let attempt = 0; attempt < 3; attempt++) {
        const held = await recoverWebCheckout(f.service, {
          key,
          checkout: changed(f, kind),
        });
        assert.equal(
          "conflict" in held && held.conflict,
          "previous_payment_open",
        );
        assert.equal(held.key, key);
        assert.equal(held.changed, false);
        assert.equal(held.status?.paymentStatus, "pending");
        assert.equal(held.status?.orderId, first.orderId);
        assert.equal(held.status?.amountFils, first.amountFils);
        assert.equal(held.status?.url, null);
      }
      // No new attempt, key, supersede or edit of the accepted order.
      assert.equal(f.counts().posts, 1);
      assert.equal(f.store.read().orders.length, 1);
      assert.equal(JSON.stringify(f.store.read().orders[0]), before);
      const record = Object.values(f.store.read().webCheckouts!)[0]!;
      assert.equal(record.recoveryKey, undefined);
      assert.equal(record.supersededAt, undefined);
      // Reverting to the original details continues the same safe session.
      const resumed = await recoverWebCheckout(f.service, {
        key,
        checkout: f.input(),
      });
      assert.equal(resumed.status?.url, first.url);
      assert.equal(f.counts().posts, 1);
    } finally {
      f.store.close();
    }
  });

for (const status of ["AUTHORIZED", "PENDING_CONFIRMATION"])
  test(`TPL-2 changed cart beside ${status} stays held for review with no URL or new key`, async () => {
    const f = fixture();
    try {
      const key = randomUUID();
      await f.create(key);
      f.setStatus(status);
      const held = await recoverWebCheckout(f.service, {
        key,
        checkout: changed(f, "quantity"),
      });
      assert.equal(
        "conflict" in held && held.conflict,
        "previous_payment_unverified",
      );
      assert.equal(held.status?.actionRequired, "review_payment");
      assert.equal(held.status?.url, null);
      assert.equal(held.key, key);
      assert.equal(f.counts().posts, 1);
      assert.equal(readWebCheckoutStatus(f.service, key).superseded, false);
    } finally {
      f.store.close();
    }
  });

test("TPL-2 an unreachable provider still blocks a changed cart; nothing is created", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    await f.create(key);
    f.failGet();
    await assert.rejects(
      recoverWebCheckout(f.service, { key, checkout: changed(f, "quantity") }),
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

test("TPL-2 a late provider PAID confirms the order once; a changed cart is then a separate purchase", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    await f.create(key);
    const held = await recoverWebCheckout(f.service, {
      key,
      checkout: changed(f, "quantity"),
    });
    assert.equal("conflict" in held && held.conflict, "previous_payment_open");
    f.setStatus("PAID");
    const same = await recoverWebCheckout(f.service, {
      key,
      checkout: f.input(),
    });
    assert.equal(same.status?.paymentStatus, "paid");
    assert.equal(same.status?.url, null);
    assert.equal(f.store.read().orders[0]!.state, "Confirmed");
    assert.equal(f.counts().posts, 1);
    const fresh = await recoverWebCheckout(f.service, {
      key,
      checkout: changed(f, "quantity"),
    });
    assert.equal(fresh.changed, true);
    assert.notEqual(fresh.key, key);
    const second = await f.create(fresh.key!, changed(f, "quantity"));
    assert.equal(f.counts().posts, 2);
    assert.equal(second.amountFils, 14400);
    // The paid order is untouched by the separate purchase.
    assert.equal(f.store.read().payments[0]!.status, "paid");
    assert.equal(f.store.read().payments[0]!.amountFils, 10800);
  } finally {
    f.store.close();
  }
});

for (const status of ["FAILED", "EXPIRED", "CANCELLED"])
  test(`TPL-2 an authoritative ${status} lets the changed cart start one new attempt`, async () => {
    const f = fixture();
    try {
      const key = randomUUID();
      await f.create(key);
      f.setStatus(status);
      const fresh = await recoverWebCheckout(f.service, {
        key,
        checkout: changed(f, "slot"),
      });
      assert.equal(fresh.changed, true);
      assert.ok(!("conflict" in fresh));
      const again = await recoverWebCheckout(f.service, {
        key,
        checkout: changed(f, "slot"),
      });
      assert.equal(again.key, fresh.key);
      await f.create(fresh.key!, changed(f, "slot"));
      await f.create(fresh.key!, changed(f, "slot"));
      assert.equal(f.counts().posts, 2);
    } finally {
      f.store.close();
    }
  });

test("TPL-2 two tabs with the same session and a changed cart never create or retire an attempt", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    await f.create(key);
    // Simultaneous: an in-flight provider check holds one tab (503), never a new attempt.
    const results = await Promise.allSettled([
      recoverWebCheckout(f.service, { key, checkout: changed(f, "quantity") }),
      recoverWebCheckout(f.service, { key, checkout: changed(f, "notes") }),
    ]);
    for (const r of results)
      if (r.status === "fulfilled")
        assert.equal(
          "conflict" in r.value && r.value.conflict,
          "previous_payment_open",
        );
      else assert.match(String(r.reason), /held for review/);
    assert.ok(results.some((r) => r.status === "fulfilled"));
    // Interleaved tabs: both report the same open attempt.
    for (const kind of ["quantity", "notes"] as const) {
      const tab = await recoverWebCheckout(f.service, {
        key,
        checkout: changed(f, kind),
      });
      assert.equal("conflict" in tab && tab.conflict, "previous_payment_open");
      assert.equal(tab.key, key);
    }
    assert.equal(f.counts().posts, 1);
    assert.equal(
      Object.values(f.store.read().webCheckouts!)[0]!.supersededAt,
      undefined,
    );
  } finally {
    f.store.close();
  }
});

test("TPL-2 the synchronous resume never retires an open attempt even without the provider GET", () => {
  const f = fixture();
  return (async () => {
    try {
      const key = randomUUID();
      await f.create(key);
      const held = resumeWebCheckout(f.service, {
        key,
        checkout: changed(f, "quantity"),
      });
      assert.ok("conflict" in held);
      assert.equal(held.key, key);
      assert.equal(f.store.read().payments[0]!.supersededAt, undefined);
    } finally {
      f.store.close();
    }
  })();
});
