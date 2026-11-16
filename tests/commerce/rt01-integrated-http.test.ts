import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  integratedServer,
  checkoutBody,
} from "../fixtures/rt01-integrated-client";

test("real HTTP checkout → mock authoritative payment/replay → workspace/documents → server hold409", async () => {
  const f = await integratedServer(3346);
  try {
    const post = async (
      path: string,
      body: unknown,
      cookie = "",
      key = randomUUID(),
    ) =>
      fetch(f.base + path, {
        method: "POST",
        headers: {
          Origin: f.base,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await post("/api/orders/documents", { ids: ["missing"], format: "csv" }))
        .status,
      401,
    );
    const login = await post("/api/login", {
      id: "fixture-admin",
      password: "fictional-password",
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    for (const pickup of [true, false])
      for (const held of [false, true]) {
        await f.control("pending");
        await f.control("clock", { now: "2026-11-12T10:38:00Z" });
        const key = randomUUID(),
          body = checkoutBody(pickup);
        const create = await post("/api/checkout/web", body, "", key);
        assert.equal(create.status, 200, await create.clone().text());
        const result = (await create.json()) as { orderId: string };
        assert.equal(
          (await post("/api/checkout/web", body, "", key)).status,
          200,
        );
        if (held) await f.control("hold", { orderId: result.orderId });
        await f.control("clock", { now: "2026-11-15T12:51:00Z" });
        await f.control("paid");
        const paid = await post("/api/checkout/reconcile", { key });
        assert.equal(paid.status, 200, await paid.clone().text());
        const before = await f.control("snapshot");
        assert.equal(
          (await post("/api/checkout/reconcile", { key })).status,
          200,
        );
        const after = await f.control("snapshot");
        assert.deepEqual(after.state.orders, before.state.orders);
        assert.deepEqual(after.state.payments, before.state.payments);
        assert.deepEqual(
          after.state.customerNotifications,
          before.state.customerNotifications,
        );
        assert.deepEqual(
          after.state.operationsEmailNotifications,
          before.state.operationsEmailNotifications,
        );
        const workspace = await fetch(f.base + "/api/workspace", {
          headers: { Cookie: cookie },
        });
        assert.equal(workspace.status, 200);
        const data = (await workspace.json()) as {
          orders: Array<{
            id: string;
            version: number;
            paymentFulfillment: { status: string };
          }>;
        };
        const o = data.orders.find((o) => o.id === result.orderId)!;
        assert.equal(
          o.paymentFulfillment.status,
          held ? "review-required" : "auto-rescheduled",
        );
        const csv = await post(
          "/api/orders/documents",
          { ids: [o.id], format: "csv" },
          cookie,
        );
        assert.equal(csv.status, 200);
        const text = await csv.text();
        assert.equal(text.includes("FULFILLMENT REVIEW REQUIRED"), held);
        if (held) assert.doesNotMatch(text, /2026-11-14|4:00 PM/);
        else assert.match(text, /2026-11-16/);
        for (const layout of ["a4", "a5", "a5-two-up"]) {
          for (const format of ["pdf", "zip"]) {
            const r = await post(
              "/api/orders/documents",
              { ids: [o.id], format, kind: "delivery-note", layout },
              cookie,
            );
            assert.equal(r.status, 200);
            assert.ok((await r.arrayBuffer()).byteLength > 100);
          }
        }
        await f.control("assign");
        const stateBefore = await f.control("snapshot");
        const transition = await post(
          "/api/commands",
          {
            type: "transition",
            id: o.id,
            version: o.version,
            state: "Production",
          },
          cookie,
        );
        assert.equal(
          transition.status,
          held ? 409 : 200,
          await transition.clone().text(),
        );
        if (held)
          assert.deepEqual(
            (await f.control("snapshot")).state,
            stateBefore.state,
          );
      }
    const operator = await post("/api/login", {
      id: "fixture-operator",
      password: "fictional-password",
    });
    assert.equal(operator.status, 200);
    const op = operator.headers.get("set-cookie")!.split(";")[0]!;
    assert.equal(
      (
        await post(
          "/api/orders/documents",
          { ids: ["missing"], format: "csv" },
          op,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          "/api/orders/documents",
          {
            ids: Array.from({ length: 501 }, (_, i) => String(i)),
            format: "pdf",
          },
          cookie,
        )
      ).status,
      400,
    );
  } finally {
    await f.close();
  }
});
