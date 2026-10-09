import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, scryptSync } from "node:crypto";
import { HmacVerifier } from "../../server/adapters/providers";
const secret = "http-test-webhook-secret-24-characters";
async function start(port: number, production = false) {
  const dir = mkdtempSync(join(tmpdir(), "tl-http-"));
  const salt = "salt-at-least-16-characters";
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/server.ts"],
    {
      env: {
        ...process.env,
        API_PORT: String(port),
        APP_ORIGIN: `http://127.0.0.1:${port}`,
        DB_PATH: join(dir, "db.sqlite"),
        WEBHOOK_SECRET: secret,
        NODE_ENV: production ? "production" : "test",
        DEMO_MODE: "true",
        OPERATOR_USERS_JSON: JSON.stringify([
          {
            id: "andrea",
            role: "agent",
            salt,
            hash: scryptSync("a-safe-test-password", salt, 64).toString("hex"),
          },
        ]),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Server failed to start")),
      10000,
    );
    child.stdout.on("data", () => {
      clearTimeout(timer);
      resolve();
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Server exited before listening"));
    });
  });
  return { base: `http://127.0.0.1:${port}`, child, dir };
}
async function stop(child: ChildProcess, dir: string) {
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
  });
  rmSync(dir, { recursive: true });
}
test("HTTP validates raw signatures, duplicate events, origin, payload and missing API routes", async () => {
  const f = await start(3102);
  try {
    const body = JSON.stringify({
      type: "message",
      eventId: "http-inbound",
      sourceNumberId: "wa2",
      phone: "+971500001001",
      customer: "Demo",
      text: "Hello",
    });
    let r = await fetch(f.base + "/api/webhooks/whatsapp", {
      method: "POST",
      body,
    });
    assert.equal(r.status, 401);
    const headers = {
      "x-hub-signature-256": new HmacVerifier(secret).sign(body),
    };
    r = await fetch(f.base + "/api/webhooks/whatsapp", {
      method: "POST",
      headers,
      body,
    });
    assert.equal(r.status, 200);
    r = await fetch(f.base + "/api/webhooks/whatsapp", {
      method: "POST",
      headers,
      body,
    });
    assert.deepEqual(await r.json(), { duplicate: true });
    r = await fetch(f.base + "/api/commands", { method: "POST", body: "{}" });
    assert.equal(r.status, 403);
    r = await fetch(f.base + "/api/commands", {
      method: "POST",
      headers: { Origin: f.base, "Idempotency-Key": randomUUID() },
      body: '{"type":"editOrder","lines":[{"productId":"fake","quantity":-1}]}',
    });
    assert.equal(r.status, 400);
    r = await fetch(f.base + "/api/missing", {
      headers: { Accept: "text/html" },
    });
    assert.equal(r.status, 404);
    r = await fetch(f.base + "/api/workspace");
    assert.equal(r.status, 200);
    const data = (await r.json()) as Record<string, unknown>;
    assert.equal("commands" in data, false);
    assert.equal("events" in data, false);
  } finally {
    await stop(f.child, f.dir);
  }
});
test("production sandbox requires login and enforces agent role server-side", async () => {
  const f = await start(3103, true);
  try {
    let r = await fetch(f.base + "/api/workspace");
    assert.equal(r.status, 401);
    r = await fetch(f.base + "/api/login", {
      method: "POST",
      headers: { Origin: f.base },
      body: JSON.stringify({ id: "andrea", password: "a-safe-test-password" }),
    });
    assert.equal(r.status, 200);
    const cookie = r.headers.get("set-cookie")!.split(";")[0]!;
    r = await fetch(f.base + "/api/workspace", { headers: { Cookie: cookie } });
    assert.equal(r.status, 200);
    const data = (await r.json()) as { zones: unknown[] };
    r = await fetch(f.base + "/api/commands", {
      method: "POST",
      headers: {
        Origin: f.base,
        Cookie: cookie,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({ type: "updateZone", zone: data.zones[0] }),
    });
    assert.equal(r.status, 403);
  } finally {
    await stop(f.child, f.dir);
  }
});
