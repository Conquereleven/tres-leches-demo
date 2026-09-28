import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { validateCatalog } from "../../server/domain/catalog";
import {
  addDays,
  createWebCheckout,
  dubaiToday,
  readWebCheckoutStatus,
} from "../../server/domain/web-checkout";
import {
  submitEmbeddedPayment,
  reconcileEmbeddedPayment,
  tokenSubmissionSchema,
  retryEmbeddedPayment,
} from "../../server/domain/embedded-checkout";
const input = {
  lines: [{ productId: "pan-de-muerto", quantity: 2 }],
  delivery: {
    zoneId: "jlt-cluster-c",
    address: "UAT JLT Cluster C",
    building: "UAT Tower",
    date: addDays(dubaiToday(), 1),
    slot: "Afternoon",
  },
  customer: {
    name: "UAT Reviewer",
    phone: "0500000000",
    email: "uat@example.com",
  },
  billing: { sameAsDelivery: true },
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
        if (status === "NETWORK_UNKNOWN")
          throw new Error("fixture transport interruption");
        if (status === "TIMEOUT")
          throw new DOMException("fixture timeout", "TimeoutError");
        if (status === "MALFORMED")
          return new Response("not-json", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        if (status.startsWith("HTTP_")) {
          const httpStatus = Number(status.slice(5));
          return Response.json(
            {
              success: false,
              code: `SAFE_${httpStatus}`,
              error:
                "Rejected ptk_test_must_not_persist for leaked@customer.test card 4242424242424242",
            },
            { status: httpStatus },
          );
        }
        if (status === "SEMANTIC_REJECT")
          return Response.json({
            success: false,
            code: "PAYMENT_REJECTED",
            error: "Payment method rejected",
          });
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
    const payment = f.store.read().payments.at(-1)!;
    assert.equal(payment.transactionId, "payment-fixture");
    assert.equal(
      payment.providerDiagnostics?.at(-1)?.providerPaymentId,
      "payment-fixture",
    );
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
    assert.equal(
      f.store.read().payments.at(-1)?.transactionId,
      "payment-fixture",
    );
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

test("uncertain direct result exposes a review hold and never debits again", async () => {
  const f = fixture("NETWORK_UNKNOWN");
  const key = randomUUID();
  try {
    const order = await createWebCheckout(f.service, input, key, true);
    assert.equal(order.actionRequired, "complete_payment");
    const body = {
      key,
      orderId: order.orderId,
      email: "uat@example.invalid",
      token: "ptk_test_fixturetokenonly",
    };
    await assert.rejects(
      submitEmbeddedPayment(f.service, body, "https://test.example"),
    );
    const status = readWebCheckoutStatus(f.service, key);
    assert.equal(status.actionRequired, "review_payment");
    assert.notEqual(status.paymentStatus, "paid");
    await submitEmbeddedPayment(f.service, body, "https://test.example");
    await reconcileEmbeddedPayment(f.service, key);
    assert.equal(f.counts().posts, 1);
    assert.equal(f.counts().gets, 0);
    assert.ok(!JSON.stringify(f.store.read()).includes(body.token));
  } finally {
    f.store.close();
  }
});

test("direct provider failures persist only safe diagnostics and stay blocked", async () => {
  const cases = [
    ["HTTP_400", "PROVIDER_HTTP_ERROR", 400],
    ["HTTP_401", "PROVIDER_HTTP_ERROR", 401],
    ["HTTP_422", "PROVIDER_HTTP_ERROR", 422],
    ["HTTP_500", "PROVIDER_HTTP_ERROR", 500],
    ["TIMEOUT", "PROVIDER_TIMEOUT", undefined],
    ["MALFORMED", "PROVIDER_MALFORMED_RESPONSE", 200],
    ["SEMANTIC_REJECT", "PROVIDER_PAYMENT_REJECTED", 200],
  ] as const;
  for (const [mode, classification, providerHttpStatus] of cases) {
    const f = fixture(mode);
    const key = randomUUID();
    try {
      const order = await createWebCheckout(f.service, input, key, true);
      const token = "ptk_test_fixturetokenonly";
      await assert.rejects(
        submitEmbeddedPayment(
          f.service,
          {
            key,
            orderId: order.orderId,
            email: "uat@tests.invalid",
            token,
          },
          "https://test.example",
        ),
      );
      const payment = f.store.read().payments.at(-1)!;
      const diagnostic = payment.providerDiagnostics?.at(-1);
      assert.ok(diagnostic);
      assert.equal(diagnostic.classification, classification);
      assert.equal(diagnostic.providerHttpStatus, providerHttpStatus);
      assert.equal(diagnostic.endpointClass, "payment/debit");
      assert.equal(diagnostic.requestId, payment.id);
      assert.equal(diagnostic.orderId, order.orderId);
      assert.equal(diagnostic.attemptState, "unknown");
      assert.equal(payment.directAttempt, "unknown");
      const stored = JSON.stringify(f.store.read());
      assert.ok(!stored.includes(token));
      assert.ok(!stored.includes("4242424242424242"));
      assert.ok(!stored.includes("leaked@customer.test"));
      assert.ok(!stored.includes("test-secret"));
      await submitEmbeddedPayment(
        f.service,
        { key, orderId: order.orderId, email: "uat@tests.invalid", token },
        "https://test.example",
      );
      assert.equal(f.counts().posts, 1);
    } finally {
      f.store.close();
    }
  }
});
