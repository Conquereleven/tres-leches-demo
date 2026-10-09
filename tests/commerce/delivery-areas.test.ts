import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  normalizeAreaName,
  canonicalAreaName,
  resolveVerifiedCommunity,
} from "../../server/domain/delivery-areas";
import {
  zoneSeed,
  quoteOrder,
  publicDeliveryAreas,
} from "../../server/domain/zones";
import {
  attachVerifiedAddresses,
  authoritativeAddress,
} from "../../server/domain/website-address";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import {
  DisabledWhatsAppProvider,
  UnconfiguredPaymentProvider,
} from "../../server/adapters/blocked";
import {
  createWebCheckout,
  resumeWebCheckout,
  dubaiToday,
  addDays,
} from "../../server/domain/web-checkout";

for (const [label, id] of [
  ["Marina", "marina"],
  ["Dubai Marina", "marina"],
  ["JVC", "jvc"],
  ["Jumeirah Village Circle", "jvc"],
  ["Jumeirah Village Circle (JVC)", "jvc"],
  ["Jumeirah Village Triangle", "jvt"],
  ["Dubai Investment Park", "dip"],
  ["Downtown Dubai", "downtown"],
] as const)
  test(`verified community alias ${label}`, () => {
    assert.equal(resolveVerifiedCommunity(zoneSeed, label)?.id, id);
  });
for (const cluster of ["A", "B", "C", "D"])
  test(`JLT Cluster ${cluster} requires AED 30 without geography subdivision`, () => {
    assert.equal(canonicalAreaName("Jumeirah Lakes Towers"), "jlt");
    const zone = resolveVerifiedCommunity(
      zoneSeed,
      "Jumeirah Lakes Towers",
      cluster,
    )!;
    assert.equal(zone.id, `jlt-cluster-${cluster.toLowerCase()}`);
    assert.equal(zone.minOrderAed, 30);
    assert.equal(
      resolveVerifiedCommunity(zoneSeed, `JLT Cluster ${cluster}`)?.id,
      zone.id,
    );
  });
