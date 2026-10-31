/** Incident reproduction: disposable SQLite and an injected fake transport only. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { validateCatalog } from "../../server/domain/catalog";
import { fixtureAddressGeo } from "../fixtures/website-address";
import {
  createWebCheckout,
  readWebCheckoutStatus,
  addDays,
  dubaiToday,
} from "../../server/domain/web-checkout";
import { reconcileEmbeddedPayment } from "../../server/domain/embedded-checkout";

for (const first of ["return", "webhook"] as const) {
  test(`incident: ${first} first, repeated pending, then authoritative paid exactly once`, async () => {
    const store = new Store(":memory:", "test");
    store.write((s) => {
      s.catalog = validateCatalog(
        JSON.parse(readFileSync("data-imports/liza-current-menu.json", "utf8")),
      );
    });
    let providerStatus = "PENDING",
      creates = 0,
      gets = 0;
    let checkout: Record<string, unknown> = {};
    const provider = new PaymenntProvider(
      { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
      async (url, init) => {
        assert.match(
          String(url),
          /^https:\/\/api\.test\.paymennt\.com\/mer\/v2\.0\/checkout/,
        );
        if (init?.method === "POST") {
          creates++;
          checkout = {
            ...JSON.parse(String(init.body)),
            id: "incident-fixture",
            redirectUrl:
              "https://pay.test.paymennt.com/checkout/incident-fixture",
          };
        } else gets++;
        return Response.json({
          success: true,
          result: { ...checkout, status: providerStatus },
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
    const key = randomUUID();
    const input = {
      lines: [
        { productId: "conchas-traditional-chocolate-mini-40-g", quantity: 6 },
      ],
      delivery: {
        zoneId: "jlt-cluster-c",
        address: "Synthetic address",
        building: "Fixture Tower",
        date: addDays(dubaiToday(), 2),
        slot: "4:00 PM – 9:00 PM",
      },
      customer: {
        name: "Synthetic Incident",
        phone: "0500000000",
        email: "fixture@example.invalid",
      },
      billing: { sameAsDelivery: true },
    };
    const hook = (status: string) =>
      service.acceptPaymentNotification({
        id: "incident-fixture",
        status,
        statusUpdateTimestamp: "2026-10-27T01:00:00Z",
      });
    try {
      // Invalid data never starts payment or creates a business record.
      await assert.rejects(
        createWebCheckout(
          service,
          { ...input, lines: [] },
          key,
          "web",
          "https://fixture.invalid",
        ),
      );
      assert.equal(creates, 0);
      assert.equal(store.read().orders.length, 0);
      const accepted = await createWebCheckout(
        service,
        input,
        key,
        "web",
        "https://fixture.invalid",
      );
      const frozen = JSON.stringify(store.read().orders[0]!.catalogSnapshot);
      if (first === "return") await reconcileEmbeddedPayment(service, key);
      await hook("PENDING");
      for (let i = 0; i < 3; i++) await reconcileEmbeddedPayment(service, key);
      assert.equal(
        readWebCheckoutStatus(service, key).paymentStatus,
        "pending",
      );
      assert.equal(readWebCheckoutStatus(service, key).url, accepted.url);
      assert.equal(store.read().orders[0]!.state, "Awaiting Payment");
      assert.equal(store.read().operationsNotifications?.length ?? 0, 0);
      providerStatus = "AUTHORIZED";
      await reconcileEmbeddedPayment(service, key);
      assert.equal(
        readWebCheckoutStatus(service, key).paymentStatus,
        "authorized",
      );
      assert.equal(readWebCheckoutStatus(service, key).url, null);
      assert.equal(store.read().operationsNotifications?.length ?? 0, 0);
      // A signed-looking PAID notification cannot overrule GET PENDING.
      providerStatus = "PENDING";
      await assert.rejects(hook("PAID"));
      assert.notEqual(store.read().payments[0]!.status, "paid");
      providerStatus = "PAID";
      if (first === "return") await reconcileEmbeddedPayment(service, key);
      await hook("PAID");
      await hook("PAID");
      await reconcileEmbeddedPayment(service, key);
      assert.equal(store.read().orders[0]!.state, "Confirmed");
      assert.equal(store.read().operationsNotifications?.length, 1);
      assert.equal(
        JSON.stringify(store.read().orders[0]!.catalogSnapshot),
        frozen,
      );
      assert.equal(creates, 1);
      assert.ok(gets >= 6);
      assert.equal(store.read().payments.length, 1);
      assert.equal(store.read().orders.length, 1);
      providerStatus = "PENDING";
      await reconcileEmbeddedPayment(service, key);
      assert.equal(store.read().payments[0]!.status, "paid");
      assert.equal(store.read().orders[0]!.state, "Confirmed");
    } finally {
      store.close();
    }
  });
}
