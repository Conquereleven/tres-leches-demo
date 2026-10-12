import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { Store, seed } from "../../server/db/store";
import { loadBootstrapSources } from "../../server/catalog/bootstrap";
import {
  applyFoundation,
  auditFoundation,
  catalogFingerprint,
  deactivateRetired,
  protectedFingerprint,
  reconcileCatalog,
  revertFoundation,
} from "../../server/catalog/foundation-audit";
import {
  rebaseFoundation,
  validateFoundation,
} from "../../server/catalog/contract";
import { importCatalog } from "../../server/domain/catalog";
import type { State } from "../../server/domain/model";
import { RETIRED_SKUS } from "../../shared/commerce-policy";

const sources = loadBootstrapSources(process.cwd());
const PRIVATE = "Private-Customer-Marker-7731";
/** The previous schema: an operating database that has never had a foundation. */
function previous(production = false): State {
  const s = seed();
  s.catalog = structuredClone(sources.approved);
  if (production)
    // As observed in Production: removed combinations blocked in code, stored sellable.
    for (const c of s.catalog)
      if (RETIRED_SKUS.has(c.id)) {
        c.active = true;
        c.availability = "available";
      }
  s.orders.push({
    id: "TL-HISTORIC-1",
    customer: { name: PRIVATE, phone: "+971500000000" },
    totalFils: 4200,
  } as never);
  s.payments.push({ id: "pay-1", orderId: "TL-HISTORIC-1" } as never);
  s.audit.push({ at: "2026-10-01T00:00:00.000Z", actor: "x", action: "y" });
  return s;
}
function database(state: State, profile: "release-production" | "test") {
  const dir = mkdtempSync(join(tmpdir(), "3l-bootstrap-"));
  const path = join(dir, "db", "state.sqlite");
  new Store(path, profile, state).close();
  // Checkpoint so the file itself is the whole database for byte comparisons.
  const db = new DatabaseSync(path);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  return { dir, path, backups: join(dir, "backups") };
}
function cli(mode: string, path: string, env: Record<string, string> = {}) {
  const { PATH, HOME, TMPDIR } = process.env;
  const out = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/catalog-foundation.ts", mode],
    {
      env: { PATH, HOME, TMPDIR, DB_PATH: path, ...env } as NodeJS.ProcessEnv,
      encoding: "utf8",
    },
  );
  return {
    status: out.status,
    json: out.stdout.trim() ? JSON.parse(out.stdout) : null,
    text: out.stdout + out.stderr,
  };
}
const sqliteFiles = (dir: string) =>
  readdirSync(dir).filter((n) => n.endsWith(".sqlite"));
const document = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return JSON.parse(
      (
        db.prepare("SELECT document FROM commerce_state WHERE id=1").get() as {
          document: string;
        }
      ).document,
    ) as State;
  } finally {
    db.close();
  }
};

test("reconciliation reports every kind of difference and never prefers the repository", () => {
  const catalog = structuredClone(sources.approved);
  const copy = structuredClone(catalog);
  assert.deepEqual(reconcileCatalog(catalog, sources.approved), []);
  catalog[0]!.priceFils += 100;
  catalog[1]!.name += " (real)";
  catalog[2]!.active = !catalog[2]!.active;
  catalog[3]!.availability = "unavailable";
  const removed = catalog.pop()!;
  catalog.push({ id: "only-in-database", name: "Local", priceFils: 500 });
  const before = structuredClone(catalog);
  const found = reconcileCatalog(catalog, sources.approved);
  assert.deepEqual(catalog, before, "inputs are not modified");
  const has = (sku: string, field: string) =>
    found.some((d) => d.sku === sku && d.field === field);
  assert.ok(has(copy[0]!.id, "priceFils"));
  assert.ok(has(copy[1]!.id, "name"));
  assert.ok(has(copy[2]!.id, "active"));
  assert.ok(has(removed.id, "missing-in-database"));
  assert.ok(has("only-in-database", "not-in-sources"));
  const price = found.find((d) => d.field === "priceFils")!;
  assert.equal(price.database, copy[0]!.priceFils + 100);
  assert.equal(price.approved, copy[0]!.priceFils);
});

