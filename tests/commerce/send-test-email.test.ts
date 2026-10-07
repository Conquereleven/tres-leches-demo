import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const run = (args: string[], env: Record<string, string> = {}) => {
  const clean = { ...process.env };
  delete clean.RESEND_API_KEY;
  delete clean.CUSTOMER_EMAIL_FROM;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/send-test-email.ts", ...args],
    { env: { ...clean, ...env }, encoding: "utf8" },
  );
  return { code: result.status, out: result.stdout + result.stderr };
};
test("the test-email command refuses to run unconfigured or with bad input, and leaks nothing", () => {
  const unconfigured = run(["someone@example.invalid"]);
  assert.equal(unconfigured.code, 1);
  assert.match(unconfigured.out, /"sent":false/);
  assert.match(unconfigured.out, /not set/);
  for (const attempt of [
    run(["not-an-email"], {
      RESEND_API_KEY: "re_fixture_key_0000",
      CUSTOMER_EMAIL_FROM: "3L <orders@example.invalid>",
    }),
    run(["someone@example.invalid", "refund"], {
      RESEND_API_KEY: "re_fixture_key_0000",
      CUSTOMER_EMAIL_FROM: "3L <orders@example.invalid>",
    }),
    run(["someone@example.invalid"], {
      RESEND_API_KEY: "re_fixture_key_0000",
      CUSTOMER_EMAIL_FROM: "no address here",
    }),
  ]) {
    assert.equal(attempt.code, 1);
    assert.match(attempt.out, /"sent":false/);
    // Neither the key, the sender nor the recipient is echoed.
    for (const secret of [
      "re_fixture_key_0000",
      "example.invalid",
      "no address",
    ])
      assert.ok(!attempt.out.includes(secret), secret);
  }
});
test("the test-email command cannot touch orders, events or the database", () => {
  const source = readFileSync("scripts/send-test-email.ts", "utf8");
  for (const forbidden of [
    "db/store",
    "DB_PATH",
    "recordCustomerEvent",
    "service",
  ])
    assert.ok(!source.includes(forbidden), forbidden);
  assert.ok(source.includes("[TEST]"));
});
