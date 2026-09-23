import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { validateCatalog } from "../../server/domain/catalog";
import { createWebCheckout } from "../../server/domain/web-checkout";
import {
  submitEmbeddedPayment,
  reconcileEmbeddedPayment,
  tokenSubmissionSchema,
  retryEmbeddedPayment,
} from "../../server/domain/embedded-checkout";
const input = {
  productId: "pan-de-muerto",
  quantity: 2,
  zoneId: "jlt-cluster-c",
  customer: "UAT Reviewer",
  phone: "0000000000",
  address: "UAT JLT Cluster C",
};
function fixture(initial = "CAPTURED") {
  const store = new Store(":memory:", "test");
  store.write((s) => {
    s.catalog = validateCatalog(
      JSON.parse(readFileSync("data-imports/pan-de-muerto.json", "utf8")),
    );
  });
  let posts = 0,
    gets = 0,
    status = initial,
    checkout: Record<string, unknown> = {};
  const provider = new PaymenntProvider(
    { apiKey: "test-fixture", apiSecret: "test-secret", environment: "test" },
    async (url, options) => {
      if (options?.method === "POST") {
        posts++;
        assert.match(String(url), /\/payment\/debit$/);
        const body = JSON.parse(String(options.body));
        assert.equal(body.checkoutDetails.amount, 50);
        assert.equal(body.checkoutDetails.items[0].unitprice, 25);
        assert.equal(body.source.storeCardDetails, false);
        checkout = { ...body.checkoutDetails, id: "checkout-fixture" };
      } else {
        gets++;
        assert.match(String(url), /\/payment\/payment-fixture$/);
      }
      return Response.json({
        success: true,
        result: {
          id: "payment-fixture",
          amount: 50,
          currency: "AED",
          status,
          redirectUrl:
            "https://pay.test.paymennt.com/frames/redirect/payment/payment-fixture",
          checkoutDetails: {
            ...checkout,
            status:
              status === "CAPTURED"
                ? "PAID"
                : status === "FAILED"
                  ? "FAILED"
                  : "PENDING",
          },
        },
      });
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
    counts: () => ({ posts, gets }),
    capture: () => {
      status = "CAPTURED";
    },
  };
}
test("embedded capture uses trusted AED 50, immediately confirms, stores no token and blocks duplicate sends", async () => {
  const f = fixture();
  const key = randomUUID();
  try {
    const order = await createWebCheckout(f.service, input, key, true);
    assert.equal(f.counts().posts, 0);
    assert.equal(f.store.read().jobs.length, 0);
    const request = {
      key,
      orderId: order.orderId,
      email: "uat@example.invalid",
      token: "ptk_test_fixturetokenonly",
    };
    const [one] = await Promise.all([
      submitEmbeddedPayment(f.service, request, "https://test.example"),
      submitEmbeddedPayment(f.service, request, "https://test.example"),
    ]);
    assert.equal(one.status, "Confirmed");
    assert.equal(one.paymentStatus, "paid");
    assert.equal(f.counts().posts, 1);
    assert.equal(f.counts().gets, 0);
    assert.ok(!JSON.stringify(f.store.read()).includes(request.token));
    await submitEmbeddedPayment(f.service, request, "https://test.example");
    assert.equal(f.counts().posts, 1);
  } finally {
    f.store.close();
  }
});
test("3DS stays pending until authoritative GET captures, repeated return is safe", async () => {
  const f = fixture("REDIRECT");
  const key = randomUUID();
  try {
    const order = await createWebCheckout(f.service, input, key, true);
    const result = await submitEmbeddedPayment(
      f.service,
      {
        key,
        orderId: order.orderId,
        email: "uat@example.invalid",
        token: "ptk_test_fixturetokenonly",
      },
      "https://test.example",
    );
    assert.equal(result.paymentStatus, "pending");
    assert.match(result.url!, /frames\/redirect/);
    f.capture();
    assert.equal(
      (await reconcileEmbeddedPayment(f.service, key)).status,
      "Confirmed",
    );
    await reconcileEmbeddedPayment(f.service, key);
    assert.equal(f.counts().posts, 1);
    assert.equal(f.counts().gets, 2);
  } finally {
    f.store.close();
  }
});
test("strict token boundary rejects raw card fields, prices and browser payment status", () => {
  for (const field of [
    "pan",
    "cardNumber",
    "cvv",
    "expiry",
    "amount",
    "status",
    "currency",
  ]) {
    assert.equal(
      tokenSubmissionSchema.safeParse({
        key: randomUUID(),
        orderId: "order",
        email: "uat@example.invalid",
        token: "ptk_test_fixturetokenonly",
        [field]: "untrusted",
      }).success,
      false,
    );
  }
});
test("changed catalog price fails before token debit", async () => {
  const f = fixture();
  const key = randomUUID();
  try {
    const order = await createWebCheckout(f.service, input, key, true);
    f.store.write((s) => {
      s.catalog![0]!.priceFils = 3000;
    });
    await assert.rejects(
      submitEmbeddedPayment(
        f.service,
        {
          key,
          orderId: order.orderId,
          email: "uat@example.invalid",
          token: "ptk_test_fixturetokenonly",
        },
        "https://test.example",
      ),
    );
    assert.equal(f.counts().posts, 0);
  } finally {
    f.store.close();
  }
});
test("failed provider result never confirms the order", async () => {
  const f = fixture("FAILED");
  const key = randomUUID();
  try {
    const order = await createWebCheckout(f.service, input, key, true);
    const result = await submitEmbeddedPayment(
      f.service,
      {
        key,
        orderId: order.orderId,
        email: "uat@example.invalid",
        token: "ptk_test_fixturetokenonly",
      },
      "https://test.example",
    );
    assert.equal(result.paymentStatus, "failed");
    assert.notEqual(result.status, "Confirmed");
  } finally {
    f.store.close();
  }
});

test("explicit retry of authoritative failure keeps order and creates one new attempt", async () => {
  const f = fixture("FAILED");
  const key = randomUUID();
  try {
    const order = await createWebCheckout(f.service, input, key, true);
    await submitEmbeddedPayment(
      f.service,
      {
        key,
        orderId: order.orderId,
        email: "uat@example.invalid",
        token: "ptk_test_fixturetokenonly",
      },
      "https://test.example",
    );
    const retry = await retryEmbeddedPayment(f.service, key);
    assert.equal(retry.orderId, order.orderId);
    assert.equal(retry.paymentStatus, "creating");
    assert.equal(f.store.read().jobs.length, 0);
  } finally {
    f.store.close();
  }
});
