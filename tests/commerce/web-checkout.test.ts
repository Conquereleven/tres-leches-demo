/** Claude's checkout audit cases, extended for atomic receipts and capability-based status. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { PaymenntNotificationVerifier } from "../../server/adapters/paymennt-notification";
import {
  createWebCheckout,
  readWebCheckoutStatus,
  quoteWebCheckout,
  webCheckoutSchema,
} from "../../server/domain/web-checkout";
import { validateCatalog } from "../../server/domain/catalog";
const catalog = validateCatalog(
  JSON.parse(readFileSync("tests/fixtures/retired-pan-de-muerto.json", "utf8")),
);
const input = (quantity = 2) => ({
  productId: "pan-de-muerto",
  quantity,
  zoneId: "jlt-cluster-c",
  customer: "UAT reviewer",
  phone: "0000000000",
  address: "UAT building, apartment 1, JLT Cluster C",
});
function fixture(path = ":memory:") {
  const store = new Store(path, "test");
  store.write((s) => {
    s.catalog = catalog;
  });
  let creates = 0,
    status = "PENDING",
    fail = false;
  let checkout: Record<string, unknown> = {};
  const verifier = new PaymenntNotificationVerifier("fixture-hmac-key");
  const provider = new PaymenntProvider(
    { apiKey: "fixture-key", apiSecret: "fixture-secret", environment: "test" },
    async (url, init) => {
      if (init?.method === "POST") {
        creates++;
        const data = JSON.parse(String(init.body));
        checkout = {
          ...data,
          id: "fixture-checkout",
          redirectUrl: "https://pay.test.paymennt.com/checkout/fixture",
        };
        if (fail) throw Error("uncertain connection");
      } else assert.match(String(url), /\/checkout\/fixture-checkout$/);
      return Response.json({ success: true, result: { ...checkout, status } });
    },
    verifier,
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
  );
  return {
    store,
    service,
    verifier,
    creates: () => creates,
    status: (s: string) => {
      status = s;
    },
    fail: () => {
      fail = true;
    },
  };
}
test("canonical product, authoritative JLT zone, quantity 2 = AED 50 and zero delivery", async () => {
  const f = fixture();
  try {
    assert.equal(catalog[0]?.priceFils, 2500);
    const z = f.store.read().zones.find((z) => z.id === "jlt-cluster-c")!;
    assert.equal(z.minOrderAed, 30);
    assert.equal(z.deliveryFeeAed, 0);
    assert.equal(z.freeDelivery, true);
    assert.match(z.review!, /confirmed/);
    const q = quoteWebCheckout(f.service, {
      productId: "pan-de-muerto",
      quantity: 2,
      zoneId: z.id,
    });
    assert.equal(q.subtotalFils, 5000);
    assert.equal(q.feeFils, 0);
    assert.equal(q.totalFils, 5000);
    assert.equal(q.eligible, true);
    const r = await createWebCheckout(f.service, input(), randomUUID());
    assert.equal(r.amountFils, 5000);
    assert.equal(r.currency, "AED");
    assert.equal(r.paymentStatus, "pending");
    assert.ok(r.url);
    assert.equal(
      f.store.read().jobs.filter((j) => j.kind === "message").length,
      0,
    );
  } finally {
    f.store.close();
  }
});
test("quantity 1 rejects minimum atomically, leaving no draft or payment", async () => {
  const f = fixture();
  try {
    await assert.rejects(
      createWebCheckout(f.service, input(1), randomUUID()),
      /mínimo/,
    );
    assert.equal(f.store.read().orders.length, 0);
    assert.equal(f.store.read().conversations.length, 0);
    assert.equal(f.creates(), 0);
  } finally {
    f.store.close();
  }
});
for (const [name, value] of Object.entries({
  amount: 1,
  amountFils: 999999,
  priceFils: 1,
  currency: "USD",
  deliveryFee: 0,
  total: 1,
  status: "paid",
}))
  test(`browser ${name} cannot control payment`, async () => {
    const f = fixture();
    try {
      await assert.rejects(
        createWebCheckout(
          f.service,
          { ...input(), [name]: value },
          randomUUID(),
        ),
      );
      assert.equal(f.creates(), 0);
      assert.equal(f.store.read().payments.length, 0);
    } finally {
      f.store.close();
    }
  });
test("unknown product, missing catalog and unresolved fee zones fail closed", async () => {
  const f = fixture();
  try {
    await assert.rejects(
      createWebCheckout(
        f.service,
        { ...input(), productId: "unknown" },
        randomUUID(),
      ),
    );
    const unknownFee = f.store
      .read()
      .zones.find((z) => z.deliveryFeeAed === null)!;
    await assert.rejects(
      createWebCheckout(
        f.service,
        { ...input(), zoneId: unknownFee.id },
        randomUUID(),
      ),
    );
    f.store.write((s) => {
      s.catalog = [];
    });
    await assert.rejects(createWebCheckout(f.service, input(), randomUUID()));
    assert.equal(f.creates(), 0);
  } finally {
    f.store.close();
  }
});
test("parallel clicks and replay produce one provider checkout, and changed input is rejected", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    await Promise.all(
      Array.from({ length: 8 }, () =>
        createWebCheckout(f.service, input(), key),
      ),
    );
    const a = await createWebCheckout(f.service, input(), key);
    const b = readWebCheckoutStatus(f.service, key);
    assert.deepEqual(a, b);
    assert.equal(f.creates(), 1);
    assert.equal(f.store.read().orders.length, 1);
    assert.equal(f.store.read().payments.length, 1);
    await assert.rejects(
      createWebCheckout(f.service, input(3), key),
      /different details/,
    );
  } finally {
    f.store.close();
  }
});
test("uncertain provider failure keeps receipt and never creates another checkout on retry", async () => {
  const f = fixture();
  try {
    f.fail();
    const key = randomUUID();
    const first = await createWebCheckout(f.service, input(), key);
    const second = await createWebCheckout(f.service, input(), key);
    assert.equal(first.url, null);
    assert.equal(second.url, null);
    assert.equal(f.creates(), 1);
    assert.equal(f.store.read().jobs[0]?.status, "unknown");
  } finally {
    f.store.close();
  }
});
test("receipt survives database reopen; status requires capability, never phone or URL status", async () => {
  const dir = mkdtempSync(join(tmpdir(), "web-checkout-"));
  try {
    const path = join(dir, "state.sqlite");
    const f = fixture(path),
      key = randomUUID();
    const first = await createWebCheckout(f.service, input(), key);
    f.store.close();
    const next = fixture(path);
    try {
      const replay = await createWebCheckout(next.service, input(), key);
      assert.equal(replay.orderId, first.orderId);
      assert.equal(next.creates(), 0);
      assert.equal(
        readWebCheckoutStatus(next.service, key).paymentStatus,
        "pending",
      );
      assert.throws(
        () => readWebCheckoutStatus(next.service, randomUUID()),
        /not found/,
      );
      assert.throws(() =>
        webCheckoutSchema.parse({ ...input(), status: "paid" }),
      );
    } finally {
      next.store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
for (const status of ["PAID", "FAILED", "CANCELLED", "EXPIRED"])
  test(`signed notification + authoritative GET handles ${status} once`, async () => {
    const f = fixture();
    try {
      const key = randomUUID();
      await createWebCheckout(f.service, input(), key);
      const event = {
        id: "fixture-checkout",
        status,
        statusUpdateTimestamp: "2026-09-22T00:00:00Z",
      };
      const raw = Buffer.from(JSON.stringify(event));
      const { createHmac } = await import("node:crypto");
      const sig = createHmac("sha256", "fixture-hmac-key")
        .update(raw)
        .digest("base64");
      assert.equal(f.verifier.verify(raw, sig), true);
      assert.equal(
        f.verifier.verify(Buffer.concat([raw, Buffer.from(" ")]), sig),
        false,
      );
      f.status(status);
      await f.service.acceptPaymentNotification(event);
      await f.service.acceptPaymentNotification(event);
      const r = readWebCheckoutStatus(f.service, key);
      assert.equal(r.paymentStatus, status.toLowerCase());
      assert.equal(r.status === "Confirmed", status === "PAID");
      assert.equal(f.store.read().paymentNotifications?.length, 1);
      assert.equal(f.creates(), 1);
    } finally {
      f.store.close();
    }
  });
