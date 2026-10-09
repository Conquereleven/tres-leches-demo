import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  availableSku,
  validWindow,
  DELIVERY_WINDOWS,
  leadHours,
  businessDate,
} from "../../shared/commerce-policy";
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
import { mcpRead } from "../../server/domain/mcp";
import { menuFamilies } from "../../src/brand/menu";
import {
  createWebCheckout,
  resumeWebCheckout,
} from "../../server/domain/web-checkout";
const now = new Date("2026-10-03T16:59:00Z"); // Dubai 20:59, before the approved next-day cutoff
for (const [label, valid] of [
  [DELIVERY_WINDOWS[0].label, false],
  [DELIVERY_WINDOWS[1].label, true],
  [DELIVERY_WINDOWS[2].label, true],
] as const)
  test(`Dubai next-day window ${label} honors 12h`, () =>
    assert.equal(validWindow("2026-10-04", label, now), valid));
test("same-day and invalid date/slot never accepted", () => {
  assert.equal(
    validWindow(
      "2026-10-03",
      DELIVERY_WINDOWS[2].label,
      new Date("2026-10-03T00:00:00Z"),
    ),
    false,
  );
  assert.equal(
    validWindow(
      "2026-02-30",
      DELIVERY_WINDOWS[2].label,
      new Date("2026-02-28"),
    ),
    false,
  );
  assert.equal(validWindow("2026-10-04", "Afternoon", now), false);
});
test("12h boundary inclusive at window start, rejected one millisecond later", () => {
  const at = new Date("2026-10-03T16:00:00Z"); // Exactly twelve hours to next-day Dubai 08:00
  assert.equal(validWindow("2026-10-04", DELIVERY_WINDOWS[0].label, at), true);
  assert.equal(
    validWindow(
      "2026-10-04",
      DELIVERY_WINDOWS[0].label,
      new Date(at.valueOf() + 1),
    ),
    false,
  );
});
test("longer product lead time preserved; mango jars are not mango cakes", () => {
  assert.equal(leadHours(["tres-leches-mango-mango-13-personas"]), 24);
  assert.equal(leadHours(["jelly-gelatina-fruits-6-piezas"]), 24);
  assert.equal(leadHours(["rosca-de-reyes-6-personas"]), 24);
  assert.equal(leadHours(["cake-jar-premium-mango-110-ml"]), 12);
});
for (const [date, expected] of [
  ["2026-10-02T19:59:59Z", false],
  ["2026-10-02T20:00:00Z", true],
  ["2026-11-15T19:59:59Z", true],
  ["2026-11-15T20:00:00Z", false],
] as const)
  test(`season uses Dubai clock ${date}`, () => {
    assert.equal(
      availableSku("pan-de-muerto-filled-pistachio-individual", new Date(date)),
      expected,
    );
    assert.equal(
      availableSku("pan-de-muerto-filled-pack-12-individuales", new Date(date)),
      true,
    );
  });