test("audit of a release-production database is physically read-only, needs no environment and prints no private data", () => {
  const d = database(previous(), "release-production");
  try {
    const bytes = readFileSync(d.path);
    const out = cli("audit", d.path);
    assert.equal(out.status, 0);
    assert.equal(out.json.decision, "READY_TO_APPLY");
    assert.equal(out.json.profile, "release-production");
    assert.equal(out.json.integrity, "ok");
    assert.equal(out.json.database.skuCount, 236);
    assert.equal(out.json.database.orderCount, 1);
    assert.equal(out.json.foundation.status, "absent");
    assert.match(
      out.json.foundation.plannedRevision,
      /^catalog-v1-[a-f0-9]{64}$/,
    );
    assert.deepEqual(out.json.discrepancies, []);
    assert.ok(!out.text.includes(PRIVATE) && !out.text.includes("+9715"));
    assert.deepEqual(readFileSync(d.path), bytes, "not one byte changed");
    assert.deepEqual(readdirSync(d.dir).sort(), ["db"], "no backup, no files");
  } finally {
    rmSync(d.dir, { recursive: true });
  }
});

test("discrepancies block the migration; nothing is replaced automatically", () => {
  const d = database(previous(true), "release-production");
  try {
    const bytes = readFileSync(d.path);
    const audit = cli("audit", d.path);
    assert.equal(audit.status, 2);
    assert.equal(audit.json.decision, "BLOCKED");
    assert.equal(audit.json.discrepancies.length, RETIRED_SKUS.size * 2);
    assert.equal(
      audit.json.retiredSkusStillActiveInDatabase.length,
      RETIRED_SKUS.size,
    );
    assert.equal(audit.json.foundation.plannedRevision, null);
    const apply = cli("apply", d.path, {
      APP_ENV: "production",
      CONFIRM: "initialize-production-catalog-foundation",
      BACKUP_DIR: d.backups,
      EXPECT_CATALOG: audit.json.database.catalogFingerprint,
      EXPECT_REVISION: `catalog-v1-${"0".repeat(64)}`,
    });
    assert.equal(apply.status, 2);
    assert.equal(apply.json.applied, false);
    assert.deepEqual(readFileSync(d.path), bytes);
  } finally {
    rmSync(d.dir, { recursive: true });
  }
});

