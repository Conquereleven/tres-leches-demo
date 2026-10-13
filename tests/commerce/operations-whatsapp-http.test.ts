import test from "node:test";
import type {
  OperationsNotification,
  Order,
  Payment,
} from "../../server/domain/model";
type FixtureState = {
  port: number;
  customerDisabled: boolean;
  sends: number;
  notification: OperationsNotification;
  orders: Order[];
  payments: Payment[];
};
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
test("internal HTTP worker sends once with customer outbound off; raw signed receipts/challenge preserve payments", async () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-wa-http-"));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/operations-whatsapp-server.ts"],
    {
      env: { ...process.env, DB_PATH: join(dir, "state.sqlite") },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  const next = () =>
    new Promise<FixtureState>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Fixture timeout")),
        10000,
      );
      child.once("message", (v) => {
        clearTimeout(timer);
        resolve(v as FixtureState);
      });
    });
  try {
    const ready = await next();
    assert.equal(ready.customerDisabled, true);
    const base = `http://127.0.0.1:${ready.port}`;
    const inspect = async () => {
      const reply = next();
      child.send("inspect");
      return reply;
    };
    let before = await inspect();
    for (let i = 0; i < 40 && before.notification.status !== "accepted"; i++) {
      await new Promise((r) => setTimeout(r, 50));
      before = await inspect();
    }
    assert.equal(before.sends, 1);
    assert.equal(before.notification.status, "accepted");
    assert.ok(before.notification.acceptedAt);
    assert.equal(before.notification.sentAt, undefined);
    const challenge = await fetch(
      base +
        "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=synthetic-verify-token-for-local-test&hub.challenge=synthetic-challenge",
    );
    assert.equal(challenge.status, 200);
    assert.equal(await challenge.text(), "synthetic-challenge");
    const raw = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "333",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "222" },
                statuses: [
                  {
                    id: "wamid-synthetic",
                    status: "delivered",
                    timestamp: String(Math.floor(Date.now() / 1000)),
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const signature =
      "sha256=" +
      createHmac("sha256", "synthetic-app-secret-for-local-test")
        .update(raw)
        .digest("hex");
    const receipt = async (body: string) =>
      fetch(base + "/api/webhooks/whatsapp", {
        method: "POST",
        headers: {
          "X-Hub-Signature-256": signature,
          "Content-Type": "application/json",
        },
        body,
      });
    assert.equal((await receipt(raw + " ")).status, 401);
    assert.equal((await receipt(raw)).status, 200);
    assert.equal((await receipt(raw)).status, 200);
    let after = await inspect();
    for (let i = 0; i < 40 && after.notification.status !== "delivered"; i++) {
      await new Promise((r) => setTimeout(r, 50));
      after = await inspect();
    }
    assert.equal(after.notification.status, "delivered");
    assert.equal(after.sends, 1);
    assert.deepEqual(after.orders, before.orders);
    assert.deepEqual(after.payments, before.payments);
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});