test("normalization is Unicode safe, explicit collisions/unknown JLT never guess", () => {
  assert.equal(normalizeAreaName("  ＪＶＣ  "), "jvc");
  assert.equal(normalizeAreaName("دبي"), "دبي");
  for (const value of [
    "JLT",
    "Jumeirah Lakes Towers",
    "Marina Downtown",
    "Unlisted community",
  ])
    assert.equal(resolveVerifiedCommunity(zoneSeed, value), null);
  assert.equal(resolveVerifiedCommunity(zoneSeed, "JLT", "E"), null);
  assert.equal(resolveVerifiedCommunity(zoneSeed, "Marina", "A"), null);
  assert.equal(
    resolveVerifiedCommunity(
      zoneSeed.map((z) => ({ ...z, active: false })),
      "JVC",
    ),
    null,
  );
  const duplicate = {
    ...zoneSeed.find((z) => z.id === "jvc")!,
    id: "duplicate",
    priority: 999,
  };
  assert.equal(resolveVerifiedCommunity([...zoneSeed, duplicate], "JVC"), null);
});
test("minimum recalculates, legacy null/nonzero fees never add charges to new quotes", () => {
  for (const fee of [null, 0, 60]) {
    const zones = zoneSeed.map((z) => ({
      ...z,
      deliveryFeeAed: fee,
      freeDelivery: false,
    }));
    const lines = [{ productId: "fixture", quantity: 1 }];
    const catalog = [{ id: "fixture", name: "Fixture", priceFils: 3800 }];
    const marina = quoteOrder(
      zones,
      lines,
      undefined,
      undefined,
      undefined,
      "marina",
      catalog,
    );
    assert.equal(marina.feeFils, 0);
    assert.equal(marina.totalFils, 3800);
    assert.equal(marina.minOrderAed, 50);
    assert.equal(marina.minimumMet, false);
    assert.equal(marina.minOrderAed! * 100 - marina.subtotalFils, 1200);
    assert.equal(
      quoteOrder(
        zones,
        lines,
        undefined,
        undefined,
        undefined,
        "jlt-cluster-a",
        catalog,
      ).eligible,
      true,
    );
    assert.equal(
      quoteOrder(
        zones,
        lines,
        undefined,
        undefined,
        undefined,
        "downtown",
        catalog,
      ).minOrderAed,
      300,
    );
  }
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "3l-community-")),
    file = join(dir, "registry.json");
  writeFileSync(
    file,
    JSON.stringify([
      {
        address: "Verified downtown fixture",
        building: "Fixture",
        location: { lat: 25.1, lng: 55.25 },
        community: "Downtown Dubai",
      },
      {
        address: "Verified marina fixture",
        building: "Fixture",
        location: { lat: 25.1, lng: 55.25 },
        community: "Dubai Marina",
      },
      {
        address: "Verified unknown fixture",
        building: "Fixture",
        location: { lat: 25.1, lng: 55.25 },
        community: "Unlisted community",
      },
      {
        address: "Verified outside fixture",
        building: "Fixture",
        location: { lat: 25.45, lng: 55.4 },
        community: "Dubai Marina",
      },
    ]),
  );
  const store = new Store(":memory:", "test");
  const geo = attachVerifiedAddresses({ resolve: () => null }, file);
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    new UnconfiguredPaymentProvider(),
    geo,
  );
  service.deliveryAddressMode = "google";
  store.write((s) => {
    s.catalog = [
      { id: "fixture", name: "Fixture", priceFils: 3800, active: true },
    ];
  });
  return {
    store,
    service,
    geo,
    close: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("trusted community resolves without any tariff polygon, coverage precedes area lookup", () => {
  const f = fixture();
  try {
    assert.ok(f.store.read().zones.every((z) => !z.polygon));
    const area = authoritativeAddress(f.service, {
      address: "Verified downtown fixture",
      building: "Fixture",
      zoneId: "marina",
    });
    assert.equal(area.id, "downtown");
    assert.equal(area.minOrderAed, 300);
    assert.equal(
      f.geo.resolveAddress!("Verified unknown fixture", "Fixture", zoneSeed),
      null,
    );
    // Even a legacy polygon cannot override explicit unknown community evidence.
    const legacy = [
      {
        ...zoneSeed[0]!,
        polygon: [
          { lat: 24, lng: 54 },
          { lat: 26, lng: 54 },
          { lat: 26, lng: 56 },
          { lat: 24, lng: 56 },
        ],
      },
    ];
    assert.equal(
      f.geo.resolveAddress!("Verified unknown fixture", "Fixture", legacy),
      null,
    );
    assert.throws(
      () => f.geo.resolveAddress!("Verified outside fixture", "Fixture", []),
      /outside our current delivery coverage/,
    );
  } finally {
    f.close();
  }
});
test("cheaper selected community cannot create/resume a checkout or change stored state", async () => {
  const f = fixture();
  try {
    const checkout = {
      lines: [{ productId: "fixture", quantity: 1 }],
      delivery: {
        zoneId: "marina",
        address: "Verified downtown fixture",
        building: "Fixture",
        date: addDays(dubaiToday(), 2),
        slot: "4:00 PM – 9:00 PM",
      },
      customer: {
        name: "Fixture Reviewer",
        phone: "0500000000",
        email: "fixture@example.invalid",
      },
      billing: { sameAsDelivery: true },
    };
    const before = f.store.read();
    await assert.rejects(
      createWebCheckout(f.service, checkout, randomUUID()),
      /Minimum order/,
    );
    // Resume derives a fresh capability/hash from the canonical community.
    assert.throws(
      () => resumeWebCheckout(f.service, { key: randomUUID(), checkout }),
      /Minimum order/,
    );
    await assert.rejects(
      createWebCheckout(
        f.service,
        { ...checkout, delivery: { ...checkout.delivery, zoneId: "downtown" } },
        randomUUID(),
      ),
      /Minimum order/,
    );
    assert.deepEqual(f.store.read(), before);
  } finally {
    f.close();
  }
});

test("public area config ignores obsolete fee metadata and hides unknown minima/inactive areas", () => {
  const base = zoneSeed.find((z) => z.id === "marina")!;
  const data = publicDeliveryAreas([
    { ...base, deliveryFeeAed: null, freeDelivery: false },
    { ...base, id: "inactive", active: false },
    { ...base, id: "unknown-minimum", minOrderAed: null },
  ]);
  assert.deepEqual(data, [
    {
      id: "marina",
      name: "Marina",
      aliases: ["Dubai Marina"],
      minOrderAed: 50,
      deliveryFeeAed: 0,
    },
  ]);
});