test("Production migration on a disposable copy: gated, backed up, additive, idempotent and reversible", () => {
  const d = database(previous(), "release-production");
  try {
    const bytes = readFileSync(d.path);
    const before = document(d.path);
    const audit = cli("audit", d.path).json;
    const env = {
      APP_ENV: "production",
      CONFIRM: "initialize-production-catalog-foundation",
      BACKUP_DIR: d.backups,
      EXPECT_CATALOG: audit.database.catalogFingerprint as string,
      EXPECT_REVISION: audit.foundation.plannedRevision as string,
    };
    // Every gate refuses and leaves the file untouched.
    for (const wrong of [
      { ...env, CONFIRM: "yes" },
      { ...env, APP_ENV: "staging" },
      { ...env, APP_ENV: "" },
      { ...env, BACKUP_DIR: "relative" },
      { ...env, BACKUP_DIR: join(d.dir, "db") },
      { ...env, EXPECT_CATALOG: "0".repeat(64) },
      { ...env, EXPECT_REVISION: `catalog-v1-${"0".repeat(64)}` },
      { ...env, EXPECT_REVISION: "" },
    ]) {
      const refused = cli("apply", d.path, wrong);
      assert.equal(refused.status, 1, JSON.stringify(wrong));
      assert.match(refused.text, /Nothing was written/);
      assert.equal(document(d.path).catalogFoundation, undefined);
    }
    assert.deepEqual(
      document(d.path),
      before,
      "refusals changed nothing in the document",
    );
    void bytes;

    const applied = cli("apply", d.path, env);
    assert.equal(applied.status, 0, applied.text);
    assert.equal(applied.json.applied, true);
    assert.equal(applied.json.revision, env.EXPECT_REVISION);
    assert.equal(applied.json.catalogIdentical, true);
    assert.equal(applied.json.foundation, "current");
    assert.equal(applied.json.integrity, "ok");
    assert.ok(!applied.text.includes(PRIVATE));

    // Verified backup: restorable, and it is the state before the change.
    const saved = document(applied.json.backup);
    assert.deepEqual(saved, before);
    assert.equal(sqliteFiles(d.backups).length, 1);

    // Additive: only the new key differs.
    const after = document(d.path);
    const { catalogFoundation, ...rest } = after;
    assert.deepEqual(rest, before);
    assert.equal(protectedFingerprint(after), protectedFingerprint(before));
    assert.equal(
      catalogFingerprint(after.catalog!),
      audit.database.catalogFingerprint,
    );
    validateFoundation(catalogFoundation, after.catalog!);
    assert.equal(after.orders[0]!.id, "TL-HISTORIC-1");

    // Idempotent: a second run writes nothing and takes no second backup.
    const again = cli("apply", d.path, env);
    assert.equal(again.status, 0);
    assert.equal(again.json.applied, false);
    assert.deepEqual(document(d.path), after);
    assert.equal(sqliteFiles(d.backups).length, 1);
    assert.equal(cli("audit", d.path).json.decision, "ALREADY_INITIALIZED");

    // Non-destructive recovery: the foundation goes, everything else stays.
    const wrong = cli("revert", d.path, {
      ...env,
      EXPECT_REVISION: `catalog-v1-${"1".repeat(64)}`,
    });
    assert.equal(wrong.status, 1);
    assert.deepEqual(document(d.path), after);
    const reverted = cli("revert", d.path, env);
    assert.equal(reverted.status, 0, reverted.text);
    assert.equal(reverted.json.reverted, true);
    assert.equal(reverted.json.foundationPresent, false);
    assert.deepEqual(document(d.path), before);
    // And the same audited revision can be applied again.
    assert.equal(cli("apply", d.path, env).json.revision, env.EXPECT_REVISION);
  } finally {
    rmSync(d.dir, { recursive: true });
  }
});

test("concurrent changes between audit and apply are refused inside the transaction", () => {
  const d = database(previous(), "test");
  const store = new Store(d.path, "test");
  try {
    const audit = auditFoundation(store.read(), sources, "test");
    const expected = {
      catalogFingerprint: audit.database.catalogFingerprint,
      plannedRevision: audit.foundation.plannedRevision!,
      profile: "test",
    };
    // Someone changes a price after the audit was reviewed.
    store.write((s) => {
      s.catalog![0]!.priceFils += 100;
    });
    const changed = store.read();
    assert.throws(
      () => applyFoundation(store, sources, expected),
      /changed since the audit/,
    );
    assert.deepEqual(store.read(), changed);
    // An order arriving meanwhile is not a catalog change and does not block.
    store.write((s) => {
      s.catalog![0]!.priceFils -= 100;
      s.orders.push({ id: "TL-NEW" } as never);
    });
    assert.equal(applyFoundation(store, sources, expected).applied, true);
    assert.equal(store.read().orders.length, 2);
    // Recovery is refused once Product Hub has state built on the foundation.
    store.write((s) => {
      (s as { productHub?: unknown }).productHub = { version: 1 };
    });
    assert.throws(
      () => revertFoundation(store, expected.plannedRevision),
      /Product Hub/,
    );
    assert.ok(store.read().catalogFoundation);
  } finally {
    store.close();
    rmSync(d.dir, { recursive: true });
  }
});

