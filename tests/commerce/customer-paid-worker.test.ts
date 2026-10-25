import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
test("background worker sends newly verified confirmation without any Operations visit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "paid-worker-")),
    base = "http://127.0.0.1:3197";
  const emails: unknown[] = [];
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/web-checkout-server.ts"],
    {
      env: {
        ...process.env,
        DB_PATH: join(dir, "state.sqlite"),
        PORT: "3197",
        API_PORT: "3197",
        APP_ORIGIN: base,
        FIXTURE_PAYMENT_STATUS: "PAID",
        CUSTOMER_PAID_EMAIL_FIXTURE: "true",
        CUSTOMER_EMAIL_ENABLED: "true",
        CUSTOMER_ORDER_PAID_EMAIL_ENABLED: "true",
        CUSTOMER_ORDER_PAID_EMAIL_SINCE: new Date(
          Date.now() - 1000,
        ).toISOString(),
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  child.on("message", (m) => {
    if (
      m &&
      typeof m === "object" &&
      "type" in m &&
      m.type === "customer-email-accepted"
    )
      emails.push(m);
  });
  try {
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    const post = (path: string, body: unknown, key?: string) =>
      fetch(base + path, {
        method: "POST",
        headers: {
          Origin: base,
          "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: JSON.stringify(body),
      });
    const key = randomUUID(),
      date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const response = await post(
      "/api/checkout/web",
      {
        fulfillmentMethod: "pickup",
        lines: [
          { productId: "conchas-traditional-chocolate-mini-40-g", quantity: 1 },
        ],
        pickup: { pickupDate: date, preferredTime: "4:00 PM – 9:00 PM" },
        customer: {
          firstName: "Alex",
          lastName: "Fixture",
          phone: "0500000000",
          email: "alex@example.invalid",
        },
        billing: {
          sameAsDelivery: false,
          name: "Alex Fixture",
          address1: "Fixture Street",
          city: "Dubai",
          country: "AE",
        },
      },
      key,
    );
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    assert.equal((await post("/api/checkout/reconcile", { key })).status, 200);
    for (let i = 0; i < 100 && !emails.length; i++)
      await new Promise((r) => setTimeout(r, 50));
    assert.equal(emails.length, 1);
    await post("/api/checkout/reconcile", { key });
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(emails.length, 1);
    const unknown = await post("/api/checkout/reconcile", {
      key: randomUUID(),
    });
    assert.equal(unknown.status, 404);
    const body = await unknown.text();
    assert.doesNotMatch(body, /#001|alex@|Fixture Street|amountFils|orderId/);
  } finally {
    child.kill();
    await new Promise<void>((r) => {
      if (child.exitCode !== null) r();
      else child.once("exit", () => r());
    });
    rmSync(dir, { recursive: true, force: true });
  }
});
