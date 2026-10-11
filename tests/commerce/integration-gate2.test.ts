import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import {
  loadBootstrapSources,
  applyCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import { revisionFingerprint } from "../../server/catalog/contract";
import { publicCatalog } from "../../server/catalog/read-api";
import {
  createWebCheckout,
  resumeWebCheckout,
  readWebCheckoutStatus,
  quoteWebCheckout,
  dubaiToday,
  addDays,
} from "../../server/domain/web-checkout";
import { fixtureAddressGeo } from "../fixtures/website-address";

const sources = loadBootstrapSources(process.cwd());
const origin = "https://fixture.invalid";
function fixture() {
  const store = new Store(":memory:", "test");
  store.write((s) => {
    s.catalog = structuredClone(sources.approved);
  });
  const sku = sources.approved.find((p) => p.active && p.priceFils >= 3000)!;
  const sent: Record<string, unknown>[] = [];
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (_url, init) => {
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init.body));
      sent.push(body);
      return Response.json({
        success: true,
        result: {
          ...body,
          id: randomUUID(),
          status: "PENDING",
          redirectUrl: "https://pay.test.paymennt.com/checkout/fixture",
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
  const drain = service.drain.bind(service);
  service.drain = async () => {};
  const input = {
    lines: [{ productId: sku.id, quantity: 2 }],
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
  };
  const quoteInput = { lines: input.lines, zoneId: input.delivery.zoneId };
  return { store, service, drain, sku, sent, input, quoteInput };
}
function rehash(f: ReturnType<typeof fixture>) {
  f.store.write((s) => {
    const { revision: _old, ...metadata } = s.catalogFoundation!;
    const fingerprint = revisionFingerprint(metadata, s.catalog!);
    s.catalogFoundation!.revision = {
      id: `catalog-v1-${fingerprint}`,
      fingerprint,
      publishedAt: null,
    };
  });
}

test("PR7 bootstrap and shadow read preserve accepted checkout and quote revision", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    const quote = quoteWebCheckout(f.service, f.quoteInput);
    await createWebCheckout(
      f.service,
      f.input,
      key,
      "web",
      origin,
      quote.quoteRevision,
    );
    const before = f.store.read();
    assert.equal(applyCatalogBootstrap(f.store, sources).applied, true);
    assert.equal(applyCatalogBootstrap(f.store, sources).applied, false);
    publicCatalog(f.store.read(), { locale: "en" });
    const after = f.store.read();
    for (const field of [
      "orders",
      "payments",
      "conversations",
      "zones",
      "jobs",
      "webCheckouts",
    ] as const)
      assert.deepEqual(after[field], before[field]);
    assert.equal(
      quoteWebCheckout(f.service, f.quoteInput).quoteRevision,
      quote.quoteRevision,
    );
    await f.drain();
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0]!.amount, (f.sku.priceFils * 2) / 100);
  } finally {
    f.store.close();
  }
});

test("PR7 revision drift/publication cannot reprice PR9 accepted payload; new quotes use current prices", async () => {
  const f = fixture();
  try {
    applyCatalogBootstrap(f.store, sources);
    const key = randomUUID(),
      revision = quoteWebCheckout(f.service, f.quoteInput).quoteRevision;
    await createWebCheckout(f.service, f.input, key, "web", origin, revision);
    const accepted = structuredClone(f.store.read().orders[0]!);
    f.store.write((s) => {
      const p = s.catalog!.find((p) => p.id === f.sku.id)!;
      p.name = "Changed fixture name";
      p.priceFils += 100;
    });
    assert.throws(
      () => publicCatalog(f.store.read(), { locale: "en" }),
      /revision mismatch/,
    );
    rehash(f);
    publicCatalog(f.store.read(), { locale: "en" });
    assert.equal(
      resumeWebCheckout(f.service, { key, checkout: f.input }).changed,
      false,
    );
    await assert.rejects(
      createWebCheckout(
        f.service,
        f.input,
        randomUUID(),
        "web",
        origin,
        revision,
      ),
      /cart price or availability changed/,
    );
    assert.equal(f.store.read().orders.length, 1);
    await f.drain();
    await createWebCheckout(f.service, f.input, key, "web", origin, revision);
    assert.equal(f.sent.length, 1);
    assert.deepEqual(f.sent[0]!.items, [
      {
        sku: f.sku.id,
        name: f.sku.name,
        quantity: 2,
        unitprice: f.sku.priceFils / 100,
        linetotal: (f.sku.priceFils * 2) / 100,
      },
    ]);
    assert.deepEqual(f.store.read().orders[0], accepted);
    const current = quoteWebCheckout(f.service, f.quoteInput);
    const fresh = await createWebCheckout(
      f.service,
      f.input,
      randomUUID(),
      "web",
      origin,
      current.quoteRevision,
    );
    assert.equal(fresh.amountFils, (f.sku.priceFils + 100) * 2);
    assert.equal(
      readWebCheckoutStatus(f.service, key).summary!.items[0]!.name,
      f.sku.name,
    );
  } finally {
    f.store.close();
  }
});

test("PR7 cannot repair or reinterpret incomplete paid history from current catalog", async () => {
  const f = fixture();
  try {
    const key = randomUUID();
    await createWebCheckout(f.service, f.input, key, "web", origin);
    f.store.write((s) => {
      s.payments[0]!.status = "paid";
      s.orders[0]!.state = "Confirmed";
      delete s.orders[0]!.catalogSnapshot;
    });
    const before = f.store.read();
    applyCatalogBootstrap(f.store, sources);
    publicCatalog(f.store.read(), { locale: "en" });
    const status = readWebCheckoutStatus(f.service, key);
    assert.equal(status.paymentStatus, "paid");
    assert.equal(status.amountFils, f.sku.priceFils * 2);
    assert.equal(status.summary, undefined);
    assert.throws(
      () => resumeWebCheckout(f.service, { key, checkout: f.input }),
      /Frozen checkout/,
    );
    await assert.rejects(
      createWebCheckout(f.service, f.input, key, "web", origin),
      /Frozen checkout/,
    );
    await f.drain();
    assert.equal(f.sent.length, 0);
    assert.deepEqual(f.store.read().orders, before.orders);
    assert.deepEqual(f.store.read().payments, before.payments);
  } finally {
    f.store.close();
  }
});
