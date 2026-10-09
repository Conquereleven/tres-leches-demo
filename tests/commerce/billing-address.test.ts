import { fixtureAddressGeo } from "../fixtures/website-address";
/**
 * Regression for TEST order TL-903498EB: Paymennt answered /payment/debit with
 * HTTP 400 "Parameter checkoutDetails.billingAddress must not be null."
 *
 * The transport below behaves like Paymennt for that rule, and records every
 * debit body so the tests can prove none is ever sent without a valid
 * billingAddress.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import {
  PaymenntProvider,
  paymenntAddressSchema,
} from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { validateCatalog } from "../../server/domain/catalog";
import {
  addDays,
  createWebCheckout,
  dubaiToday,
} from "../../server/domain/web-checkout";
import {
  reconcileEmbeddedPayment,
  retryEmbeddedPayment,
  submitEmbeddedPayment,
} from "../../server/domain/embedded-checkout";

type Body = { checkoutDetails: Record<string, unknown> };
const delivery = {
  zoneId: "jlt-cluster-c",
  address: "Jumeirah Lakes Towers, Cluster C",
  building: "Test Tower",
  unit: "101",
  date: addDays(dubaiToday(), 2),
  slot: "4:00 PM – 9:00 PM",
  notes: "Call on arrival",
};
const checkout = (billing?: unknown) => ({
  lines: [{ productId: "pan-de-muerto", quantity: 2 }],
  delivery,
  customer: {
    name: "Test Customer",
    phone: "050 000 0000",
    email: "customer@example.com",
  },
  ...(billing === undefined ? {} : { billing }),
});
const separate = {
  sameAsDelivery: false,
  name: "Billing Person",
  address1: "Office 12, Example Business Tower",
  address2: "Business Bay",
  city: "Dubai",
  zip: "00000",
  country: "ae",
};

function fixture() {
  const store = new Store(":memory:", "test");
  store.write((s) => {
    s.catalog = validateCatalog(
      JSON.parse(
        readFileSync("tests/fixtures/retired-pan-de-muerto.json", "utf8"),
      ),
    );
  });
  const debits: Body[] = [];
  let gets = 0;
  const provider = new PaymenntProvider(
    { apiKey: "test-fixture", apiSecret: "test-secret", environment: "test" },
    async (_url, options) => {
      if (options?.method !== "POST") {
        gets++;
        return Response.json({ success: false }, { status: 404 });
      }
      const body = JSON.parse(String(options.body)) as Body;
      debits.push(body);
      if (body.checkoutDetails.billingAddress == null)
        return Response.json(
          {
            success: false,
            error: "Parameter checkoutDetails.billingAddress must not be null.",
          },
          { status: 400 },
        );
      return Response.json({
        success: true,
        result: {
          id: `payment-${debits.length}`,
          amount: body.checkoutDetails.amount,
          currency: "AED",
          status: "CAPTURED",
          checkoutDetails: {
            ...body.checkoutDetails,
            id: `checkout-${debits.length}`,
            status: "PAID",
          },
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
  return { store, service, provider, debits, gets: () => gets };
}
const token = "ptk_test_fixturetokenonly";
async function payWith(f: ReturnType<typeof fixture>, billing: unknown) {
  const key = randomUUID();
  const order = await createWebCheckout(
    f.service,
    checkout(billing),
    key,
    true,
  );
  const submission = {
    key,
    orderId: order.orderId,
    email: "c@example.com",
    token,
  };
  const result = await submitEmbeddedPayment(
    f.service,
    submission,
    "https://3l.example",
  );
  return { key, order, submission, result };
}

test("regression TL-903498EB: a debit is never sent without a valid billingAddress", async () => {
  const f = fixture();
  const { result } = await payWith(f, { sameAsDelivery: true });
  assert.equal(result.paymentStatus, "paid");
  assert.equal(f.debits.length, 1);
  for (const body of f.debits) {
    assert.notEqual(body.checkoutDetails.billingAddress, null);
    assert.notEqual(body.checkoutDetails.billingAddress, undefined);
    assert.ok(
      paymenntAddressSchema.safeParse(body.checkoutDetails.billingAddress)
        .success,
    );
  }
});

test("the adapter refuses a null or missing billingAddress before any request", async () => {
  const f = fixture();
  const base = {
    token,
    paymentId: randomUUID(),
    orderId: "TL-TEST",
    amountFils: 5000,
    items: [
      {
        sku: "pan-de-muerto",
        name: "Pan de Muerto",
        quantity: 2,
        unitPriceFils: 2500,
      },
    ],
    feeFils: 0,
    customer: {
      firstName: "Test",
      lastName: "Customer",
      email: "c@example.com",
      phone: "+971500000000",
    },
    deliveryAddress: {
      name: "Test Customer",
      address1: "Unit 101, Test Tower",
      city: "Dubai",
      country: "AE",
    },
    returnUrl: "https://3l.example/checkout/return",
  };
  for (const billingAddress of [
    null,
    undefined,
    { name: "Test Customer", address1: "", city: "Dubai", country: "AE" },
    { name: "Test Customer", address1: "Unit 101", country: "AE" },
  ])
    await assert.rejects(
      f.provider.createTokenPayment({
        ...base,
        billingAddress: billingAddress as never,
      }),
    );
  assert.equal(f.debits.length, 0, "no request reached /payment/debit");
});

test("billing same as delivery is derived from the confirmed delivery address", async () => {
  const f = fixture();
  const { order } = await payWith(f, { sameAsDelivery: true });
  const details = f.debits[0]!.checkoutDetails;
  const expected = {
    name: "Test Customer",
    address1: "Unit 101, Test Tower",
    address2: "Jumeirah Lakes Towers, Cluster C",
    city: "Dubai",
    country: "AE",
  };
  assert.deepEqual(details.billingAddress, expected);
  assert.deepEqual(details.deliveryAddress, expected);
  const stored = f.store.read().orders.find((o) => o.id === order.orderId)!;
  assert.deepEqual(stored.billing, { sameAsDelivery: true, address: expected });
});

test("a separate billing address is sent as entered; delivery stays intact", async () => {
  const f = fixture();
  const { order } = await payWith(f, separate);
  const details = f.debits[0]!.checkoutDetails;
  assert.deepEqual(details.billingAddress, {
    name: "Billing Person",
    address1: "Office 12, Example Business Tower",
    address2: "Business Bay",
    city: "Dubai",
    zip: "00000",
    country: "AE",
  });
  assert.deepEqual(details.deliveryAddress, {
    name: "Test Customer",
    address1: "Unit 101, Test Tower",
    address2: "Jumeirah Lakes Towers, Cluster C",
    city: "Dubai",
    country: "AE",
  });
  const stored = f.store.read().orders.find((o) => o.id === order.orderId)!;
  assert.deepEqual(stored.delivery, {
    ...delivery,
    addressVerification: "VERIFIED",
  });
  assert.equal(stored.billing?.sameAsDelivery, false);
});

test("missing or incomplete billing blocks checkout before any order or provider call", async () => {
  const f = fixture();
  const incomplete = [
    undefined,
    null,
    {},
    { sameAsDelivery: false },
    { ...separate, city: "" },
    { ...separate, address1: "   " },
    { ...separate, name: undefined },
    { ...separate, country: "United Arab Emirates" },
  ];
  for (const billing of incomplete)
    await assert.rejects(
      createWebCheckout(
        f.service,
        billing === undefined ? checkout() : checkout(billing),
        randomUUID(),
        true,
      ),
    );
  assert.equal(f.store.read().orders.length, 0);
  assert.equal(f.debits.length, 0);
});

test("the charged amount stays AED 50 with free JLT Cluster C delivery", async () => {
  const f = fixture();
  const { result } = await payWith(f, { sameAsDelivery: true });
  const details = f.debits[0]!.checkoutDetails;
  assert.equal(result.amountFils, 5000);
  assert.equal(details.amount, 50);
  assert.equal(details.currency, "AED");
  assert.deepEqual(details.totals, { subtotal: 50, tax: 0, shipping: 0 });
});

test("repeated submissions create one order, one payment and one debit", async () => {
  const f = fixture();
  const { key, submission } = await payWith(f, { sameAsDelivery: true });
  await submitEmbeddedPayment(f.service, submission, "https://3l.example");
  await createWebCheckout(
    f.service,
    checkout({ sameAsDelivery: true }),
    key,
    true,
  );
  const s = f.store.read();
  assert.equal(s.orders.length, 1);
  assert.equal(s.payments.length, 1);
  assert.equal(f.debits.length, 1);
});

test("an order stored without billing cannot be debited and is not frozen by trying", async () => {
  const f = fixture();
  const key = randomUUID();
  const order = await createWebCheckout(
    f.service,
    checkout({ sameAsDelivery: true }),
    key,
    true,
  );
  f.store.write((s) => {
    delete s.orders.find((o) => o.id === order.orderId)!.billing;
  });
  await assert.rejects(
    submitEmbeddedPayment(
      f.service,
      { key, orderId: order.orderId, email: "c@example.com", token },
      "https://3l.example",
    ),
    /billing/i,
  );
  const payment = f.store.read().payments[0]!;
  assert.equal(payment.directAttempt, "ready", "still payable once fixed");
  assert.equal(f.debits.length, 0);
});

test("a held payment (like TL-903498EB) is never debited, retried or changed", async () => {
  const f = fixture();
  const key = randomUUID();
  const order = await createWebCheckout(
    f.service,
    checkout({ sameAsDelivery: true }),
    key,
    true,
  );
  // Reproduce the frozen record: an attempt whose outcome is unknown, with
  // no provider paymentId and no billing address (it predates this fix).
  f.store.write((s) => {
    const o = s.orders.find((o) => o.id === order.orderId)!;
    delete o.billing;
    const p = s.payments.find((p) => p.id === o.paymentId)!;
    p.directAttempt = "unknown";
  });
  const snapshot = () => {
    const s = f.store.read();
    const o = s.orders.find((o) => o.id === order.orderId)!;
    return JSON.stringify({
      o,
      p: s.payments.find((p) => p.id === o.paymentId),
      notifications: s.operationsNotifications ?? [],
    });
  };
  const before = snapshot();
  const submission = {
    key,
    orderId: order.orderId,
    email: "c@example.com",
    token,
  };
  const status = await submitEmbeddedPayment(
    f.service,
    submission,
    "https://3l.example",
  );
  assert.equal(status.actionRequired, "review_payment");
  await assert.rejects(
    retryEmbeddedPayment(f.service, key),
    /not confirmed failed/,
  );
  const again = await createWebCheckout(
    f.service,
    checkout({ sameAsDelivery: true }),
    key,
    true,
  );
  assert.equal(
    again.orderId,
    order.orderId,
    "same key never opens a new order",
  );
  // CHECK AGAIN: reconciliation only, and without a paymentId no provider call.
  await reconcileEmbeddedPayment(f.service, key);
  assert.equal(snapshot(), before);
  assert.equal(f.debits.length, 0);
  assert.equal(f.gets(), 0);
});
