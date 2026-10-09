import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHmac, randomUUID } from "node:crypto";
import type { Workspace } from "../../src/commerce/api";
test("TL26 signed-provider supervised order golden path and HTTP approvals", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tl26-http-")),
    base = "http://127.0.0.1:3117";
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/activation-server.ts"],
    {
      env: {
        ...process.env,
        AI_TEST_FIXTURE: "true",
        APP_ENV: "test",
        API_PORT: "3117",
        DB_PATH: join(dir, "db"),
        APP_ORIGIN: base,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("startup timeout")), 10000);
      child.once("exit", () => {
        clearTimeout(t);
        reject(new Error("startup failed"));
      });
      child.stdout.once("data", () => {
        clearTimeout(t);
        resolve();
      });
    });
    const state = async (): Promise<Workspace> =>
      (await fetch(base + "/api/workspace")).json();
    const post = async (path: string, body: unknown) => {
      const r = await fetch(base + "/api/" + path, {
        method: "POST",
        headers: {
          Origin: base,
          "Content-Type": "application/json",
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify(body),
      });
      assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
      return r.json();
    };
    const inbound = async (gps = false) => {
      const raw = JSON.stringify({
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
                      id: randomUUID(),
                      from: "971500009988",
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: gps ? "location" : "text",
                      ...(gps
                        ? { location: { latitude: 25.07, longitude: 55.14 } }
                        : {
                            text: { body: "Hi, I want to order a tres leches" },
                          }),
                    },
                  ],
                },
              },
            ],
          },
        ],
      });
      const r = await fetch(base + "/api/webhooks/whatsapp", {
        method: "POST",
        headers: {
          "X-Hub-Signature-256":
            "sha256=" +
            createHmac("sha256", "tl25-private-fixture-signing-key")
              .update(raw)
              .digest("hex"),
        },
        body: raw,
      });
      assert.equal(r.status, 200);
    };
    const until = async (predicate: (w: Workspace) => boolean) => {
      for (let i = 0; i < 100; i++) {
        const w = await state();
        if (predicate(w)) return w;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("state not reached");
    };
    await inbound();
    let w = await until((w) => w.conversations.length === 1);
    const id = w.conversations[0]!.id;
    await post("ai/control", {
      id,
      version: w.conversations[0]!.version,
      action: "takeover",
    });
    w = await state();
    await post("ai/generate", { id, version: w.conversations[0]!.version });
    w = await state();
    let run = w.ai!.runs.at(-1)!;
    assert.equal(run.intent, "order_intent");
    assert.equal(w.orders.length, 0);
    assert.equal(w.payments.length, 0);
    await post("ai/approve", {
      id,
      version: w.conversations[0]!.version,
      runId: run.id,
      action: "send",
    });
    for (let i = 0; i < 2; i++) {
      w = await state();
      await post("ai/approve", {
        id,
        version: w.conversations[0]!.version,
        runId: run.id,
        action: "action",
      });
    }
    await inbound(true);
    w = await until((w) => w.orders[0]?.quote?.eligible === true);
    await post("ai/generate", { id, version: w.conversations[0]!.version });
    w = await state();
    run = w.ai!.runs.at(-1)!;
    assert.equal(
      run.tools.find((t) => t.name === "prepare_payment_request")!.code,
      "READY",
    );
    assert.equal(w.payments.length, 0);
    await post("ai/approve", {
      id,
      version: w.conversations[0]!.version,
      runId: run.id,
      action: "action",
    });
    w = await until(
      (w) =>
        !!w.payments[0]?.url &&
        w.conversations[0]!.messages.some(
          (m) => m.paymentContext && m.status === "sent",
        ),
    );
    const fixture = await (
      await fetch(base + "/__test/settle", {
        method: "POST",
        body: JSON.stringify({
          id: w.payments[0]!.providerReference,
          status: "PAID",
        }),
      })
    ).json();
    assert.ok(
      fixture.outbound.every((m: { url: string }) =>
        /\/2\/messages$/.test(m.url),
      ),
    );
    const notify = () =>
      fetch(base + "/api/webhooks/payment", {
        method: "POST",
        headers: {
          "X-PointCheckout-Hmac-Sha256": fixture.signature,
          "X-PointCheckout-Topic": "checkout/paid",
        },
        body: fixture.notification,
      });
    assert.equal((await notify()).status, 200);
    w = await state();
    assert.equal(w.payments[0]!.status, "paid");
    assert.equal(w.orders[0]!.state, "Confirmed");
    const before = w.orders[0]!.audit;
    assert.equal((await notify()).status, 200);
    assert.deepEqual((await state()).orders[0]!.audit, before);
    const forged = await fetch(base + "/api/ai/approve", {
      method: "POST",
      headers: { Origin: base },
      body: JSON.stringify({
        id,
        runId: run.id,
        version: w.conversations[0]!.version,
        action: "markPaid",
      }),
    });
    assert.equal(forged.status, 400);
  } finally {
    const end = new Promise((r) => child.once("exit", r));
    child.kill("SIGTERM");
    await end;
    rmSync(dir, { recursive: true, force: true });
  }
});
