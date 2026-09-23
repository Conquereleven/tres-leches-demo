import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHmac } from "node:crypto";
import { stagingEnv } from "../fixtures/staging";
async function harness(offline = false) {
  const dir = mkdtempSync(join(tmpdir(), "web-http-"));
  const base = offline ? "http://127.0.0.1:3157" : "http://127.0.0.1:3156";
  const e: NodeJS.ProcessEnv = offline
    ? {
        ...stagingEnv(dir),
        APP_ENV: "production",
        AI_ENABLED: "false",
        AI_AGENT_DEFAULT_MODE: "copilot",
        AI_AUTONOMOUS_ALLOWED: "false",
      }
    : {};
  delete e.STAGING_SEED;
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      offline ? "server/main.ts" : "tests/fixtures/web-checkout-server.ts",
    ],
    {
      env: {
        ...process.env,
        ...e,
        PAYMENNT_PUBLIC_KEY: "pk_test_public_fixture",
        DB_PATH: join(dir, "store.sqlite"),
        API_PORT: offline ? "3157" : "3156",
        PORT: offline ? "3157" : "3156",
        APP_ORIGIN: offline ? "https://production.example.invalid" : base,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  return {
    base,
    child,
    close: async () => {
      child.kill();
      await new Promise<void>((r) => {
        if (child.exitCode !== null) r();
        else child.once("exit", () => r());
      });
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("public checkout HTTP, signatures, authoritative settlement and untrusted return", async () => {
  const h = await harness();
  try {
    const post = (path: string, data: unknown, key?: string) =>
      fetch(h.base + path, {
        method: "POST",
        headers: {
          Origin: h.base,
          "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: JSON.stringify(data),
      });
    const config = await (await fetch(h.base + "/api/checkout/config")).json();
    assert.equal(config.enabled, true);
    assert.equal(config.publicKey, "pk_test_public_fixture");
    assert.equal(JSON.stringify(config).includes("fixture-secret"), false);
    assert.equal(config.product.priceFils, 2500);
    assert.equal(JSON.stringify(config).includes("fixture-key"), false);
    const input = {
      productId: "pan-de-muerto",
      quantity: 2,
      zoneId: "jlt-cluster-c",
      customer: "UAT reviewer",
      phone: "0000000000",
      address: "UAT building, apartment 1",
    };
    const key = randomUUID();
    assert.equal(
      (await post("/api/checkout", { ...input, quantity: 1 }, randomUUID()))
        .status,
      422,
    );
    assert.equal(
      (await post("/api/checkout", { ...input, amount: 1 }, randomUUID()))
        .status,
      400,
    );
    assert.equal(
      (
        await fetch(h.base + "/api/checkout", {
          method: "POST",
          headers: {
            Origin: "https://evil.invalid",
            "Content-Type": "application/json",
            "Idempotency-Key": randomUUID(),
          },
          body: JSON.stringify(input),
        })
      ).status,
      403,
    );
    const r = await post("/api/checkout", input, key);
    assert.equal(r.status, 200);
    const checkout = await r.json();
    assert.equal(checkout.amountFils, 5000);
    assert.equal(
      (await (await post("/api/checkout", input, key)).json()).orderId,
      checkout.orderId,
    );
    assert.equal(
      (await post("/api/checkout/status", { key, status: "paid" })).status,
      400,
    );
    assert.equal(
      (await post("/api/checkout/status", { key: randomUUID() })).status,
      404,
    );
    const id = checkout.url.split("/").at(-1);
    const event = JSON.stringify({
      id,
      status: "PAID",
      statusUpdateTimestamp: "2026-09-22T00:00:00Z",
    });
    const signature = createHmac("sha256", "fixture-hmac-key")
      .update(event)
      .digest("base64");
    const hook = (sig: string) =>
      fetch(h.base + "/api/webhooks/payment", {
        method: "POST",
        headers: {
          "X-PointCheckout-Hmac-Sha256": sig,
          "X-PointCheckout-Topic": "checkout/paid",
        },
        body: event,
      });
    assert.equal((await hook("invalid")).status, 401);
    // Signed claim alone cannot settle while authoritative GET still says PENDING.
    assert.notEqual((await hook(signature)).status, 200);
    assert.equal(
      (await (await post("/api/checkout/status", { key })).json())
        .paymentStatus,
      "pending",
    );
    await new Promise<void>((resolve) => {
      h.child.once("message", () => resolve());
      h.child.send("PAID");
    });
    assert.equal((await hook(signature)).status, 200);
    assert.equal((await hook(signature)).status, 200);
    const confirmed = await (
      await post("/api/checkout/status", { key })
    ).json();
    assert.equal(confirmed.paymentStatus, "paid");
    assert.equal(confirmed.status, "Confirmed");
  } finally {
    await h.close();
  }
});
test("production offline public checkout cannot create a payment", async () => {
  const h = await harness(true);
  try {
    assert.equal(
      (await (await fetch(h.base + "/api/checkout/config")).json()).enabled,
      false,
    );
    assert.equal(
      (await (await fetch(h.base + "/api/checkout/config")).json()).publicKey,
      null,
    );
    assert.equal(
      (
        await fetch(h.base + "/api/checkout/token", {
          method: "POST",
          body: "{}",
        })
      ).status,
      503,
    );
    assert.equal(
      (await fetch(h.base + "/api/checkout", { method: "POST", body: "{}" }))
        .status,
      503,
    );
  } finally {
    await h.close();
  }
});
