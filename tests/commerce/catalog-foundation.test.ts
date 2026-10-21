import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { Store, seed } from "../../server/db/store";
import {
  loadBootstrapSources,
  planCatalogBootstrap,
  applyCatalogBootstrap,
} from "../../server/catalog/bootstrap";
import {
  catalogDigest,
  validateFoundation,
  revisionFingerprint,
  type CatalogFoundation,
} from "../../server/catalog/contract";
import {
  publicCatalog,
  serveCatalogRead,
  catalogReadEnabled,
} from "../../server/catalog/read-api";
import { DomainError } from "../../server/domain/model";
import { RETIRED_SKUS } from "../../shared/commerce-policy";
const sources = loadBootstrapSources(process.cwd());
const plan = () => planCatalogBootstrap(sources.approved, sources);
function rehash(f: CatalogFoundation) {
  const { revision: _revision, ...meta } = f;
  const fingerprint = revisionFingerprint(meta, sources.approved);
  f.revision = {
    id: `catalog-v1-${fingerprint}`,
    fingerprint,
    publishedAt: null,
  };
  return f;
}
function state() {
  return {
    ...seed(),
    catalog: structuredClone(sources.approved),
    catalogFoundation: plan().foundation,
  };
}

test("foundation reconciles all 238 SKUs and preserves price, identity, status and compatible slugs", () => {
  const p = plan();
  assert.equal(p.report.valid, true);
  assert.equal(p.report.preservedPriceCount, 238);
  assert.equal(p.report.mappedSkuCount, 218);
  assert.equal(p.foundation.variants.length, 238);
  assert.equal(p.report.review.length, 20);
  assert.equal(p.report.publicProductCount, 75);
  for (const v of p.foundation.variants) {
    const c = sources.approved.find((c) => c.id === v.skuId)!;
    assert.equal(v.commercialState === "published", c.active);
    assert.ok(!("priceFils" in v));
  }
  for (const original of sources.products) {
    const product = p.foundation.products.find((p) => p.id === original.id)!;
    assert.equal(product.slug, original.slug);
    assert.equal(product.familyId, original.familyId);
  }
  const pairs = p.foundation.variants
    .filter((v) => v.packQuantity)
    .map((v) => [v.skuId, v.packQuantity]);
  assert.ok(
    pairs.some(([id, qty]) => String(id).includes("12-mini") && qty === 12),
  );
  assert.ok(
    pairs.some(
      ([id, qty]) => String(id).includes("cake-jar-bundle") && qty === 4,
    ),
  );
  assert.equal(
    p.foundation.variants.find((v) => v.skuId === "candles-")?.size,
    null,
  );
  assert.deepEqual(plan().foundation, p.foundation);
  assert.deepEqual(
    planCatalogBootstrap([...sources.approved].reverse(), sources).foundation,
    p.foundation,
  );
});
test("bootstrap discrepancies block writes instead of guessing commercial values", () => {
  const changed = structuredClone(sources.approved);
  changed[0]!.priceFils++;
  assert.equal(planCatalogBootstrap(changed, sources).report.valid, false);
  const conflicting = structuredClone(sources);
  conflicting.families[0]!.options[0]!.priceFils++;
  assert.equal(
    planCatalogBootstrap(sources.approved, conflicting).report.valid,
    false,
  );
  assert.equal(
    planCatalogBootstrap(sources.approved.slice(1), sources).report.valid,
    false,
  );
  const missing = structuredClone(sources);
  missing.products[0]!.familyId = "absent";
  assert.equal(
    planCatalogBootstrap(sources.approved, missing).report.valid,
    false,
  );
});
test("strict canonical validation rejects duplicate identities, references, prices, translation shape and revision tampering", () => {
  const invalid = (mutate: (f: CatalogFoundation) => void) => {
    const f = structuredClone(plan().foundation);
    mutate(f);
    assert.throws(() => validateFoundation(rehash(f), sources.approved));
  };
  invalid((f) => f.variants.push(f.variants[0]!));
  invalid((f) => {
    f.variants[0]!.productId = "missing";
  });
  invalid((f) => {
    f.products[0]!.slug = f.products[1]!.slug;
  });
  invalid((f) => {
    f.products[0]!.categoryId = "missing";
  });
  invalid((f) => {
    f.products[0]!.media.push({
      assetId: "missing",
      order: 0,
      role: "gallery",
    });
  });
  invalid((f) => {
    f.variants.find((v) => v.packQuantity)!.packQuantity = null;
  });
  invalid((f) => {
    f.products[0]!.translations.ar.name = 23 as unknown as string;
  });
  for (const src of [
    "/brand/%2e%2e/private.webp",
    "/brand/%252e%252e/private.webp",
    "/brand/%2f/private.webp",
    "/brand/%5cprivate.webp",
    "/brand/%invalid.webp",
  ]) {
    invalid((f) => {
      f.assets[0]!.derivatives[0]!.src = src;
    });
  }
  const f = plan().foundation;
  f.products[0]!.name = "tampered";
  assert.throws(() => validateFoundation(f, sources.approved));
  for (const price of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    const c = structuredClone(sources.approved);
    c[0]!.priceFils = price;
    assert.throws(() => validateFoundation(plan().foundation, c));
  }
});
test("isolated migration is idempotent; original aggregate, snapshots and recoverable backup remain unchanged", async () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-foundation-"));
  const path = join(dir, "state.sqlite");
  const initial = seed();
  initial.catalog = structuredClone(sources.approved);
  // Sentinel fields deliberately stay opaque to the migration.
  initial.orders.push({
    id: "frozen-order",
    conversationId: "historical",
    state: "Paid",
    version: 7,
    lines: [{ productId: sources.approved[0]!.id, quantity: 2 }],
    catalogSnapshot: structuredClone(sources.approved.slice(0, 1)),
    quote: null,
    paymentId: "frozen-payment",
    audit: [],
  });
  initial.payments.push({
    id: "frozen-payment",
    orderId: "frozen-order",
    amountFils: sources.approved[0]!.priceFils * 2,
    currency: "AED",
    status: "paid",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    timeline: [],
  });
  initial.conversations.push({
    id: "historical",
    customer: "Test customer",
    phone: "+971500000000",
    sourceNumberId: "web",
    sourcePhoneNumber: "web",
    assignedAgent: null,
    status: "closed",
    unread: false,
    version: 1,
    messages: [],
    audit: [],
  });
  initial.paymentNotifications = [
    {
      id: "receipt",
      checkoutId: "historic",
      status: "open",
      attempts: 0,
      nextAt: 0,
      receivedAt: "2026-10-01T00:00:00Z",
    },
  ];
  initial.events["historical-receipt"] = "open";
  initial.commands.frozen = {
    hash: "fingerprint",
    result: { paid: true, amountFils: 2100 },
  };
  const store = new Store(path, "test", initial);
  try {
    const before = store.read();
    await store.backup(join(dir, "before.sqlite"));
    assert.equal(applyCatalogBootstrap(store, sources).applied, true);
    const { catalogFoundation: _metadata, ...after } = store.read();
    assert.deepEqual(after, before);
    const first = store.read();
    assert.equal(applyCatalogBootstrap(store, sources).applied, false);
    assert.deepEqual(store.read(), first);
    const saved = new Store(join(dir, "before.sqlite"), "test");
    try {
      assert.deepEqual(saved.read(), before);
    } finally {
      saved.close();
    }
    store.write((s) => {
      s.catalog![0]!.priceFils++;
    });
    const changed = store.read();
    assert.throws(() => applyCatalogBootstrap(store, sources));
    assert.deepEqual(store.read(), changed);
  } finally {
    store.close();
    rmSync(dir, { recursive: true });
  }
});
// The command line tool is covered by foundation-bootstrap.test.ts.
test("public projection excludes drafts, archival records and private fields, localizes and retains approved media", () => {
  const s = state();
  s.catalogFoundation.products[0]!.commercialState = "draft";
  s.catalogFoundation.variants
    .filter((v) => v.productId === s.catalogFoundation.products[0]!.id)
    .forEach((v) => {
      v.commercialState = "draft";
    });
  rehash(s.catalogFoundation);
  const before = catalogDigest(s);
  for (const locale of ["en", "es", "ar"]) {
    const response = publicCatalog(s, { locale, limit: 100 });
    assert.equal(response.products.length, 74);
    assert.equal(
      response.products.some(
        (p) => p.id === s.catalogFoundation.products[0]!.id,
      ),
      false,
    );
    assert.ok(
      response.products.every((p) =>
        p.variants.every((v) => !RETIRED_SKUS.has(v.skuId)),
      ),
    );
    assert.ok(!JSON.stringify(response).includes("sourceFilename"));
    assert.ok(!JSON.stringify(response).includes("selectionReason"));
    assert.ok(!JSON.stringify(response).includes("commercialState"));
    assert.ok(response.assets.length > 0);
  }
  const p = sources.products.find((p) => p.familyId === "conchas-traditional")!;
  const single = publicCatalog(s, { slug: p.slug, locale: "ar" });
  assert.equal(single.products.length, 1);
  assert.ok(single.products[0]!.content.name);
  assert.equal(
    publicCatalog(s, { category: "conchas" }).products.every(
      (p) => p.categoryId === "conchas",
    ),
    true,
  );
  assert.equal(publicCatalog(s, { limit: 2, offset: 2 }).products.length, 2);
  assert.throws(() => publicCatalog(s, { limit: 101 }));
  assert.throws(() => publicCatalog(s, { locale: "fr" }));
  assert.throws(() => publicCatalog(s, { private: "true" }));
  assert.throws(() => publicCatalog(s, {}, "unknown"));
  assert.equal(catalogDigest(s), before);
  const primary = plan()
    .foundation.products.find(
      (p) => p.id === "pan-de-muerto-traditional--azucar",
    )!
    .media.find((m) => m.role === "primary")!;
  assert.ok(
    plan()
      .foundation.assets.find((a) => a.id === primary.assetId)!
      .derivatives[0]!.src.includes("official-pan-08"),
  );
});
test("read projection uses existing seasonal restrictions without changing commercial state", () => {
  const s = state();
  const summer = publicCatalog(
    s,
    { category: "pan", limit: 100 },
    undefined,
    new Date("2026-07-01T08:00:00+04:00"),
  );
  assert.equal(
    summer.products.find((p) => p.id === "pan-de-muerto-traditional--azucar")!
      .variants[0]!.available,
    false,
  );
  const autumn = publicCatalog(
    s,
    { category: "pan", limit: 100 },
    undefined,
    new Date("2026-10-11T08:00:00+04:00"),
  );
  assert.equal(
    autumn.products.find((p) => p.id === "pan-de-muerto-traditional--azucar")!
      .variants[0]!.available,
    true,
  );
});
test("HTTP read contract supports ETag, bounded queries, no writes, no side effects and disabled feature", async () => {
  let enabled = true;
  const s = state();
  const before = catalogDigest(s);
  const server = createServer((req, res) => {
    try {
      if (
        !serveCatalogRead(
          req,
          res,
          new URL(req.url!, "http://localhost"),
          () => structuredClone(s),
          enabled,
        )
      ) {
        res.writeHead(404);
        res.end();
      }
    } catch (e) {
      res.writeHead(e instanceof DomainError ? e.status : 500);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const r = await fetch(base + "/api/catalog?category=conchas&locale=es");
    assert.equal(r.status, 200);
    assert.equal(
      r.headers.get("cache-control"),
      "no-cache, max-age=0, must-revalidate",
    );
    const body = await r.json();
    assert.equal(body.products.length, 8);
    assert.equal(
      (
        await fetch(base + "/api/catalog?category=conchas&locale=es", {
          headers: { "if-none-match": r.headers.get("etag")! },
        })
      ).status,
      304,
    );
    assert.equal(
      (await fetch(base + `/api/catalog/products/${body.products[0].id}`))
        .status,
      200,
    );
    for (const path of [
      "?limit=101",
      "?locale=fr",
      "?limit=1&limit=2",
      "?offset=-1",
      "?admin=true",
    ])
      assert.equal((await fetch(base + "/api/catalog" + path)).status, 400);
    assert.equal(
      (await fetch(base + "/api/catalog", { method: "POST", body: "{}" }))
        .status,
      404,
    );
    assert.equal(
      (await fetch(base + "/api/catalog/products/missing")).status,
      404,
    );
    const validFoundation = structuredClone(s.catalogFoundation);
    s.catalogFoundation!.schemaVersion = 2 as 1;
    assert.equal((await fetch(base + "/api/catalog")).status, 503);
    s.catalogFoundation = validFoundation;
    enabled = false;
    assert.equal((await fetch(base + "/api/catalog")).status, 404);
    assert.equal(catalogDigest(s), before);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  assert.equal(catalogReadEnabled({ APP_ENV: "test" }), false);
  assert.equal(
    catalogReadEnabled({ APP_ENV: "test", CATALOG_READ_API_ENABLED: "true" }),
    true,
  );
  assert.equal(
    catalogReadEnabled({
      APP_ENV: "production",
      CATALOG_READ_API_ENABLED: "true",
    }),
    false,
  );
  assert.equal(
    catalogReadEnabled({
      APP_ENV: "staging",
      NODE_ENV: "production",
      CATALOG_READ_API_ENABLED: "true",
    }),
    false,
  );
});

test("application routes expose only flagged GET reads and leave SQLite document unchanged", async () => {
  const { spawn } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "3l-catalog-http-"));
  const path = join(dir, "state.sqlite");
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/PAYMENNT|META_|RESEND|AI_|OPERATOR_USERS/.test(key),
    ),
  );
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/catalog-foundation-server.ts"],
    {
      env: {
        ...cleanEnv,
        DB_PATH: path,
        PORT: "0",
        APP_ORIGIN: "http://127.0.0.1",
        CATALOG_READ_API_ENABLED: "true",
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Catalog fixture startup timed out")),
        10000,
      );
      child.once("message", (message) => {
        clearTimeout(timer);
        resolve((message as { port: number }).port);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Catalog fixture exited"));
      });
    });
    const read = () => {
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        return db
          .prepare("SELECT document FROM commerce_state WHERE id=1")
          .get()!.document;
      } finally {
        db.close();
      }
    };
    const before = read();
    const r = await fetch(`http://127.0.0.1:${port}/api/catalog?limit=100`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).total, 75);
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${port}/api/catalog`, {
          method: "POST",
          body: "{}",
        })
      ).status,
      404,
    );
    assert.equal(read(), before);
  } finally {
    if (child.exitCode === null)
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
      });
    rmSync(dir, { recursive: true });
  }
});
