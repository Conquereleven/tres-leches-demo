import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/db/store";
import { validateCatalog } from "../../server/domain/catalog";
import {
  applyPanPriceUpdate,
  PAN_PRICE_CHANGES,
  planPanPriceUpdate,
} from "../../server/domain/pan-price-update";
import { menuFamilies } from "../../src/brand/menu";
import { OFFICIAL_PRICES_FILS } from "../fixtures/official-prices-oct-2026";

/** The catalog as released to Production (commit 4838030): every SKU at its old price. */
const released = () =>
  validateCatalog(
    JSON.parse(
      execFileSync(
        "git",
        ["show", "4838030:data-imports/liza-current-menu.json"],
        { encoding: "utf8", maxBuffer: 1 << 26 },
      ),
    ),
  ).map((p) =>
    p.id in PAN_PRICE_CHANGES
      ? { ...p, priceFils: PAN_PRICE_CHANGES[p.id]![0] }
      : p,
  );
const run = (mode: string, env: Record<string, string>) =>
  spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/update-pan-prices.ts", mode],
    { encoding: "utf8", env: { ...process.env, ...env } },
  );

test("the targeted update is exactly the approved Pan de Muerto prices and nothing else", () => {
  assert.equal(Object.keys(PAN_PRICE_CHANGES).length, 24);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(PAN_PRICE_CHANGES).map(([id, [, to]]) => [id, to]),
    ),
    OFFICIAL_PRICES_FILS,
  );
  const before = released();
  for (const [id, [from]] of Object.entries(PAN_PRICE_CHANGES))
    assert.equal(before.find((p) => p.id === id)!.priceFils, from, id);
  const plan = planPanPriceUpdate(before);
  assert.equal(plan.change.length, 24);
  assert.deepEqual(plan.blocked, []);
  const after = applyPanPriceUpdate(before);
  // Same records in the same order; only priceFils of the 24 SKUs differs.
  assert.deepEqual(
    after.map((p) =>
      p.id in PAN_PRICE_CHANGES
        ? { ...p, priceFils: PAN_PRICE_CHANGES[p.id]![0] }
        : p,
    ),
    before,
  );
  assert.deepEqual(
    after.filter((p) => p.id.startsWith("conchas")),
    before.filter((p) => p.id.startsWith("conchas")),
  );
  // Availability is never touched, including the removed combinations' rows.
  assert.deepEqual(
    after.map((p) => [p.id, p.active, p.availability]),
    before.map((p) => [p.id, p.active, p.availability]),
  );
  // Idempotent: a second pass has nothing to do.
  assert.equal(planPanPriceUpdate(after).change.length, 0);
  assert.deepEqual(applyPanPriceUpdate(after), after);
  // What the storefront shows equals what the updated catalog charges.
  const menu = new Map(
    menuFamilies.flatMap((f) => f.options.map((o) => [o.id, o.priceFils])),
  );
  for (const p of after)
    if (menu.has(p.id)) assert.equal(menu.get(p.id), p.priceFils, p.id);
});

test("an unexpected stored price blocks the whole update", () => {
  const odd = released().map((p) =>
    p.id === "pan-de-muerto-filled-pistachio-mini"
      ? { ...p, priceFils: 1999 }
      : p,
  );
  assert.equal(planPanPriceUpdate(odd).blocked.length, 1);
  assert.throws(() => applyPanPriceUpdate(odd));
  const missing = released().filter(
    (p) => p.id !== "pan-de-muerto-filled-pack-6-mini",
  );
  assert.equal(planPanPriceUpdate(missing).blocked.length, 1);
});

test("the command plans read-only, applies once with a backup, and leaves orders untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "pan-prices-"));
  const db = join(dir, "state.sqlite");
  const env = { DB_PATH: db, APP_ENV: "staging", BACKUP_DIR: dir };
  try {
    const seed = new Store(db, "release-staging");
    seed.write((s) => {
      s.catalog = released();
    });
    const snapshot = () => {
      const store = new Store(db, "release-staging");
      try {
        const { catalog, audit, ...rest } = store.read();
        return { catalog: catalog!, audit, rest: JSON.stringify(rest) };
      } finally {
        store.close();
      }
    };
    seed.close();
    const before = snapshot();
    const plan = JSON.parse(run("plan", env).stdout);
    assert.equal(plan.safeToApply, true);
    assert.equal(plan.willChange.length, 24);
    assert.deepEqual(snapshot(), before, "plan must not write");
    assert.deepEqual(
      readdirSync(dir).filter((f) => f.startsWith("pan-prices-")),
      [],
    );
    // apply refuses outside a named environment
    assert.equal(run("apply", { ...env, APP_ENV: "" }).status, 1);
    assert.deepEqual(snapshot(), before);
    const applied = JSON.parse(run("apply", env).stdout);
    assert.equal(applied.applied, true);
    assert.equal(applied.priceFieldsWritten, 24);
    assert.equal(applied.untouchedIdentical, true);
    assert.equal(applied.remaining, 0);
    const after = snapshot();
    assert.deepEqual(after.catalog, applyPanPriceUpdate(before.catalog));
    // Orders, payments, zones and every other part of the state are byte-identical.
    assert.equal(after.rest, before.rest);
    assert.equal(after.audit.length, before.audit.length + 1);
    assert.equal(
      readdirSync(dir).filter((f) => /^pan-prices-.*\.sqlite$/.test(f)).length,
      1,
    );
    const again = JSON.parse(run("apply", env).stdout);
    assert.equal(again.applied, false);
    assert.deepEqual(snapshot(), after);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
