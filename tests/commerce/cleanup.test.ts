import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { Store, seed } from "../../server/db/store";
import { matchZone } from "../../server/domain/zones";
import { catalog } from "../../server/domain/model";
import { runtimeConfig } from "../../server/config";
import { assertCleanRuntime } from "../../server/db/runtime-safety";
import { seed as testSeed } from "../fixtures/seed";
import { stagingEnv } from "../fixtures/staging";
test("TL24 operational initialization is empty; GPS has no synthetic fallback", () => {
  const store = new Store(":memory:");
  try {
    const s = store.read();
    for (const records of [
      s.conversations,
      s.orders,
      s.payments,
      s.jobs,
      catalog,
    ])
      assert.equal(records.length, 0);
    assert.equal(s.zones.find((z) => z.id === "jvc")?.deliveryFeeAed, 0);
    assert.equal(
      matchZone(s.zones, undefined, { lat: 25.0657, lng: 55.2089 }),
      null,
    );
    assertCleanRuntime(s);
  } finally {
    store.close();
  }
});
test("TL24 production flags cannot downgrade production to a test environment", () => {
  for (const env of [
    { APP_ENV: "production" },
    { NODE_ENV: "production" },
    stagingEnv("/private/tmp/test"),
  ]) {
    assert.throws(
      () => runtimeConfig({ ...env, ALLOW_DEMO_DATA: "true" }),
      /Demo seeds disabled/,
    );
    assert.throws(
      () => runtimeConfig({ ...env, DEMO_MODE: "true" }),
      /Demo seeds disabled/,
    );
    assert.throws(
      () => runtimeConfig({ ...env, STAGING_SEED: "uat" }),
      /Demo seeds disabled/,
    );
  }
});
test("TL24 identified historical seed records are blocked without deleting mixed records", () => {
  const s = testSeed();
  assert.throws(() => assertCleanRuntime(s), /identified test/);
  assert.equal(s.conversations.length, 3);
  const clean = seed();
  clean.conversations.push({
    ...s.conversations[0]!,
    id: "real",
    messages: [],
    audit: [],
    customer: "Demo is a legitimate name",
  });
  assert.doesNotThrow(() => assertCleanRuntime(clean));
});
test("TL24 runtime entry and UI have no fixture imports or simulation surfaces", () => {
  for (const file of [
    "server/http.ts",
    "server/main.ts",
    "src/brand/Root.tsx",
    "src/brand/Experience.tsx",
    "src/commerce/Workspace.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from ["'][^"']*tests\//);
    assert.doesNotMatch(
      source,
      /MVP demo|Simular GPS|Simular resultado|App\.jsx/,
    );
  }
});

test("TL24 release cannot reuse a legacy profile, even without recognizable seed markers", () => {
  const dir = mkdtempSync(join(tmpdir(), "tl24-profile-"));
  const path = join(dir, "db.sqlite");
  try {
    const legacy = new Store(path, "development");
    legacy.close();
    assert.throws(() => new Store(path, "release"), /separate database/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("TL24 offline cleanup defaults to dry run, checks fingerprint, backs up, and preserves real configuration", () => {
  const dir = mkdtempSync(join(tmpdir(), "tl24-cleanup-"));
  const path = join(dir, "source.sqlite");
  const invoke = (...args: string[]) =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/cleanup-demo-db.ts", path, ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  try {
    const initial = testSeed();
    initial.conversations.push({
      ...initial.conversations[0]!,
      id: "operational",
      customer: "Existing operator record",
      phone: "retained",
      messages: [],
      audit: [],
    });
    initial.zones[0]!.review = "Approved setting must survive cleanup";
    const source = new Store(path, "development", initial);
    source.close();
    const plan = JSON.parse(invoke());
    assert.equal(plan.dryRun, true);
    let verify = new Store(path, "development");
    assert.equal(verify.read().conversations.length, 4);
    verify.close();
    assert.throws(() =>
      invoke(
        "--apply",
        "--expected-sha",
        "incorrect",
        "--backup",
        join(dir, "wrong.sqlite"),
      ),
    );
    invoke(
      "--apply",
      "--expected-sha",
      plan.sha256,
      "--backup",
      join(dir, "backup.sqlite"),
    );
    verify = new Store(path, "development");
    assert.deepEqual(verify.read().zones, initial.zones);
    assert.deepEqual(
      verify.read().conversations.map((c) => c.id),
      ["operational"],
    );
    verify.close();
    const saved = new Store(join(dir, "backup.sqlite"), "development");
    assert.equal(saved.read().conversations.length, 4);
    saved.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
