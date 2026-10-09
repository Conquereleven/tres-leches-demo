import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHmac, randomUUID } from "node:crypto";
import type { State } from "../../server/domain/model";

test("TL25 HTTP golden path: real adapters, signed WA2/GPS, signed Paymennt, authoritative settlement and fulfillment once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tl25-http-"));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/activation-server.ts"],
    {
      env: {
        ...process.env,
        APP_ENV: "test",
        API_PORT: "3115",
        DB_PATH: join(dir, "db"),
        APP_ORIGIN: "http://127.0.0.1:3115",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const base = "http://127.0.0.1:3115";
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("startup timeout")),
        10000,
      );
      child.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error("startup failed"));
      });
      child.stdout.once("data", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    const workspace = async (): Promise<State> =>
      (await fetch(base + "/api/workspace")).json();
    const command = async (body: unknown) => {
      const response = await fetch(base + "/api/commands", {
        method: "POST",
        headers: {
          Origin: base,
          "Idempotency-Key": randomUUID(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      assert.equal(
        response.status,
        200,
        JSON.stringify(await response.clone().json()),
      );
      return response.json();
    };
    const inbound = async (location = false) => {
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
                      from: "971500009999",
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: location ? "location" : "text",
                      ...(location
                        ? { location: { latitude: 25.07, longitude: 55.14 } }
                        : { text: { body: "Order please" } }),
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
        createHmac("sha256", "tl25-private-fixture-signing-key")
          .update(raw)
          .digest("hex");
      const response = await fetch(base + "/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "X-Hub-Signature-256": signature },
        body: raw,
      });
      assert.equal(response.status, 200);
    };
    const until = async (predicate: (s: State) => boolean) => {
      for (let i = 0; i < 80; i++) {
        const s = await workspace();
        if (predicate(s)) return s;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("Expected operational state not reached");
    };
    await inbound();
    let state = await until((s) => s.conversations.length === 1);
    const c = state.conversations[0]!;
    assert.equal(c.sourceNumberId, "wa2");
    await command({
      type: "assign",
      id: c.id,
      version: c.version,
      agent: "liza",
    });
    state = await workspace();
    const o = await command({
      type: "createOrder",
      id: c.id,
      version: state.conversations[0]!.version,
    });
    await command({
      type: "editOrder",
      id: o.id,
      version: o.version,
      lines: [{ productId: "fixture-product", quantity: 1 }],
    });
    await inbound(true);
    state = await until((s) => s.orders[0]?.quote?.eligible === true);
    assert.equal(state.orders[0]!.quote!.minOrderAed, 30);
    await command({
      type: "requestPayment",
      id: o.id,
      version: state.orders[0]!.version,
    });
    state = await until(
      (s) =>
        !!s.payments[0]?.url &&
        s.conversations[0]!.messages.some(
          (m) => m.direction === "out" && m.status === "sent",
        ),
    );
    const checkout = state.payments[0]!.providerReference;
    const fixture = await (
      await fetch(base + "/__test/settle", {
        method: "POST",
        body: JSON.stringify({ id: checkout, status: "PAID" }),
      })
    ).json();
    assert.equal(fixture.outbound.length, 1);
    assert.match(fixture.outbound[0].url, /\/2\/messages$/);
    const notify = (
      body = fixture.notification,
      signature = fixture.signature,
      topic = "checkout/paid",
    ) =>
      fetch(base + "/api/webhooks/payment", {
        method: "POST",
        headers: {
          "X-PointCheckout-Hmac-Sha256": signature,
          "X-PointCheckout-Topic": topic,
        },
        body,
      });
    assert.equal((await notify(fixture.notification, "")).status, 401);
    assert.equal((await notify(fixture.notification + " ")).status, 401);
    assert.equal(
      (
        await notify(
          fixture.notification,
          fixture.signature,
          "checkout/unknown",
        )
      ).status,
      400,
    );
    assert.equal((await notify()).status, 200);
    state = await workspace();
    assert.equal(state.payments[0]!.status, "paid");
    assert.equal(state.orders[0]!.state, "Confirmed");
    for (const target of [
      "Production",
      "Ready",
      "Out for Delivery",
      "Delivered",
    ]) {
      state = await workspace();
      await command({
        type: "transition",
        id: o.id,
        version: state.orders[0]!.version,
        state: target,
      });
    }
    const before = await workspace();
    assert.equal((await notify()).status, 200);
    const after = await workspace();
    assert.deepEqual(after.orders, before.orders);
    assert.deepEqual(after.conversations, before.conversations);
    assert.equal(after.orders[0]!.state, "Delivered");
  } finally {
    const exited = new Promise((r) => child.once("exit", r));
    child.kill("SIGTERM");
    await exited;
    rmSync(dir, { recursive: true, force: true });
  }
});
