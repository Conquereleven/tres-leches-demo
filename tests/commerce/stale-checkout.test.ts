import { fixtureAddressGeo } from "../fixtures/website-address";
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
  readWebCheckoutStatus,
  canonicalCartHash,
  dubaiToday,
  addDays,
} from "../../server/domain/web-checkout";
import { reconcileEmbeddedPayment } from "../../server/domain/embedded-checkout";
function fixture(price = 3600) {
  const store = new Store(":memory:", "test");
  store.write((s) => {
    s.catalog = ["sku-a", "sku-b", "sku-variant"].map((id) => ({
      id,
      name: id,
      priceFils: price,
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
for (const [price, oldQty, nextQty, oldAmount, nextAmount] of [
  [2500, 6, 15, 15000, 37500],
  [3600, 1, 3, 3600, 10800],
] as const)
  test(`${oldAmount / 100} → ${nextAmount / 100}: new provider object, preserved unpaid order, stale URL suppressed`, async () => {
    const f = fixture(price);
    try {
      const key = randomUUID();
      const old = await createWebCheckout(
        f.service,
        f.input(oldQty),
        key,
        "web",
        "https://fixture.invalid",
      );
      const input = f.input(nextQty);
      const replacement = resumeWebCheckout(f.service, {
        key,
        checkout: input,
      });
      assert.equal(replacement.changed, true);
      assert.equal(
        resumeWebCheckout(f.service, { key, checkout: input }).key,
        replacement.key,
      );
      assert.equal(old.amountFils, oldAmount);
      const fresh = await createWebCheckout(
        f.service,
        input,
        replacement.key,
        "web",
        "https://fixture.invalid",
      );
      const repeated = await createWebCheckout(
        f.service,
        input,
        replacement.key,
        "web",
        "https://fixture.invalid",
      );
      assert.equal(fresh.amountFils, nextAmount);
      assert.equal(fresh.orderId, repeated.orderId);
      assert.notEqual(fresh.url, old.url);
      assert.equal(f.posts(), 2);
      assert.equal(readWebCheckoutStatus(f.service, key).url, null);
      assert.equal(readWebCheckoutStatus(f.service, key).superseded, true);
      assert.equal(f.store.read().orders.length, 2);
      const previousPayment = f.store
        .read()
        .payments.find((p) => p.orderId === old.orderId)!;
      assert.equal(previousPayment.status, "pending");
      assert.ok(previousPayment.supersededAt);
      assert.ok(
        f.store
          .read()
          .orders.find((o) => o.id === old.orderId)!
          .audit.some((a) => a.action.includes("superseded")),
      );
      await assert.rejects(
        createWebCheckout(
          f.service,
          f.input(oldQty),
          key,
          "web",
          "https://fixture.invalid",
        ),
        /Cart changed/,
      );
    } finally {
      f.store.close();
    }
  });
test("canonical sort, product/variant/price/fulfillment differences and identical resume", async () => {
  const f = fixture();
  try {
    const key = randomUUID(),
      input = f.input();
    const old = await createWebCheckout(
      f.service,
      input,
      key,
      "web",
      "https://fixture.invalid",
    );
    assert.equal(
      resumeWebCheckout(f.service, { key, checkout: input }).status?.orderId,
      old.orderId,
    );
    assert.equal(f.posts(), 1);
    const a = {
      lines: [
        { productId: "sku-a", quantity: 1 },
        { productId: "sku-b", quantity: 1 },
      ],
      zoneId: "jlt-cluster-c",
    };
    assert.equal(
      canonicalCartHash(f.service, a),
      canonicalCartHash(f.service, { ...a, lines: [...a.lines].reverse() }),
    );
    const base = canonicalCartHash(f.service, f.cart(input));
    assert.notEqual(base, canonicalCartHash(f.service, a));
    assert.notEqual(
      base,
      canonicalCartHash(f.service, f.cart(f.input(1, "sku-variant"))),
    );
    assert.notEqual(
      base,
      canonicalCartHash(f.service, {
        lines: input.lines,
        fulfillmentMethod: "pickup",
      }),
    );
    f.store.write((s) => {
      s.catalog![0]!.priceFils = 4000;
    });
    assert.notEqual(base, canonicalCartHash(f.service, f.cart(input)));
    assert.equal(
      resumeWebCheckout(f.service, { key, checkout: input }).changed,
      false,
    );
  } finally {
    f.store.close();
  }
});
test("paid order is immutable; cart change creates a separate checkout", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    const old = await createWebCheckout(
      f.service,
      f.input(),
      key,
      "web",
      "https://fixture.invalid",
    );
    for (const checkout of f.checkouts.values()) checkout.status = "PAID";
    await reconcileEmbeddedPayment(f.service, key);
    const before = JSON.stringify(
      f.store.read().orders.find((o) => o.id === old.orderId),
    );
    const paymentBefore = JSON.stringify(
      f.store.read().payments.find((p) => p.orderId === old.orderId),
    );
    const input = f.input(3);
    const replacement = resumeWebCheckout(f.service, {
      key,
      checkout: input,
    });
    const fresh = await createWebCheckout(
      f.service,
      input,
      replacement.key,
      "web",
      "https://fixture.invalid",
    );
    assert.equal(fresh.amountFils, 10800);
    assert.notEqual(fresh.orderId, old.orderId);
    assert.equal(
      JSON.stringify(f.store.read().orders.find((o) => o.id === old.orderId)),
      before,
    );
    assert.equal(
      JSON.stringify(
        f.store.read().payments.find((p) => p.orderId === old.orderId),
      ),
      paymentBefore,
    );
  } finally {
    f.store.close();
  }
});
test("uncertain or authorized previous payment cannot be superseded blindly", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    await createWebCheckout(
      f.service,
      f.input(),
      key,
      "web",
      "https://fixture.invalid",
    );
    f.store.write((s) => {
      s.payments[0]!.status = "authorized";
    });
    assert.throws(
      () => resumeWebCheckout(f.service, { key, checkout: f.input(3) }),
      /must be verified/,
    );
    assert.equal(f.posts(), 1);
    assert.equal(f.store.read().payments[0]!.supersededAt, undefined);
  } finally {
    f.store.close();
  }
});
for (const change of ["product", "variant", "fulfillment"] as const)
  test(`${change} change creates a fresh checkout without the previous URL`, async () => {
    const f = fixture();
    try {
      const key = randomUUID();
      const old = await createWebCheckout(
        f.service,
        f.input(),
        key,
        "web",
        "https://fixture.invalid",
      );
      const input = f.input(1, change === "variant" ? "sku-variant" : "sku-a");
      if (change === "product")
        input.lines.push({ productId: "sku-b", quantity: 1 });
      if (change === "fulfillment")
        input.delivery.building = "Different Fixture Tower";
      const replacement = resumeWebCheckout(f.service, {
        key,
        checkout: input,
      });
      const fresh = await createWebCheckout(
        f.service,
        input,
        replacement.key,
        "web",
        "https://fixture.invalid",
      );
      assert.notEqual(fresh.url, old.url);
      assert.notEqual(fresh.orderId, old.orderId);
      assert.equal(fresh.amountFils, change === "product" ? 7200 : 3600);
      assert.equal(readWebCheckoutStatus(f.service, key).url, null);
      assert.equal(f.posts(), 2);
    } finally {
      f.store.close();
    }
  });
test("late authoritative payment for superseded order stays on the original order", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    const old = await createWebCheckout(
      f.service,
      f.input(),
      key,
      "web",
      "https://fixture.invalid",
    );
    const replacement = resumeWebCheckout(f.service, {
      key,
      checkout: f.input(3),
    });
    const fresh = await createWebCheckout(
      f.service,
      f.input(3),
      replacement.key,
      "web",
      "https://fixture.invalid",
    );
    const oldId = f.store
      .read()
      .payments.find((p) => p.orderId === old.orderId)!.providerCheckoutId!;
    f.checkouts.get(oldId)!.status = "PAID";
    await reconcileEmbeddedPayment(f.service, key);
    await reconcileEmbeddedPayment(f.service, key);
    assert.equal(readWebCheckoutStatus(f.service, key).paymentStatus, "paid");
    assert.equal(readWebCheckoutStatus(f.service, key).url, null);
    assert.equal(
      readWebCheckoutStatus(f.service, replacement.key).paymentStatus,
      "pending",
    );
    assert.equal(
      f.store.read().payments.find((p) => p.orderId === fresh.orderId)!
        .amountFils,
      10800,
    );
    assert.equal(f.posts(), 2);
  } finally {
    f.store.close();
  }
});
test("pre-release records recover the frozen hash without duplicating a paid order", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    const old = await createWebCheckout(
      f.service,
      f.input(),
      key,
      "web",
      "https://fixture.invalid",
    );
    for (const checkout of f.checkouts.values()) checkout.status = "PAID";
    await reconcileEmbeddedPayment(f.service, key);
    f.store.write((s) => {
      for (const receipt of Object.values(s.webCheckouts!))
        delete receipt.cartHash;
    });
    const oldPayment = JSON.stringify(f.store.read().payments[0]);
    const resume = resumeWebCheckout(f.service, { key, checkout: f.input() });
    assert.equal(resume.key, key);
    assert.equal(resume.changed, false);
    assert.equal(resume.status?.orderId, old.orderId);
    assert.equal(f.posts(), 1);
    assert.equal(JSON.stringify(f.store.read().payments[0]), oldPayment);
    f.store.write((s) => {
      s.catalog![0]!.priceFils = 4000;
    });
    assert.equal(
      resumeWebCheckout(f.service, { key, checkout: f.input() }).changed,
      false,
    );
  } finally {
    f.store.close();
  }
});
