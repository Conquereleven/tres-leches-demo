import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  loadDeliveryCoverage,
  checkDeliveryCoverage,
} from "../../server/domain/delivery-coverage";
import {
  attachVerifiedAddresses,
  authoritativeAddress,
  normalizeVerifiedAddress,
} from "../../server/domain/website-address";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import {
  createWebCheckout,
  resumeWebCheckout,
  addDays,
  dubaiToday,
} from "../../server/domain/web-checkout";
const inside = { lat: 25.1, lng: 55.25 },
  outside = { lat: 25.45, lng: 55.4 };
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "3l-approved-coverage-"));
  const registry = join(dir, "registry.json");
  writeFileSync(
    registry,
    JSON.stringify([
      {
        address: "Approved coverage fixture",
        building: "Fixture",
        location: inside,
      },
      {
        address: "Outside coverage fixture",
        building: "Fixture",
        location: outside,
      },
    ]),
  );
  const store = new Store(":memory:", "test");
  // Synthetic tariff rectangle used ONLY to isolate minimum validation; not business geographic data.
  store.write((s) => {
    s.catalog = [
      {
        id: "fixture-cake",
        name: "Fixture cake",
        priceFils: 10000,
        active: true,
      },
    ];
    s.zones = [
      {
        id: "fixture-zone",
        name: "Fixture tariff",
        aliases: [],
        minOrderAed: 150,
        deliveryFeeAed: 0,
        freeDelivery: true,
        active: true,
        priority: 1,
        version: 0,
        polygon: [
          { lng: 55, lat: 24.8 },
          { lng: 55.7, lat: 24.8 },
          { lng: 55.7, lat: 25.6 },
          { lng: 55, lat: 25.6 },
        ],
      },
    ];
  });
  let calls = 0;
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      return Response.json({
        success: true,
        result: {
          ...body,
          id: "fixture-checkout",
          status: "PENDING",
          redirectUrl: "https://fixture.invalid/pay",
        },
      });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
    attachVerifiedAddresses({ resolve: () => null }, registry),
  );
  const input = (address = "Approved coverage fixture", quantity = 2) => ({
    lines: [{ productId: "fixture-cake", quantity }],
    delivery: {
      zoneId: "fixture-zone",
      address,
      building: "Fixture",
      date: addDays(dubaiToday(), 2),
      slot: "4:00 PM – 9:00 PM",
    },
    customer: {
      name: "Fixture",
      phone: "0500000000",
      email: "fixture@example.invalid",
    },
    billing: { sameAsDelivery: true },
  });
  return {
    store,
    service,
    input,
    calls: () => calls,
    close: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("approved map: all supplied positions preserved, one primary, no invented exclusion", () => {
  const source = JSON.parse(
    readFileSync("docs/sources/3L_Dubai_delivery_coverage.geojson", "utf8"),
  );
  const c = loadDeliveryCoverage()!;
  assert.equal(c.features.length, 1);
  assert.equal(c.features[0]!.properties.role, "primary");
  assert.deepEqual(c.features[0]!.geometry, source.features[0].geometry);
  assert.equal(source.features[0].geometry.coordinates[0].length, 37);
});
test("approved map: clearly inside/outside and exact boundary vertex are deterministic", () => {
  const c = loadDeliveryCoverage()!;
  assert.equal(checkDeliveryCoverage(inside, c).eligible, true);
  assert.equal(checkDeliveryCoverage(outside, c).code, "OUTSIDE_PRIMARY");
  assert.equal(
    checkDeliveryCoverage({ lng: 55.3756762, lat: 25.3079577 }, c).eligible,
    true,
  );
  assert.equal(
    checkDeliveryCoverage({ lng: 55.3756762, lat: 25.3079587 }, c).eligible,
    false,
  );
});
test("approved map: forged selected valid zone with trusted outside coordinates cannot create or resume", async () => {
  const f = fixture();
  try {
    const before = f.store.read();
    const input = f.input("Outside coverage fixture");
    await assert.rejects(
      createWebCheckout(
        f.service,
        input,
        randomUUID(),
        "web",
        "https://fixture.invalid",
      ),
      /outside our current delivery coverage/,
    );
    assert.throws(
      () =>
        resumeWebCheckout(f.service, { key: randomUUID(), checkout: input }),
      /outside our current delivery coverage/,
    );
    // Client flags/coordinates are rejected by strict input validation and never become location authority.
    await assert.rejects(
      createWebCheckout(
        f.service,
        { ...input, coverageValid: true, location: inside },
        randomUUID(),
        "web",
        "https://fixture.invalid",
      ),
    );
    assert.deepEqual(f.store.read(), before);
    assert.equal(f.calls(), 0);
  } finally {
    f.close();
  }
});
test("approved map: inside location still obeys authoritative tariff minimum", async () => {
  const f = fixture();
  try {
    assert.equal(
      authoritativeAddress(f.service, f.input().delivery).minOrderAed,
      150,
    );
    await assert.rejects(
      createWebCheckout(
        f.service,
        f.input(undefined, 1),
        randomUUID(),
        "web",
        "https://fixture.invalid",
      ),
      /Minimum order/,
    );
    assert.equal(f.calls(), 0);
    assert.equal(f.store.read().orders.length, 0);
    await createWebCheckout(
      f.service,
      f.input(),
      randomUUID(),
      "web",
      "https://fixture.invalid",
    );
    assert.equal(f.calls(), 1);
    assert.equal(f.store.read().payments[0]!.amountFils, 20000);
  } finally {
    f.close();
  }
});
test("approved map: pickup remains available for non-deliverable billing address", async () => {
  const f = fixture();
  try {
    const input = f.input();
    await createWebCheckout(
      f.service,
      {
        lines: input.lines,
        fulfillmentMethod: "pickup",
        pickup: {
          pickupDate: input.delivery.date,
          preferredTime: input.delivery.slot,
        },
        customer: input.customer,
        billing: {
          sameAsDelivery: false,
          name: "Fixture",
          address1: "Outside coverage fixture",
          city: "Dubai",
          state: "Dubai",
          country: "AE",
        },
      },
      randomUUID(),
      "web",
      "https://fixture.invalid",
    );
    assert.equal(f.store.read().orders[0]!.fulfillmentMethod, "pickup");
    assert.equal(f.calls(), 1);
  } finally {
    f.close();
  }
});
test("verified address normalization retains Arabic identity and tolerates Unicode spacing", () => {
  assert.equal(normalizeVerifiedAddress("  برج، دبي  "), "برج دبي");
  assert.notEqual(
    normalizeVerifiedAddress("برج دبي"),
    normalizeVerifiedAddress("برج الشارقة"),
  );
  assert.equal(
    normalizeVerifiedAddress("ＪＬＴ   Tower"),
    normalizeVerifiedAddress("JLT tower"),
  );
});