test("removed combinations: a separate, gated step changes those rows only and unblocks the audit", () => {
  const d = database(previous(true), "release-production");
  try {
    const before = document(d.path);
    const audit = cli("audit", d.path).json;
    const env = {
      APP_ENV: "production",
      BACKUP_DIR: d.backups,
      EXPECT_CATALOG: audit.database.catalogFingerprint as string,
    };
    // The foundation confirmation does not authorize a commercial change.
    assert.equal(
      cli("retire-removed", d.path, {
        ...env,
        CONFIRM: "initialize-production-catalog-foundation",
      }).status,
      1,
    );
    assert.deepEqual(document(d.path), before);
    const out = cli("retire-removed", d.path, {
      ...env,
      CONFIRM: "deactivate-removed-pan-de-muerto-combinations",
    });
    assert.equal(out.status, 0, out.text);
    assert.equal(out.json.changed.length, RETIRED_SKUS.size);
    assert.equal(out.json.remainingDiscrepancies, 0);
    assert.equal(out.json.decision, "READY_TO_APPLY");
    const after = document(d.path);
    for (const [i, c] of after.catalog!.entries()) {
      const was = before.catalog![i]!;
      if (RETIRED_SKUS.has(c.id)) {
        assert.equal(c.active, false);
        assert.equal(c.availability, "unavailable");
        assert.equal(c.priceFils, was.priceFils);
        assert.equal(c.name, was.name);
      } else assert.deepEqual(c, was);
    }
    assert.deepEqual(after.orders, before.orders);
    assert.deepEqual(after.payments, before.payments);
    assert.equal(after.audit.length, before.audit.length + 1);
    assert.deepEqual(document(out.json.backup), before);
    assert.equal(after.catalogFoundation, undefined);
  } finally {
    rmSync(d.dir, { recursive: true });
  }
  // Refused once the foundation exists: products are then changed in Product Hub.
  const e = database(previous(), "test");
  const store = new Store(e.path, "test");
  try {
    const audit = auditFoundation(store.read(), sources, "test");
    applyFoundation(store, sources, {
      catalogFingerprint: audit.database.catalogFingerprint,
      plannedRevision: audit.foundation.plannedRevision!,
      profile: "test",
    });
    assert.throws(
      () => deactivateRetired(store, audit.database.catalogFingerprint, "now"),
      /Product Hub/,
    );
  } finally {
    store.close();
    rmSync(e.dir, { recursive: true });
  }
});

test("existing catalog tools keep an initialized foundation consistent or refuse", async () => {
  const d = database(previous(), "test");
  const store = new Store(d.path, "test");
  try {
    const audit = auditFoundation(store.read(), sources, "test");
    applyFoundation(store, sources, {
      catalogFingerprint: audit.database.catalogFingerprint,
      plannedRevision: audit.foundation.plannedRevision!,
      profile: "test",
    });
    const first = store.read().catalogFoundation!.revision.id;
    // A price tool changes the catalog and re-fingerprints in the same transaction.
    store.write((s) => {
      s.catalog![0]!.priceFils += 100;
      rebaseFoundation(s, "2026-10-12T10:00:00.000Z");
    });
    const s = store.read();
    assert.notEqual(s.catalogFoundation!.revision.id, first);
    validateFoundation(s.catalogFoundation, s.catalog!);
    // Unchanged catalog: no new revision.
    store.write((x) => rebaseFoundation(x, "2026-10-12T11:00:00.000Z"));
    assert.equal(
      store.read().catalogFoundation!.revision.id,
      s.catalogFoundation!.revision.id,
    );
    // The general importer cannot add a SKU the foundation does not describe.
    const raw = JSON.parse(
      readFileSync("data-imports/liza-current-menu.json", "utf8"),
    );
    raw.items.push({ ...raw.items[0], id: "brand-new-sku" });
    const kept = store.read();
    await assert.rejects(
      importCatalog(store, raw, true, join(d.dir, "import-backup.sqlite")),
    );
    assert.deepEqual(store.read(), kept, "rolled back");
    // An open Product Hub draft blocks direct catalog changes.
    store.write((x) => {
      (x as { productHub?: unknown }).productHub = { draft: {} };
    });
    assert.throws(
      () =>
        store.write((x) => {
          x.catalog![0]!.priceFils += 100;
          rebaseFoundation(x, "2026-10-12T12:00:00.000Z");
        }),
      /draft is open/,
    );
  } finally {
    store.close();
    rmSync(d.dir, { recursive: true });
  }
});
