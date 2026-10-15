import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { State } from "../../server/domain/model";
import {
  customerPayload,
  echoPayload,
  historyPayload,
  contactPayload,
  webhook,
  textMessage,
} from "../fixtures/meta-coexistence";
test("inbound-only HTTP: challenge, raw signature, bad origin, durable duplicates, SMB/history/contact and no side effects", async () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-meta-inbound-http-"));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/meta-inbound-server.ts"],
    {
      env: { ...process.env, PORT: "0", DB_PATH: join(dir, "state.sqlite") },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  type Info = {
    port: number;
    disabled: boolean;
    providerCalls: number;
    state: State;
  };
  const next = () =>
    new Promise<Info>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Local fixture timeout")),
        10000,
      );
      child.once("message", (v) => {
        clearTimeout(timer);
        resolve(v as Info);
      });
    });
  try {
    const before = await next();
    assert.equal(before.disabled, true);
    const base = `http://127.0.0.1:${before.port}`;
    const inspect = () => {
      const p = next();
      child.send("inspect");
      return p;
    };
    const challenge =
      "/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=synthetic&hub.verify_token=";
    const good = await fetch(
      base + challenge + "synthetic-verify-token-for-local-test",
    );
    assert.equal(good.status, 200);
    assert.equal(await good.text(), "synthetic");
    assert.equal((await fetch(base + challenge + "wrong")).status, 403);
    const post = async (value: unknown, alter = false) => {
      const raw = JSON.stringify(value);
      return fetch(base + "/api/webhooks/whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256":
            "sha256=" +
            createHmac("sha256", "synthetic-app-secret-for-local-test")
              .update(raw)
              .digest("hex"),
        },
        body: alter ? raw + " " : raw,
      });
    };
    assert.equal((await post(customerPayload(), true)).status, 401);
    assert.equal(
      (
        await post(
          webhook("messages", {
            metadata: { phone_number_id: "wrong" },
            messages: [textMessage("wrong")],
          }),
        )
      ).status,
      400,
    );
    const wrong = customerPayload();
    wrong.entry[0]!.id = "999";
    assert.equal((await post(wrong)).status, 400);
    const payloads = [
      customerPayload(),
      echoPayload(),
      historyPayload(),
      contactPayload(),
    ];
    for (const payload of payloads) {
      assert.equal((await post(payload)).status, 200);
      assert.equal((await post(payload)).status, 200);
    }
    // The previous universal 64 KiB limit silently prevented documented history chunks.
    const large = webhook("history", {
      history: [
        {
          threads: [
            {
              id: "971500000002",
              messages: Array.from({ length: 40 }, (_, i) => ({
                ...textMessage(`history-${i}`, -86400),
                from: "971500000002",
                text: { body: "x".repeat(2000) },
              })),
            },
          ],
        },
      ],
    });
    assert.ok(JSON.stringify(large).length > 65536);
    assert.equal((await post(large)).status, 200);
    let after = await inspect();
    for (
      let i = 0;
      i < 80 &&
      after.state.inboundDeliveries?.some((d) => d.status === "pending");
      i++
    ) {
      await new Promise((r) => setTimeout(r, 100));
      after = await inspect();
    }
    assert.ok(after.state.inboundDeliveries?.every((d) => d.status === "done"));
    assert.equal(after.state.conversations.length, 2);
    assert.equal(after.state.conversations[0]!.messages.length, 4);
    assert.equal(after.state.conversations[0]!.sourceNumberId, "wa1");
    assert.equal(
      after.state.conversations[0]!.messages.filter(
        (m) => m.origin === "business-app",
      ).length,
      1,
    );
    assert.deepEqual(after.state.orders, before.state.orders);
    assert.deepEqual(after.state.payments, before.state.payments);
    assert.equal(after.state.jobs.length, 0);
    assert.equal(after.providerCalls, 0);
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((r) => child.once("exit", () => r()));
    rmSync(dir, { recursive: true, force: true });
  }
});
