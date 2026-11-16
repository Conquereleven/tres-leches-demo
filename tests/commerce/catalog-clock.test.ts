import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (
  env: Record<string, string>,
  instant = "2026-11-15T19:59:59.000Z",
) =>
  spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import { installCatalogFixtureClock } from './tests/fixtures/catalog-clock.ts';
    installCatalogFixtureClock(${JSON.stringify(instant)});
    console.log(JSON.stringify({ now: new Date().toISOString(), millis: Date.now() }));
  `,
    ],
    { encoding: "utf8", env: { ...process.env, ...env } },
  );

test("explicit fixture clock reaches the child process and agrees with generated dates", () => {
  const dir = mkdtempSync(join(tmpdir(), "catalog-clock-"));
  try {
    for (const instant of [
      "2026-11-15T19:59:59.000Z",
      "2026-11-15T20:00:00.000Z",
    ]) {
      const p = run(
        { APP_ENV: "test", DB_PATH: join(dir, "synthetic.sqlite") },
        instant,
      );
      assert.equal(p.status, 0, p.stderr);
      const result = JSON.parse(p.stdout);
      assert.equal(
        result.now,
        instant,
        "a browser/parent clock cannot stand in for the fixture server clock",
      );
      assert.equal(result.millis, Date.parse(instant));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
for (const mode of ["production", "development", ""])
  test(`test clock refuses runtime mode '${mode}'`, () => {
    const p = run({
      APP_ENV: mode,
      DB_PATH: join(tmpdir(), "unopened-fixture.sqlite"),
    });
    assert.notEqual(p.status, 0);
    assert.match(p.stderr, /isolated test or staging/);
  });
test("test clock refuses a non-disposable database path and invalid timestamp", () => {
  const p = run({
    APP_ENV: "test",
    DB_PATH: join(process.cwd(), "unopened.sqlite"),
  });
  assert.notEqual(p.status, 0);
  assert.match(p.stderr, /disposable/);
  const dir = mkdtempSync(join(tmpdir(), "catalog-clock-"));
  try {
    for (const instant of ["not-a-date", "2026-02-30T08:00:00.000Z"]) {
      const invalid = run(
        { APP_ENV: "test", DB_PATH: join(dir, "unopened.sqlite") },
        instant,
      );
      assert.notEqual(invalid.status, 0);
      assert.match(invalid.stderr, /timestamp/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
