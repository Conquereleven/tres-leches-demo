import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Store, seed } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import {
  DisabledWhatsAppProvider,
  UnconfiguredPaymentProvider,
} from "../../server/adapters/blocked";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import { storefrontCatalog } from "../../server/catalog/storefront-api";
import { quoteWebCheckout } from "../../server/domain/web-checkout";
import { searchProducts } from "../../src/brand/discovery";
import type { CheckoutConfig } from "../../src/brand/cart";
import type { LiveCatalog } from "../../src/brand/live-catalog";
import { availableSku, businessDate } from "../../shared/commerce-policy";
const SINGLE = "pan-de-muerto-traditional-azucar-individual-70-g";
const PACK = "pan-de-muerto-traditional-pack-6-mini";

for (const [instant, day, inSeason] of [
  ["2026-11-15T19:59:59.999Z", "2026-11-15", true],
  ["2026-11-15T20:00:00.000Z", "2026-11-16", false],
] as const)
  test(`same authority calendar for export, discovery and checkout at Dubai ${day}`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date(instant) });
    const sources = loadBootstrapSources(process.cwd()),
      s = seed();
    s.catalog = structuredClone(sources.approved);
    s.catalogFoundation = planCatalogBootstrap(s.catalog, sources).foundation;
    const stored = s.catalog.find((p) => p.id === SINGLE)!;
    assert.ok(stored?.active, "approved row exists before seasonal filtering");
    assert.equal(businessDate(), day);
    const catalog = storefrontCatalog(s) as LiveCatalog;
    const single = catalog.products
      .flatMap((p) => p.options)
      .find((o) => o.id === SINGLE)!;
    assert.ok(single, "published catalog identity survives seasonal closure");
    assert.equal(single.available, inSeason);
    assert.equal(availableSku(SINGLE), inSeason);
    assert.equal(
      availableSku(PACK),
      true,
      "retail-single closure does not deactivate packs",
    );
    const config = {
      enabled: true,
      catalogAvailable: true,
      products: s.catalog
        .filter(
          (p) =>
            p.active && p.availability !== "unavailable" && availableSku(p.id),
        )
        .map((p) => ({ id: p.id, priceFils: p.priceFils })),
    } as unknown as CheckoutConfig;
    const hits = searchProducts(
      catalog,
      config,
      "sugar pan de muerto",
      new Date(),
    );
    assert.equal(
      hits.some((h) => h.options.some((o) => o.id === SINGLE)),
      inSeason,
    );
    const store = new Store(":memory:", "test", s);
    const service = new CommerceService(
      store,
      new DisabledWhatsAppProvider(),
      new UnconfiguredPaymentProvider(),
    );
    try {
      const quote = () =>
        quoteWebCheckout(service, {
          fulfillmentMethod: "pickup",
          lines: [{ productId: SINGLE, quantity: 6 }],
        });
      if (inSeason) assert.equal(quote().subtotalFils, stored.priceFils * 6);
      else assert.throws(quote, /outside its ordering season/);
      assert.deepEqual(
        store.read().catalog,
        s.catalog,
        "clock never edits availability or prices",
      );
    } finally {
      store.close();
    }
  });

test("test-clock code is isolated from runtime entry points", () => {
  for (const f of [
    "server/main.ts",
    "server/http.ts",
    "shared/commerce-policy.ts",
  ])
    assert.doesNotMatch(
      readFileSync(f, "utf8"),
      /PRODUCT_HUB_FIXTURE_NOW|catalog-clock|installCatalogFixtureClock/,
    );
});
