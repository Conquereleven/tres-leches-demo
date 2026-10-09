/** Local release-tool check, run after build; no provider requests or real credentials. */
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { Store } from "../../server/db/store";
import { stagingEnv } from "./staging";
const dir = mkdtempSync(join(tmpdir(), "catalog-bootstrap-"));
const e = {
  ...stagingEnv(dir),
  PROVIDER_MODE: "test",
  RAILWAY_PROJECT_ID: "1f9a94c1-0574-49a9-b579-bf6af3aad601",
  RAILWAY_ENVIRONMENT_ID: "b32d77cf-6597-4b3e-9810-caf275bffb68",
  RAILWAY_SERVICE_ID: "fe8c1417-39ca-4038-b94e-68659ab1c659",
  API_PORT: "3168",
  PORT: "3168",
};
const dbPath = e.DB_PATH!;
const initial = new Store(dbPath, "release-staging");
initial.close();
async function run(wrong = false) {
  const child = spawn(process.execPath, ["scripts/start-paymennt-test.mjs"], {
    env: {
      ...process.env,
      ...e,
      ...(wrong ? { RAILWAY_ENVIRONMENT_ID: "production-not-authorized" } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (b) => {
    output += b;
  });
  child.stderr.on("data", (b) => {
    output += b;
  });
  if (wrong) {
    await new Promise((r) => child.once("exit", r));
    assert.equal(child.exitCode, 1);
    return;
  }
  try {
    for (let i = 0; i < 100 && !output.includes("Commerce listening"); i++) {
      if (child.exitCode !== null) throw Error(output);
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.match(output, /Commerce listening/);
    assert.match(output, /"catalogAfter":1/);
  } finally {
    child.kill();
    await new Promise<void>((r) => {
      if (child.exitCode !== null) r();
      else child.once("exit", () => r());
    });
  }
}
try {
  await run(true);
  const before = new Store(dbPath, "release-staging");
  assert.equal(before.read().catalog?.length, 0);
  before.close();
  await run();
  const after = new Store(dbPath, "release-staging");
  assert.equal(after.read().catalog?.[0]?.priceFils, 2500);
  after.close();
  assert.ok(
    readdirSync(e.BACKUP_DIR!).some((p) =>
      p.startsWith("before-direct-checkout-"),
    ),
  );
  await run();
  console.log(
    "TEST bootstrap: wrong environment blocked, pre-mutation backup verified, import and restart idempotence PASS",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
