import test from "node:test";
import assert from "node:assert/strict";
import { runtimeConfig, activationConfig } from "../../server/config";
import { stagingEnv } from "../fixtures/staging";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import {
  mkdtempSync,
  mkdirSync,
  statSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const production = () => {
  const e = {
    ...stagingEnv("/tmp/live-fixture"),
    APP_ENV: "production",
    PROVIDER_MODE: "live",
    PAYMENNT_ENVIRONMENT: "live",
    APP_ORIGIN: "https://www.3ldubai.ae",
    PAYMENNT_API_KEY: "fixture-key",
    PAYMENNT_API_SECRET: "fixture-api-secret",
    PAYMENNT_WEBHOOK_SECRET_FILE: "/data/secrets/paymennt-live-webhook.json",
    AI_ENABLED: "false",
    AI_AGENT_DEFAULT_MODE: "copilot",
    AI_AUTONOMOUS_ALLOWED: "false",
  };
  delete (e as NodeJS.ProcessEnv).STAGING_SEED;
  return e;
};
test("LIVE runtime requires canonical Production and matched mode; no test/live fallback", () => {
  const e = production();
  assert.equal(runtimeConfig(e).environment, "production");
  assert.equal(activationConfig(e).paymennt?.environment, "live");
  for (const patch of [
    { APP_ENV: "staging" },
    { APP_ENV: "test" },
    { PROVIDER_MODE: "test" },
    { PAYMENNT_ENVIRONMENT: "test" },
    { APP_ORIGIN: "https://wrong.invalid" },
    { PAYMENNT_WEBHOOK_SECRET_FILE: "" },
    { PAYMENNT_API_SECRET: "" },
    { META_OUTBOUND_ENABLED: "true" },
  ])
    assert.throws(() => runtimeConfig({ ...e, ...patch }));
  assert.throws(() => activationConfig({ ...e, PROVIDER_MODE: "test" }));
  const staging = {
    ...stagingEnv("/tmp/staging-fixture"),
    PROVIDER_MODE: "test",
    PAYMENNT_API_KEY: "fixture",
    PAYMENNT_API_SECRET: "fixture",
  };
  assert.equal(activationConfig(staging).paymennt?.environment, "test");
});
test("hosted redirect allowlist is bound to environment and refuses URL tricks", () => {
  for (const environment of ["test", "live"] as const) {
    const p = new PaymenntProvider({
      apiKey: "fixture",
      apiSecret: "fixture",
      environment,
    });
    const host =
      environment === "live" ? "pay.paymennt.com" : "pay.test.paymennt.com";
    assert.equal(p.isHostedRedirect(`https://${host}/checkout/fixture`), true);
    for (const raw of [
      `http://${host}/checkout/fixture`,
      `https://user:secret@${host}/checkout/fixture`,
      `https://${host}.evil.invalid/checkout/fixture`,
      environment === "live"
        ? "https://pay.test.paymennt.com/checkout/fixture"
        : "https://pay.paymennt.com/checkout/fixture",
    ])
      assert.equal(p.isHostedRedirect(raw), false);
  }
});
test("registration rejects mixed environment without provider calls or file writes", () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-live-registration-"));
  try {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/register-paymennt-webhook.ts", "register"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          ...production(),
          APP_ENV: "staging",
          PAYMENNT_WEBHOOK_SECRET_FILE: join(dir, "secret.json"),
        },
      },
    );
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout + result.stderr, /fixture-api-secret/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("TEST registration mock securely persists 0600 and prevents retry/secret output", () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-registration-fixture-"));
  mkdirSync(join(dir, "private"), { mode: 0o700 });
  const file = join(dir, "private", "secret.json");
  try {
    const script = `globalThis.fetch=async (url,init)=>{if(url!=="https://api.test.paymennt.com/mer/v2.0/webhooks" || JSON.parse(init.body).address!=="https://staging.example.invalid/api/webhooks/payment")throw Error();return Response.json({success:true,result:{id:"webhook-fixture",hmacKey:"hmac-fixture-do-not-print",address:"https://staging.example.invalid/api/webhooks/payment"}})};process.argv=[process.execPath,"scripts/register-paymennt-webhook.ts","register"];await import("./scripts/register-paymennt-webhook.ts");`;
    const env = {
      ...process.env,
      ...stagingEnv(dir),
      PROVIDER_MODE: "test",
      PAYMENNT_API_KEY: "fixture",
      PAYMENNT_API_SECRET: "fixture-secret",
      PAYMENNT_WEBHOOK_SECRET_FILE: file,
    };
    const run = () =>
      spawnSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", script],
        { env, encoding: "utf8" },
      );
    const first = run();
    assert.equal(first.status, 0);
    assert.doesNotMatch(
      first.stdout + first.stderr,
      /hmac-fixture-do-not-print|fixture-secret/,
    );
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).id, "webhook-fixture");
    const before = readFileSync(file);
    const second = run();
    assert.notEqual(second.status, 0);
    assert.deepEqual(readFileSync(file), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
