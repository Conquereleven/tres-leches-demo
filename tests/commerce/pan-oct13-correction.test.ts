import * as requireFs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../../server/db/store";
import { validateCatalog } from "../../server/domain/catalog";
import { CommerceService } from "../../server/domain/service";
import {
  DisabledWhatsAppProvider,
  UnconfiguredPaymentProvider,
} from "../../server/adapters/blocked";
import { PAN_OCT13_CORRECTION } from "../../server/domain/pan-price-correction";
import {
  applyPanPriceUpdate,
  planPanPriceUpdate,
} from "../../server/domain/pan-price-update";
import { quoteWebCheckout } from "../../server/domain/web-checkout";
const baseline = () =>
  validateCatalog(
    JSON.parse(
      execFileSync(
        "git",
        ["show", "11f7774:data-imports/liza-current-menu.json"],
        { encoding: "utf8" },
      ),
    ),
  );
const approved = () =>
  validateCatalog(
    JSON.parse(readFileSync("data-imports/liza-current-menu.json", "utf8")),
  );
test("exactly ten price fields change from Production baseline; all other identities and commercial facts are identical", () => {
  assert.equal(Object.keys(PAN_OCT13_CORRECTION).length, 10);
  const before = baseline(),
    after = approved().filter(p => !p.id.startsWith("conchas-tricolor-pack-3-"));
  assert.deepEqual(
    after.map((p) =>
      p.id in PAN_OCT13_CORRECTION
        ? { ...p, priceFils: PAN_OCT13_CORRECTION[p.id]![0] }
        : p,
    ),
    before,
  );
  assert.deepEqual(applyPanPriceUpdate(before, PAN_OCT13_CORRECTION), after);
  assert.equal(
    planPanPriceUpdate(after).change.length,
    0,
    "older updater cannot revert the new prices",
  );
});
test("all ten server quotes preserve fixed packs, quantities, pickup and per-zone delivery minimums", () => {
  const store = new Store(":memory:", "test");
  store.write((s) => {
    s.catalog = approved();
  });
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    new UnconfiguredPaymentProvider(),
  );
  try {
    for (const [id, [, price]] of Object.entries(PAN_OCT13_CORRECTION))
      for (const quantity of [1, 3])
        for (const fulfillmentMethod of ["pickup", "delivery"]) {
          const zone = store
            .read()
            .zones.find((z) => z.active && z.minOrderAed === 100)!;
          const quote = quoteWebCheckout(service, {
            lines: [{ productId: id, quantity }],
            fulfillmentMethod,
            ...(fulfillmentMethod === "delivery" ? { zoneId: zone.id } : {}),
          });
          assert.equal(quote.subtotalFils, price * quantity, id);
          assert.equal(quote.totalFils, price * quantity, id);
          assert.equal(
            quote.eligible,
            fulfillmentMethod === "pickup" || price * quantity >= 10000,
            id,
          );
        }
  } finally {
    store.close();
  }
});
test("ten-only command verifies backup, preserves historical #003 and all unrelated state, then becomes a no-op", () => {
  const dir = mkdtempSync(join(tmpdir(), "pan-oct13-"));
  const path = join(dir, "db.sqlite");
  const store = new Store(path, "release-staging");
  store.write((s) => {
    s.catalog = baseline();
    s.audit.push({
      at: "2026-10-12T12:00:00Z",
      actor: "fixture",
      action: "original audit",
    });
    s.orders.push({
      id: "TL-DF13D782",
      publicOrderNumber: 3,
      conversationId: "fixture",
      version: 1,
      state: "Confirmed",
      quote: null,
      lines: [
        {
          productId:
            "pan-de-muerto-traditional-azucar-individual-70-g-chocolate-covering",
          quantity: 2,
        },
      ],
      catalogSnapshot: [
        {
          id: "pan-de-muerto-traditional-azucar-individual-70-g-chocolate-covering",
          name: "Historic accepted product",
          priceFils: 1500,
        },
      ],
      audit: [],
    });
  });
  const before = store.read();
  store.close();
  const run = (mode: string) =>
    spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/update-pan-prices.ts", mode],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DB_PATH: path,
          APP_ENV: "staging",
          BACKUP_DIR: dir,
        },
      },
    );
  const read = () => {
    const db = new Store(path, "release-staging");
    try {
      return db.read();
    } finally {
      db.close();
    }
  };
  try {
    const plan = run("plan-oct13");
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(JSON.parse(plan.stdout).willChange.length, 10);
    assert.deepEqual(read(), before);
    const result = run("apply-oct13");
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.priceFieldsWritten, 10);
    assert.equal(report.untouchedIdentical, true);
    const backup = new Store(report.backup, "release-staging");
    try {
      assert.deepEqual(backup.read(), before);
    } finally {
      backup.close();
    }
    const after = read();
    assert.deepEqual(after.orders, before.orders);
    assert.deepEqual(after.payments, before.payments);
    assert.deepEqual(after.paymentNotifications, before.paymentNotifications);
    assert.deepEqual(after.audit.slice(0, -1), before.audit);
    const repeated = run("apply-oct13");
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.equal(JSON.parse(repeated.stdout).applied, false);
    assert.deepEqual(read(), after);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("release gate corrects verified data before server startup and fails closed on a conflicting price", () => {
  const dir = mkdtempSync(join(tmpdir(), "pan-oct13-start-"));
  const db = join(dir, "state.sqlite");
  const store = new Store(db, "release-staging");
  store.write((s) => {
    s.catalog = baseline();
  });
  store.close();
  try {
    // Run the actual startup wrapper and compiled updater, with an isolated server probe.
    const fs = requireFs;
    fs.mkdirSync(join(dir, "scripts"));
    fs.symlinkSync(resolve("node_modules"), join(dir,"node_modules"), "dir");
    fs.mkdirSync(join(dir, "dist/node"), { recursive: true });
    fs.copyFileSync(
      "scripts/start-price-correction.mjs",
      join(dir, "scripts/start-price-correction.mjs"),
    );
    fs.copyFileSync(
      "dist/node/update-pan-prices.js",
      join(dir, "dist/node/update-pan-prices.js"),
    );
    fs.copyFileSync("dist/node/schema.sql", join(dir, "dist/node/schema.sql"));
    fs.writeFileSync(join(dir, "package.json"), '{"type":"module"}');
    fs.writeFileSync(
      join(dir, "dist/node/server.mjs"),
      'console.log("SERVER_STARTS_AFTER_PRICES");',
    );
    const env = {
      ...process.env,
      DB_PATH: db,
      APP_ENV: "staging",
      BACKUP_DIR: dir,
      PAN_PRICE_CORRECTION_20261013: "true",
    };
    const result = spawnSync(
      process.execPath,
      ["scripts/start-price-correction.mjs"],
      { cwd: dir, env, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      result.stdout.indexOf('"priceFieldsWritten":10') <
        result.stdout.indexOf("SERVER_STARTS_AFTER_PRICES"),
    );
    const check = new Store(db, "release-staging");
    check.write((s) => {
      s.catalog!.find(
        (p) => p.id === Object.keys(PAN_OCT13_CORRECTION)[0],
      )!.priceFils = 1999;
    });
    check.close();
    const blocked = spawnSync(
      process.execPath,
      ["scripts/start-price-correction.mjs"],
      { cwd: dir, env, encoding: "utf8" },
    );
    assert.notEqual(blocked.status, 0);
    assert.ok(!blocked.stdout.includes("SERVER_STARTS_AFTER_PRICES"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
