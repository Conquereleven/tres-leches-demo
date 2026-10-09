import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  deliveryCoverageSchema,
  checkDeliveryCoverage,
  loadDeliveryCoverage,
} from "../../server/domain/delivery-coverage";
import {
  attachVerifiedAddresses,
  authoritativeAddress,
} from "../../server/domain/website-address";
import {
  createWebCheckout,
  resumeWebCheckout,
  quoteWebCheckout,
  dubaiToday,
  addDays,
} from "../../server/domain/web-checkout";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { PaymenntProvider } from "../../server/adapters/paymennt";
// Synthetic Cartesian-like lat/lng fixtures only. These are NOT Dubai coverage.
const square = (a: number, b: number, c: number, d: number) => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
  [a, b],
];
const feature = (
  id: string,
  role: "primary" | "exclusion",
  coordinates: number[][][],
) => ({
  type: "Feature",
  properties: { id, role },
  geometry: { type: "Polygon", coordinates },
});
const rawCoverage = () => ({
  type: "FeatureCollection",
  features: [
    feature("fixture-primary", "primary", [square(0, 0, 10, 10)]),
    feature("fixture-excluded", "exclusion", [square(6, 6, 7, 7)]),
  ],
});
function fixture(configured = true) {
  const dir = mkdtempSync(join(tmpdir(), "3l-coverage-test-"));
  const registry = join(dir, "addresses.json"),
    coverage = join(dir, "coverage.json");
  writeFileSync(
    registry,
    JSON.stringify([
      {
        address: "Allowed near fixture",
        building: "Fixture tower",
        location: { lat: 1, lng: 1 },
      },
      {
        address: "Allowed far fixture",
        building: "Fixture tower",
        location: { lat: 8, lng: 8 },
      },
      {
        address: "Excluded fixture",
        building: "Fixture tower",
        location: { lat: 6.5, lng: 6.5 },
      },
      {
        address: "Outside fixture",
        building: "Fixture tower",
        location: { lat: 11, lng: 11 },
      },
    ]),
  );
  writeFileSync(coverage, JSON.stringify(rawCoverage()));
  const geo = attachVerifiedAddresses(
    { resolve: () => null },
    registry,
    configured ? coverage : undefined,
  );
  const store = new Store(":memory:", "test");
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
        id: "near",
        name: "Fixture near",
        minOrderAed: 30,
        bounds: square(0, 0, 5, 10),
      },
      {
        id: "far",
        name: "Fixture far",
        minOrderAed: 300,
        bounds: square(5, 0, 10, 10),
      },
    ].map((z) => ({
      id: z.id,
      name: z.name,
      minOrderAed: z.minOrderAed,
      aliases: [],
      deliveryFeeAed: 0,
      freeDelivery: true,
      active: true,
      priority: 10,
      version: 0,
      polygon: z.bounds.map(([lng, lat]) => ({ lng: lng!, lat: lat! })),
    }));
  });
  let providerCalls = 0;
  const payment = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url, init) => {
      providerCalls++;
      assert.equal(
        String(url),
        "https://api.test.paymennt.com/mer/v2.0/checkout/web",
      );
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init.body));
      return Response.json({
        success: true,
        result: {
          ...body,
          id: "coverage-fixture-checkout",
          status: "PENDING",
          redirectUrl:
            "https://pay.test.paymennt.com/checkout/coverage-fixture",
        },
      });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    payment,
    geo,
  );
  const input = (
    address = "Allowed near fixture",
    zoneId = "near",
    quantity = 1,
  ) => ({
    lines: [{ productId: "fixture-cake", quantity }],
    delivery: {
      zoneId,
      address,
      building: "Fixture tower",
      date: addDays(dubaiToday(), 2),
      slot: "4:00 PM – 9:00 PM",
    },
    customer: {
      name: "Coverage Fixture",
      phone: "0500000000",
      email: "fixture@example.invalid",
    },
    billing: { sameAsDelivery: true },
  });
  return {
    service,
    store,
    input,
    geo,
    dir,
    registry,
    coverage,
    calls: () => providerCalls,
    close: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("coverage: valid address reaches mocked hosted checkout with authoritative zone", async () => {
  const f = fixture();
  try {
    const order = await createWebCheckout(
      f.service,
      f.input(),
      randomUUID(),
      "web",
      "https://fixture.example.invalid",
    );
    assert.ok(order);
    assert.equal(f.calls(), 1);
    const state = f.store.read();
    assert.equal(state.orders.length, 1);
    assert.equal(state.orders[0]!.manualZoneId, "near");
    assert.equal(state.payments[0]!.amountFils, 10000);
    assert.notEqual(state.orders[0]!.state, "Paid");
  } finally {
    f.close();
  }
});
for (const address of ["Excluded fixture", "Outside fixture"])
  test(`coverage: ${address} rejects create and resume before state mutation/provider`, async () => {
    const f = fixture();
    try {
      const input = f.input(address, "far", 4),
        before = f.store.read();
      await assert.rejects(
        createWebCheckout(
          f.service,
          input,
          randomUUID(),
          "web",
          "https://fixture.example.invalid",
        ),
        /outside our current delivery coverage area/,
      );
      assert.throws(
        () =>
          resumeWebCheckout(f.service, { key: randomUUID(), checkout: input }),
        /outside our current delivery coverage area/,
      );
      assert.deepEqual(f.store.read(), before);
      assert.equal(f.calls(), 0);
    } finally {
      f.close();
    }
  });
test("coverage: actual far address selects AED300; forged cheap zone rejected in create and resume", async () => {
  const f = fixture();
  try {
    const input = f.input("Allowed far fixture", "near"),
      before = f.store.read();
    const actual = authoritativeAddress(f.service, input.delivery);
    assert.equal(actual.id, "far");
    assert.equal(actual.minOrderAed, 300);
    const quote = quoteWebCheckout(f.service, {
      lines: input.lines,
      zoneId: actual.id,
    });
    assert.equal(quote.minimumMet, false);
    assert.equal(quote.minOrderAed, 300);
    await assert.rejects(
      createWebCheckout(
        f.service,
        input,
        randomUUID(),
        "web",
        "https://fixture.example.invalid",
      ),
      /Minimum order/,
    );
    assert.throws(
      () =>
        resumeWebCheckout(f.service, { key: randomUUID(), checkout: input }),
      /Minimum order/,
    );
    await assert.rejects(
      createWebCheckout(
        f.service,
        f.input("Allowed far fixture", "far"),
        randomUUID(),
        "web",
        "https://fixture.example.invalid",
      ),
      /Minimum order/,
    );
    assert.deepEqual(f.store.read(), before);
    assert.equal(f.calls(), 0);
  } finally {
    f.close();
  }
});
test("coverage: pickup remains available with billing address inside exclusion", async () => {
  const f = fixture();
  try {
    const input = f.input("Excluded fixture");
    const pickup = {
      fulfillmentMethod: "pickup",
      lines: input.lines,
      pickup: {
        pickupDate: input.delivery.date,
        preferredTime: input.delivery.slot,
      },
      customer: input.customer,
      billing: {
        sameAsDelivery: false,
        name: input.customer.name,
        address1: input.delivery.address,
        city: "Fixture city",
        country: "AE",
      },
    };
    await createWebCheckout(
      f.service,
      pickup,
      randomUUID(),
      "web",
      "https://fixture.example.invalid",
    );
    assert.equal(f.store.read().orders[0]!.fulfillmentMethod, "pickup");
    assert.equal(f.calls(), 1);
  } finally {
    f.close();
  }
});
test("coverage: approved default rejects registered points outside Dubai", () => {
  const f = fixture(false);
  try {
    assert.equal(loadDeliveryCoverage(undefined)!.features.length, 1);
    assert.equal(
      checkDeliveryCoverage({ lat: 1, lng: 1 }, null).code,
      "NOT_CONFIGURED",
    );
    assert.throws(
      () => authoritativeAddress(f.service, f.input().delivery),
      /outside our current delivery coverage/,
    );
  } finally {
    f.close();
  }
});
test("coverage: primary edge included; exclusion edges and vertices denied", () => {
  const c = deliveryCoverageSchema.parse(rawCoverage());
  assert.equal(checkDeliveryCoverage({ lat: 0, lng: 1 }, c).eligible, true);
  for (const p of [
    { lat: 6, lng: 6 },
    { lat: 6.5, lng: 6 },
    { lat: 7, lng: 6.5 },
  ])
    assert.equal(checkDeliveryCoverage(p, c).code, "EXCLUDED");
});
test("coverage: polygon holes and separate primary islands are honored", () => {
  const c = deliveryCoverageSchema.parse({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id: "fixture-islands", role: "primary" },
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [square(0, 0, 4, 4), square(1, 1, 2, 2)],
            [square(8, 8, 10, 10)],
          ],
        },
      },
    ],
  });
  assert.equal(
    checkDeliveryCoverage({ lat: 1.5, lng: 1.5 }, c).eligible,
    false,
  );
  assert.equal(checkDeliveryCoverage({ lat: 9, lng: 9 }, c).eligible, true);
  assert.equal(checkDeliveryCoverage({ lat: 6, lng: 6 }, c).eligible, false);
});
test("coverage: malformed rings, topology, roles and duplicate IDs are rejected", () => {
  const invalid = [
    { ...rawCoverage(), features: [] },
    {
      ...rawCoverage(),
      features: [
        feature("same", "primary", [square(0, 0, 10, 10)]),
        feature("same", "exclusion", [square(6, 6, 7, 7)]),
      ],
    },
    {
      ...rawCoverage(),
      features: [
        feature("one", "primary", [square(0, 0, 10, 10)]),
        feature("two", "primary", [square(6, 6, 7, 7)]),
      ],
    },
    {
      type: "FeatureCollection",
      features: [
        feature("bad", "primary", [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        ]),
      ],
    },
    {
      type: "FeatureCollection",
      features: [
        feature("bad", "primary", [
          [
            [0, 0],
            [4, 4],
            [0, 3],
            [4, 0],
            [0, 0],
          ],
        ]),
      ],
    },
    {
      type: "FeatureCollection",
      features: [
        feature("bad", "primary", [square(0, 0, 4, 4), square(3, 3, 5, 5)]),
      ],
    },
    {
      type: "FeatureCollection",
      features: [
        feature("bad", "primary", [
          square(0, 0, 10, 10),
          square(1, 1, 4, 4),
          square(3, 3, 5, 5),
        ]),
      ],
    },
  ];
  for (const config of invalid)
    assert.equal(deliveryCoverageSchema.safeParse(config).success, false);
});
test("coverage: malformed configured file fails startup rather than ignoring exclusions", () => {
  const f = fixture();
  try {
    writeFileSync(f.coverage, '{"type":"FeatureCollection","features":[]}');
    assert.throws(() =>
      attachVerifiedAddresses({ resolve: () => null }, f.registry, f.coverage),
    );
  } finally {
    f.close();
  }
});
