import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scryptSync } from "node:crypto";
import { HmacVerifier } from "../../server/adapters/providers";

test("integration HTTP protects sessions, accepts signed Meta batches and disables demo/unsigned payment paths", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tl-integration-http-"));
  const secret = "synthetic-secret-at-least-24-characters";
  const origin = "https://integration.example.invalid";
  const salt = "synthetic-user-salt";
  const child = spawn(process.execPath, ["--import", "tsx", "server/main.ts"], {
    env: {
      ...process.env,
      API_PORT: "3105",
      NODE_ENV: "test",
      INTEGRATION_MODE: "true",
      DB_PATH: join(dir, "integration.sqlite"),
      APP_ORIGIN: origin,
      WEBHOOK_SECRET: secret,
      PAYMENNT_API_KEY: "synthetic",
      PAYMENNT_API_SECRET: "synthetic",
      META_ACCESS_TOKEN: "synthetic",
      META_APP_SECRET: secret,
      META_VERIFY_TOKEN: secret,
      META_GRAPH_VERSION: "v99.0",
      MAPBOX_ACCESS_TOKEN: "synthetic",
      MAPBOX_PERMANENT_ENABLED: "true",
      META_NUMBERS_JSON: JSON.stringify(
        [1, 2, 3].map((n) => ({
          id: `wa${n}`,
          label: `WA${n}`,
          phone: `+97150000000${n}`,
          phoneNumberId: String(n),
          wabaId: "100",
        })),
      ),
      OPERATOR_USERS_JSON: JSON.stringify([
        {
          id: "operator",
          role: "operator",
          salt,
          hash: scryptSync("synthetic-password", salt, 64).toString("hex"),
        },
      ]),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("server startup timeout")),
        10000,
      );
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("server exited"));
      });
      child.stdout.once("data", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    const base = "http://127.0.0.1:3105/api";
    assert.equal((await fetch(base + "/workspace")).status, 401);
    assert.equal(
      (
        await fetch(
          base +
            "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=" +
            secret +
            "&hub.challenge=123",
        )
      ).status,
      200,
    );
    assert.equal(
      (await fetch(base + "/webhooks/payment", { method: "POST", body: "{}" }))
        .status,
      503,
    );
    const login = await fetch(base + "/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "operator", password: "synthetic-password" }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    assert.match(
      login.headers.get("set-cookie")!,
      /HttpOnly; Secure; SameSite=Strict/,
    );
    assert.equal(
      (
        await fetch(base + "/demo/payment", {
          method: "POST",
          headers: { Origin: origin, Cookie: cookie },
          body: "{}",
        })
      ).status,
      404,
    );
    const payload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "100",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "2" },
                messages: [
                  {
                    id: "http-synthetic",
                    from: "971500000099",
                    timestamp: "1700000000",
                    type: "text",
                    text: { body: "Synthetic fixture" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    assert.equal(
      (
        await fetch(base + "/webhooks/whatsapp", {
          method: "POST",
          body: payload,
        })
      ).status,
      401,
    );
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await fetch(base + "/webhooks/whatsapp", {
            method: "POST",
            headers: {
              "x-hub-signature-256": new HmacVerifier(secret).sign(payload),
            },
            body: payload,
          })
        ).status,
        200,
      );
    const ready = (await (await fetch(base + "/ready")).json()) as {
      storage: boolean;
      pilotReady: boolean;
    };
    assert.equal(ready.storage, true);
    assert.equal(ready.pilotReady, undefined);
    assert.equal(
      (
        await fetch(base + "/logout", {
          method: "POST",
          headers: { Origin: origin, Cookie: cookie },
          body: "{}",
        })
      ).status,
      200,
    );
    assert.equal(
      (await fetch(base + "/workspace", { headers: { Cookie: cookie } }))
        .status,
      401,
    );
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", () => resolve());
    });
    rmSync(dir, { recursive: true, force: true });
  }
});
