import test from "node:test";
import assert from "node:assert/strict";
import { searchAreas, exactArea } from "../../shared/area-search";
import { zoneSeed, publicDeliveryAreas } from "../../server/domain/zones";
import { resolveVerifiedCommunity } from "../../server/domain/delivery-areas";
import { quoteWebCheckout } from "../../server/domain/web-checkout";
import { authoritativeAddress } from "../../server/domain/website-address";
import { CommerceService } from "../../server/domain/service";
import { Store, seed } from "../../server/db/store";
import {
  DisabledWhatsAppProvider,
  UnconfiguredPaymentProvider,
} from "../../server/adapters/blocked";
import { bluewatersFixture as blue } from "../fixtures/delivery-areas";

const names = [
  "Bluewaters",
  "Blue Waters",
  "Bluewaters Island",
  "Blue Waters Island",
];
const areas = publicDeliveryAreas([...zoneSeed, blue]);
for (const name of names)
  test(`configured Bluewaters spelling ${name} retains canonical identity`, () => {
    assert.equal(exactArea(areas, name)?.id, blue.id);
    assert.equal(searchAreas(areas, name)[0]?.area.id, blue.id);
    assert.equal(
      resolveVerifiedCommunity([...zoneSeed, blue], name)?.id,
      blue.id,
    );
  });

test("spelling hints suggest only existing configured zones; unapproved aliases never auto-select", () => {
  for (const canonical of names) {
    const configured = [{ ...blue, name: canonical, aliases: [] }];
    for (const query of names) {
      assert.equal(searchAreas(configured, query)[0]?.area.id, blue.id);
      assert.equal(
        exactArea(configured, query)?.id ?? null,
        query === canonical ? blue.id : null,
      );
    }
  }
  for (const query of names)
    assert.deepEqual(searchAreas(publicDeliveryAreas(zoneSeed), query), []);
  assert.deepEqual(
    searchAreas([{ id: "nearby", name: "JBR", aliases: [] }], "Blue Waters"),
    [],
  );
});

test("Bluewaters never steals JBR, Marina or individual JLT cluster identities", () => {
  for (const [text, id, min] of [
    ["JBR", "jbr", 50],
    ["Dubai Marina", "marina", 50],
    ["JLT Cluster C", "jlt-cluster-c", 30],
    ["JLT Cluster O", "jlt-cluster-o", 30],
    ["Jumeirah Village Circle", "jvc", 100],
  ] as const) {
    assert.equal(exactArea(areas, text)?.id, id);
    assert.equal(exactArea(areas, text)?.minOrderAed, min);
  }
  assert.equal(exactArea(areas, "JLT"), null);
});

test("empty, unsupported and ambiguous text never establishes a selection", () => {
  for (const text of [
    "",
    " ",
    "Sharjah",
    "Sharrjah",
    "Blue",
    "JLT",
    "Bluewaters JBR",
  ])
    assert.equal(exactArea(areas, text), null);
  const collision = [
    ...areas,
    {
      ...blue,
      id: "fixture-other",
      name: "Bluewaters Residences",
      aliases: ["Bluewaters"],
    },
  ];
  assert.equal(exactArea(collision, "Bluewaters"), null);
  assert.equal(searchAreas(collision, "Bluewaters").length, 2);
  assert.equal(
    resolveVerifiedCommunity(
      [...zoneSeed, blue, { ...blue, id: "fixture-other" }],
      "Bluewaters",
    ),
    null,
  );
});

function fixture() {
  const initial = seed();
  initial.zones.push(
    blue,
    { ...blue, id: "inactive", name: "Inactive", aliases: [], active: false },
    { ...blue, id: "pending", name: "Pending", aliases: [], minOrderAed: null },
  );
  initial.catalog = [
    {
      id: "fixture-bread",
      name: "Synthetic bread",
      priceFils: 1000,
      active: true,
    },
  ];
  const store = new Store(":memory:", "test", initial);
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    new UnconfiguredPaymentProvider(),
    { resolve: () => null },
  );
  service.deliveryAddressMode = "legacy";
  return {
    store,
    service,
    quote: (zoneId: string, quantity: number) =>
      quoteWebCheckout(service, {
        zoneId,
        lines: [{ productId: "fixture-bread", quantity }],
      }),
  };
}

test("server uses configured Bluewaters minimum, zero fees and quote-only requests leave all state untouched", () => {
  const f = fixture();
  try {
    const before = f.store.read();
    const below = f.quote(blue.id, 13),
      above = f.quote(blue.id, 14);
    assert.equal(below.zoneId, blue.id);
    assert.equal(below.minOrderAed, 137);
    assert.equal(below.eligible, false);
    assert.equal(above.eligible, true);
    assert.equal(above.totalFils, 14000);
    assert.equal(above.feeFils, 0);
    assert.equal(above.totalFils, above.subtotalFils);
    assert.deepEqual(f.store.read(), before);
  } finally {
    f.store.close();
  }
});

test("inactive, unknown, pending and mismatched frontend ids cannot bypass server eligibility", () => {
  const f = fixture();
  try {
    const options = publicDeliveryAreas(f.store.read().zones);
    assert.ok(!options.some((z) => z.id === "inactive" || z.id === "pending"));
    for (const id of [
      "inactive",
      "fake-zone",
      "Bluewaters",
      "bluewaters",
      "fixture-client-only",
    ])
      assert.throws(() => f.quote(id, 20), /Delivery zone is not supported/);
    assert.equal(f.quote("pending", 20).eligible, false);
    assert.equal(f.quote("pending", 20).minOrderAed, null);
    f.store.write((s) => {
      s.zones.find((z) => z.id === blue.id)!.active = false;
    });
    assert.throws(() => f.quote(blue.id, 20), /Delivery zone is not supported/);
  } finally {
    f.store.close();
  }
});

test("Google authoritative resolution cannot be bypassed by typing a recognized area; pickup stays independent", () => {
  const f = fixture();
  try {
    f.service.deliveryAddressMode = "google";
    const input = {
      zoneId: blue.id,
      address: "Synthetic fixture address",
      building: "Fixture Tower",
    };
    assert.throws(() => authoritativeAddress(f.service, input));
    f.service.geo.resolveAddress = () => ({ zoneId: "marina" });
    assert.equal(
      authoritativeAddress(f.service, {
        ...input,
        addressRef: "fixture-verified",
      }).id,
      "marina",
    );
    const before = f.store.read();
    const q = quoteWebCheckout(f.service, {
      fulfillmentMethod: "pickup",
      lines: [{ productId: "fixture-bread", quantity: 1 }],
    });
    assert.equal(q.eligible, true);
    assert.equal(q.zoneId, null);
    assert.equal(q.feeFils, 0);
    assert.deepEqual(f.store.read(), before);
  } finally {
    f.store.close();
  }
});