test("approved new filling/covering use same size prices and stable SKU throughout commerce", () => {
  const filled = menuFamilies.find((f) => f.id === "pan-de-muerto-filled")!;
  assert.ok(
    filled.options.some(
      (o) => o.variant === "Pistachio" && o.priceFils === 2100,
    ),
  );
  // Chocolate covering exists only on the traditional sugar bread.
  assert.ok(!filled.options.some((o) => /Chocolate covering/.test(o.variant)));
  for (const f of menuFamilies)
    assert.ok(
      f.options.every(
        (o, i) => i === 0 || f.options[i - 1]!.priceFils >= o.priceFils,
      ),
    );
});
test("authoritative geographic registry cannot be bypassed by area IDs, keywords or overlapping polygons", () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-address-policy-"));
  const store = new Store(":memory:", "test");
  try {
    store.write((s) => {
      s.zones = [
        {
          id: "far",
          name: "Far",
          aliases: [],
          minOrderAed: 300,
          deliveryFeeAed: 0,
          freeDelivery: true,
          active: true,
          priority: 10,
          version: 0,
          polygon: [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 2 },
            { lat: 2, lng: 2 },
            { lat: 2, lng: 0 },
          ],
        },
      ];
    });
    const file = join(dir, "verified.json");
    writeFileSync(
      file,
      JSON.stringify([
        {
          address: "Verified far street",
          building: "Tower",
          location: { lat: 1, lng: 1 },
        },
      ]),
    );
    const coverageFile = join(dir, "coverage.json");
    writeFileSync(
      coverageFile,
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { id: "test-only", role: "primary" },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [0, 0],
                  [4, 0],
                  [4, 4],
                  [0, 4],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      }),
    );
    const geo = attachVerifiedAddresses(
      { resolve: () => null },
      file,
      coverageFile,
    );
    const service = new CommerceService(
      store,
      new DisabledWhatsAppProvider(),
      new UnconfiguredPaymentProvider(),
      geo,
    );
    service.deliveryAddressMode = "google";
    assert.equal(
      authoritativeAddress(service, {
        zoneId: "cheap",
        address: "Verified far street",
        building: "Tower",
      }).id,
      "far",
    );
    assert.throws(
      () =>
        authoritativeAddress(service, {
          zoneId: "far",
          address: "Far cheap keywords",
          building: "Tower",
        }),
      /could not verify/,
    );
    const prior = store.read();
    const checkout = {
      lines: [{ productId: "sku", quantity: 1 }],
      delivery: {
        zoneId: "cheap",
        address: "Verified far street",
        building: "Tower",
        date: "2026-10-05",
        slot: DELIVERY_WINDOWS[2].label,
      },
      customer: {
        name: "Fixture",
        phone: "0500000000",
        email: "fixture@example.invalid",
      },
      billing: { sameAsDelivery: true },
    };
    // Contract-level rejection occurs before an order/payment or provider request.
    assert.equal(prior.orders.length, 0);
    assert.equal(
      geo.resolveAddress?.(
        checkout.delivery.address,
        checkout.delivery.building,
        prior.zones,
      )?.zoneId,
      "far",
    );
    store.write((s) => {
      s.zones.push({ ...s.zones[0]!, id: "ambiguous" });
    });
    assert.throws(
      () => authoritativeAddress(service, checkout.delivery),
      /could not verify/,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("unknown delivery blocks both creation and resume before any mutation", async () => {
  const store = new Store(":memory:", "test");
  try {
    const service = new CommerceService(
      store,
      new DisabledWhatsAppProvider(),
      new UnconfiguredPaymentProvider(),
    );
    service.deliveryAddressMode = "google";
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 2);
    const checkout = {
      lines: [{ productId: "sku", quantity: 1 }],
      delivery: {
        zoneId: "marina",
        address: "Unverified address",
        building: "Tower",
        date: businessDate(future),
        slot: DELIVERY_WINDOWS[2].label,
      },
      customer: {
        name: "Fixture",
        phone: "0500000000",
        email: "fixture@example.invalid",
      },
      billing: { sameAsDelivery: true },
    };
    const before = store.read();
    await assert.rejects(
      createWebCheckout(
        service,
        checkout,
        "a04b8b56-d0f5-439a-9cf1-77c6082c136f",
        true,
      ),
      /could not verify/,
    );
    assert.throws(
      () =>
        resumeWebCheckout(service, {
          key: "a04b8b56-d0f5-439a-9cf1-77c6082c136f",
          checkout,
        }),
      /could not verify/,
    );
    assert.deepEqual(store.read(), before);
  } finally {
    store.close();
  }
});
test("MCP role, argument allowlist, PII redaction and audit", () => {
  const store = new Store(":memory:", "test");
  try {
    const service = new CommerceService(
      store,
      new DisabledWhatsAppProvider(),
      new UnconfiguredPaymentProvider(),
    );
    const req = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "orders_list", arguments: {} },
    };
    assert.throws(
      () => mcpRead(service, req, { id: "agent", role: "agent" }),
      /permission/,
    );
    assert.throws(() =>
      mcpRead(
        service,
        {
          ...req,
          params: { name: "orders_list", arguments: { includePii: true } },
        },
        { id: "liza", role: "admin" },
      ),
    );
    const result = mcpRead(service, req, { id: "liza", role: "admin" });
    assert.doesNotMatch(
      JSON.stringify(result),
      /phone|email|secret|billing|address|token/,
    );
    assert.equal(store.read().audit.at(-1)?.action, "MCP read: orders_list");
  } finally {
    store.close();
  }
});
