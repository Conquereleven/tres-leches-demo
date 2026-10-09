import { fixtureAddressGeo } from "../fixtures/website-address";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import {
  PaymenntProvider,
  normalizeCheckout,
} from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { validateCatalog } from "../../server/domain/catalog";
import {
  createWebCheckout,
  dubaiToday,
  addDays,
  readWebCheckoutStatus,
} from "../../server/domain/web-checkout";
import { reconcileEmbeddedPayment } from "../../server/domain/embedded-checkout";
const sku = "conchas-traditional-chocolate-mini-40-g";
const input = {
  lines: [{ productId: sku, quantity: 6 }],
  delivery: {
    zoneId: "jlt-cluster-c",
    address: "UAT address only",
    building: "UAT Tower",
    date: addDays(dubaiToday(), 2),
    slot: "4:00 PM – 9:00 PM",
  },
  customer: {
    name: "UAT Reviewer",
    phone: "0500000000",
    email: "uat@example.invalid",
  },
  billing: { sameAsDelivery: true },
};
function fixture(
  unknown = false,
  responseOverrides: Record<string, unknown> = {},
  environment: "test" | "live" = "test",
) {
  const store = new Store(":memory:", "test");
  store.write((s) => {
    s.catalog = validateCatalog(
      JSON.parse(readFileSync("data-imports/liza-current-menu.json", "utf8")),
    );
  });
  let posts = 0;
  let gets = 0;
  let status = "PENDING";
  let body: Record<string, unknown> = {};
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment },
    async (url, init) => {
      assert.ok(
        String(url).startsWith(
          environment === "live"
            ? "https://api.paymennt.com/mer/v2.0/checkout"
            : "https://api.test.paymennt.com/mer/v2.0/checkout",
        ),
      );
      if (init?.method === "POST") {
        assert.equal(
          String(url),
          environment === "live"
            ? "https://api.paymennt.com/mer/v2.0/checkout/web"
            : "https://api.test.paymennt.com/mer/v2.0/checkout/web",
        );
        posts++;
        body = JSON.parse(String(init.body));
        if (unknown) throw new Error("fixture lost response");
        return Response.json({
          success: true,
          result: {
            ...body,
            id: "checkout-fixture",
            status: "PAID",
            redirectUrl:
              environment === "live"
                ? "https://pay.paymennt.com/checkout/fixture"
                : "https://pay.test.paymennt.com/checkout/fixture",
            ...responseOverrides,
          },
        });
      }
      gets++;
      if (String(url).includes("?requestId="))
        return Response.json({
          success: true,
          result: {
            totalPages: 1,
            content: [
              {
                ...body,
                id: "checkout-fixture",
                status,
                redirectUrl:
                  environment === "live"
                    ? "https://pay.paymennt.com/checkout/fixture"
                    : "https://pay.test.paymennt.com/checkout/fixture",
              },
            ],
          },
        });
      return Response.json({
        success: true,
        result: {
          ...body,
          id: "checkout-fixture",
          status,
          redirectUrl:
            environment === "live"
              ? "https://pay.paymennt.com/checkout/fixture"
              : "https://pay.test.paymennt.com/checkout/fixture",
        },
      });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
    fixtureAddressGeo,
  );
  return {
    store,
    service,
    counts: () => ({ posts, gets }),
    body: () => body,
    status: (s: string) => {
      status = s;
    },
  };
}
test("web checkout preserves pricing/addresses and concurrent requests create once; only GET can confirm paid", async () => {
  const f = fixture();
  const key = randomUUID();
  try {
    await Promise.all([
      createWebCheckout(
        f.service,
        input,
        key,
        "web",
        "https://test.example.invalid",
      ),
      createWebCheckout(
        f.service,
        input,
        key,
        "web",
        "https://test.example.invalid",
      ),
    ]);
    assert.equal(f.counts().posts, 1);
    assert.equal(
      readWebCheckoutStatus(f.service, key).paymentStatus,
      "pending",
    );
    assert.equal(f.store.read().orders[0]!.state, "Awaiting Payment");
    assert.equal(f.body().amount, 66);
    assert.equal(
      f.body().returnUrl,
      "https://test.example.invalid/checkout/return",
    );
    assert.ok(f.body().billingAddress);
    assert.ok(f.body().deliveryAddress);
    assert.equal(
      f.store.read().jobs.filter((j) => j.kind === "message").length,
      0,
    );
    f.status("PAID");
    await reconcileEmbeddedPayment(f.service, key);
    await reconcileEmbeddedPayment(f.service, key);
    assert.equal(readWebCheckoutStatus(f.service, key).paymentStatus, "paid");
    assert.equal(f.store.read().orders[0]!.state, "Confirmed");
    assert.equal(f.counts().posts, 1);
    assert.equal(f.store.read().operationsNotifications?.length, 1);
  } finally {
    f.store.close();
  }
});
test("unknown web creation is recovered by lookup and GET, never a second POST", async () => {
  const f = fixture(true);
  const key = randomUUID();
  try {
    await createWebCheckout(
      f.service,
      input,
      key,
      "web",
      "https://test.example.invalid",
    );
    assert.equal(
      readWebCheckoutStatus(f.service, key).actionRequired,
      "review_payment",
    );
    await createWebCheckout(
      f.service,
      input,
      key,
      "web",
      "https://test.example.invalid",
    );
    assert.equal(f.counts().posts, 1);
    await reconcileEmbeddedPayment(f.service, key);
    assert.equal(
      readWebCheckoutStatus(f.service, key).paymentStatus,
      "pending",
    );
    assert.ok(f.counts().gets >= 2);
  } finally {
    f.store.close();
  }
});
for (const [raw, expected] of Object.entries({
  Pending: "pending",
  Authorized: "authorized",
  Paid: "paid",
  Failed: "failed",
  Cancelled: "cancelled",
  Expired: "expired",
  Refunded: "refunded",
  "Partially refunded": "partially_refunded",
})) {
  test(`provider state ${raw} maps safely`, () => {
    assert.equal(
      normalizeCheckout({
        id: "c",
        requestId: "r",
        orderId: "o",
        amount: 11,
        currency: "AED",
        status: raw,
      }).status,
      expected,
    );
  });
}
for (const providerStatus of [
  "AUTHORIZED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]) {
  test(`authoritative ${providerStatus} never creates ORDER_PAID`, async () => {
    const f = fixture();
    const key = randomUUID();
    try {
      await createWebCheckout(
        f.service,
        input,
        key,
        "web",
        "https://test.example.invalid",
      );
      f.status(providerStatus);
      await reconcileEmbeddedPayment(f.service, key);
      assert.notEqual(
        readWebCheckoutStatus(f.service, key).paymentStatus,
        "paid",
      );
      assert.equal(f.store.read().operationsNotifications?.length ?? 0, 0);
      assert.equal(f.counts().posts, 1);
    } finally {
      f.store.close();
    }
  });
}

for (const [name, overrides] of Object.entries({
  "foreign redirect": {
    redirectUrl: "https://untrusted.example.invalid/checkout",
  },
  "amount mismatch": { amount: 67 },
  "request mismatch": { requestId: "another-payment" },
})) {
  test(`web creation rejects ${name} and holds without exposing redirect or paying`, async () => {
    const f = fixture(false, overrides);
    const key = randomUUID();
    try {
      await createWebCheckout(
        f.service,
        input,
        key,
        "web",
        "https://test.example.invalid",
      );
      const result = readWebCheckoutStatus(f.service, key);
      assert.equal(result.url, null);
      assert.equal(result.actionRequired, "review_payment");
      assert.notEqual(result.paymentStatus, "paid");
      assert.equal(f.store.read().operationsNotifications?.length ?? 0, 0);
    } finally {
      f.store.close();
    }
  });
}

test("pickup hosted checkout: no zone/minimum/shipping address; server pricing and authoritative reconciliation remain intact", async () => {
  const f = fixture();
  const key = randomUUID();
  const pickupInput = {
    fulfillmentMethod: "pickup",
    lines: [{ productId: sku, quantity: 1 }],
    pickup: {
      pickupDate: addDays(dubaiToday(), 2),
      preferredTime: "4:00 PM – 9:00 PM",
    },
    customer: input.customer,
    billing: {
      sameAsDelivery: false,
      name: "UAT Reviewer",
      address1: "Billing fixture address",
      city: "Dubai",
      country: "AE",
    },
  };
  try {
    const result = await createWebCheckout(
      f.service,
      pickupInput,
      key,
      "web",
      "https://test.example.invalid",
    );
    assert.equal(result.amountFils, 1100);
    assert.equal(result.paymentStatus, "pending");
    assert.deepEqual(result.summary?.pickup, pickupInput.pickup);
    assert.equal(result.summary?.delivery, undefined);
    assert.equal(f.body().deliveryAddress, undefined);
    assert.deepEqual(f.body().totals, { subtotal: 11, tax: 0, shipping: 0 });
    const order = f.store.read().orders[0]!;
    assert.equal(order.fulfillmentMethod, "pickup");
    assert.equal(order.quote?.zoneId, null);
    assert.equal(order.manualZoneId, undefined);
    assert.equal(order.delivery, undefined);
    assert.equal(order.quote?.feeFils, 0);
    assert.equal(order.state, "Awaiting Payment");
    await createWebCheckout(
      f.service,
      pickupInput,
      key,
      "web",
      "https://test.example.invalid",
    );
    assert.equal(f.counts().posts, 1);
    f.status("PAID");
    await reconcileEmbeddedPayment(f.service, key);
    await reconcileEmbeddedPayment(f.service, key);
    assert.equal(f.store.read().orders[0]!.state, "Confirmed");
    assert.equal(f.store.read().operationsNotifications?.length, 1);
  } finally {
    f.store.close();
  }
});

test("LIVE hosted mock routes exclusively to LIVE; authoritative repeated GET confirms once", async () => {
  const f = fixture(false, {}, "live");
  const key = randomUUID();
  try {
    const result = await createWebCheckout(
      f.service,
      input,
      key,
      "web",
      "https://www.3ldubai.ae",
    );
    assert.equal(result.url, "https://pay.paymennt.com/checkout/fixture");
    assert.equal(result.paymentStatus, "pending");
    assert.equal(f.body().returnUrl, "https://www.3ldubai.ae/checkout/return");
    await createWebCheckout(
      f.service,
      input,
      key,
      "web",
      "https://www.3ldubai.ae",
    );
    f.status("PAID");
    await reconcileEmbeddedPayment(f.service, key);
    await reconcileEmbeddedPayment(f.service, key);
    assert.equal(f.counts().posts, 1);
    assert.equal(f.store.read().orders.length, 1);
    assert.equal(f.store.read().payments.length, 1);
    assert.equal(f.store.read().operationsNotifications?.length, 1);
    assert.equal(readWebCheckoutStatus(f.service, key).status, "Confirmed");
  } finally {
    f.store.close();
  }
});

test("legacy accepts manual address/area, enforces minimum without fees and marks order for manual review", async () => {
  const f = fixture();
  f.service.deliveryAddressMode = "legacy";
  try {
    const raw = {
      ...input,
      delivery: {
        ...input.delivery,
        address: "Manual customer street",
        building: "Manual Tower",
        zoneId: "marina",
      },
    };
    const r = await createWebCheckout(
      f.service,
      raw,
      randomUUID(),
      "web",
      "https://fixture.example.invalid",
    );
    const order = f.store.read().orders.find((o) => o.id === r.orderId)!;
    assert.equal(order.delivery?.address, raw.delivery.address);
    assert.equal(order.delivery?.zoneId, "marina");
    assert.equal(order.delivery?.addressVerification, "UNVERIFIED");
    assert.equal(order.quote?.feeFils, 0);
    assert.equal(order.quote?.totalFils, order.quote?.subtotalFils);
    const before = f.counts();
    await assert.rejects(
      createWebCheckout(
        f.service,
        { ...raw, lines: [{ productId: sku, quantity: 1 }] },
        randomUUID(),
        "web",
        "https://fixture.example.invalid",
      ),
      /Minimum order/,
    );
    assert.deepEqual(f.counts(), before);
    await assert.rejects(
      createWebCheckout(
        f.service,
        { ...raw, delivery: { ...raw.delivery, zoneId: "unknown-area" } },
        randomUUID(),
        "web",
        "https://fixture.example.invalid",
      ),
      /available delivery area/,
    );
  } finally {
    f.store.close();
  }
});

test("google overrides manipulated area with trusted community and never falls back to manual", async () => {
  const f = fixture();
  f.service.deliveryAddressMode = "google";
  try {
    const raw = {
      ...input,
      lines: [
        { productId: sku, quantity: 20 },
        { productId: "conchas-filled-pistache-mini", quantity: 6 },
      ],
      delivery: {
        ...input.delivery,
        address: "Verified Downtown fixture",
        zoneId: "jlt-cluster-c",
      },
    };
    const r = await createWebCheckout(
      f.service,
      raw,
      randomUUID(),
      "web",
      "https://fixture.example.invalid",
    );
    const order = f.store.read().orders.find((o) => o.id === r.orderId)!;
    assert.equal(order.delivery?.zoneId, "downtown");
    assert.equal(order.delivery?.addressVerification, "VERIFIED");
    assert.equal(order.quote?.minOrderAed, 300);
    const before = f.counts();
    await assert.rejects(
      createWebCheckout(
        f.service,
        {
          ...raw,
          delivery: {
            ...raw.delivery,
            address: "Unknown manually typed address",
          },
        },
        randomUUID(),
        "web",
        "https://fixture.example.invalid",
      ),
      /could not verify/,
    );
    assert.deepEqual(f.counts(), before);
  } finally {
    f.store.close();
  }
});

test("UAT V2: optional WhatsApp and storefront identity persist without rewriting historical orders", async () => {
  const f = fixture();
  try {
    await createWebCheckout(
      f.service,
      input,
      randomUUID(),
      "web",
      "https://test.example.invalid",
    );
    const historical = JSON.stringify(f.store.read().orders[0]);
    assert.equal(
      f.store.read().orders[0]!.customerDetails?.whatsappNumber,
      undefined,
    );
    await createWebCheckout(
      f.service,
      {
        ...input,
        customer: { ...input.customer, whatsappNumber: "+52 (55) 1234-5678" },
      },
      randomUUID(),
      "web",
      "https://test.example.invalid",
    );
    const order = f.store.read().orders[1]!;
    assert.equal(order.customerDetails?.whatsappNumber, "+525512345678");
    assert.equal(
      order.storefrontProducts?.[sku],
      "conchas-traditional--chocolate",
    );
    assert.equal(JSON.stringify(f.store.read().orders[0]), historical);
    await assert.rejects(() =>
      createWebCheckout(
        f.service,
        {
          ...input,
          customer: { ...input.customer, whatsappNumber: "5551234567" },
        },
        randomUUID(),
        "web",
        "https://test.example.invalid",
      ),
    );
    assert.equal(f.counts().posts, 2);
  } finally {
    f.store.close();
  }
});
