import test from "node:test";
import assert from "node:assert/strict";
import { Store, seed } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";

/**
 * One site order awaiting payment (checkout-1), one site payment whose
 * checkout has not been associated yet (payment-2), and a provider that
 * answers per checkout id like the real account does.
 */
function setup() {
  const state = seed();
  const at = new Date().toISOString();
  for (const n of [1, 2]) {
    state.orders.push({
      id: `order-${n}`,
      conversationId: "c",
      state: "Awaiting Payment",
      version: 0,
      lines: [],
      quote: null,
      paymentId: `payment-${n}`,
      audit: [],
    });
    state.payments.push({
      id: `payment-${n}`,
      orderId: `order-${n}`,
      amountFils: 3000,
      currency: "AED",
      provider: "paymennt",
      ...(n === 1 ? { providerReference: "checkout-1" } : {}),
      status: "pending",
      createdAt: at,
      updatedAt: at,
      timeline: [],
    });
  }
  const store = new Store(":memory:", "test", state);
  const checkouts = new Map<string, Record<string, unknown> | number>([
    // Site checkout, associated.
    [
      "checkout-1",
      {
        id: "checkout-1",
        requestId: "payment-1",
        orderId: "order-1",
        amount: 30,
        currency: "AED",
        status: "PAID",
      },
    ],
    // Site checkout whose reference has not been saved yet.
    [
      "checkout-2",
      {
        id: "checkout-2",
        requestId: "payment-2",
        orderId: "order-2",
        amount: 30,
        currency: "AED",
        status: "PAID",
      },
    ],
    // Created elsewhere on the same merchant account: foreign request id, no order id.
    [
      "external-link",
      {
        id: "external-link",
        requestId: "7b1d9c7e-0000-4000-8000-000000000001",
        orderId: null,
        amount: 374,
        currency: "AED",
        status: "PAID",
        branchName: "Counter",
      },
    ],
    // Created elsewhere, free-text order label.
    [
      "external-text",
      {
        id: "external-text",
        requestId: "7b1d9c7e-0000-4000-8000-000000000002",
        orderId: "Maria ",
        amount: 157,
        currency: "AED",
        status: "PAID",
      },
    ],
    // Inconsistent: foreign request id but one of our order ids.
    [
      "odd-order",
      {
        id: "odd-order",
        requestId: "7b1d9c7e-0000-4000-8000-000000000003",
        orderId: "order-1",
        amount: 30,
        currency: "AED",
        status: "PAID",
      },
    ],
    // The provider answers with a different checkout than the one asked for.
    [
      "wrong-id",
      {
        id: "someone-else",
        requestId: "x",
        orderId: null,
        amount: 1,
        currency: "AED",
        status: "PAID",
      },
    ],
    [
      "external-new",
      {
        id: "external-new",
        requestId: "7b1d9c7e-0000-4000-8000-000000000004",
        orderId: null,
        amount: 20,
        currency: "AED",
        status: "PAID",
      },
    ],
    ["not-found", 404],
    ["provider-down", 500],
  ]);
  const gets: string[] = [];
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url) => {
      const id = decodeURIComponent(String(url).split("/").at(-1)!);
      gets.push(id);
      const found = checkouts.get(id);
      if (typeof found === "number" || !found)
        return new Response("private provider payload", {
          status: (found as number) ?? 404,
        });
      return new Response(JSON.stringify({ success: true, result: found }));
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
  );
  // Tests that exercise the new external path explicitly opt in.
  // An absent activation cutoff must never acknowledge an external checkout.
  service.externalCheckoutAcknowledgementSince = Date.now() - 60_000;
  const business = () => {
    const { orders, payments } = store.read();
    return JSON.stringify({ orders, payments });
  };
  const receipt = (checkoutId: string) =>
    store
      .read()
      .paymentNotifications!.find((r) => r.checkoutId === checkoutId)!;
  return { store, service, gets, business, receipt };
}
const retry = (error: unknown) =>
  (error as { status?: number }).status === 503 &&
  /Checkout aún no asociado/.test((error as Error).message);

for (const id of ["external-link", "external-text"])
  test(`confirmed external checkout ${id} is acknowledged once and touches no order or payment`, async () => {
    const f = setup();
    try {
      const before = f.business();
      assert.deepEqual(
        await f.service.acceptPaymentNotification({ id, status: "PAID" }),
        { duplicate: false },
      );
      assert.equal(f.receipt(id).outcome, "external");
      assert.ok(f.receipt(id).completedAt);
      assert.equal(f.business(), before);
      // Idempotent: the provider's retries are duplicates and cost no lookup.
      const lookups = f.gets.length;
      assert.deepEqual(
        await f.service.acceptPaymentNotification({ id, status: "PAID" }),
        { duplicate: true },
      );
      assert.equal(f.gets.length, lookups);
      assert.equal(f.store.read().paymentNotifications!.length, 1);
    } finally {
      f.store.close();
    }
  });

test("a website checkout awaiting association is never mistaken for external: retry, then reconcile", async () => {
  const f = setup();
  try {
    await assert.rejects(
      f.service.acceptPaymentNotification({ id: "checkout-2", status: "PAID" }),
      retry,
    );
    assert.equal(f.receipt("checkout-2").completedAt, undefined);
    assert.equal(f.receipt("checkout-2").outcome, undefined);
    assert.equal(f.store.read().payments[1]!.status, "pending");
    // The association lands; the provider's retry now settles the order.
    f.store.write((s) => {
      s.payments[1]!.providerReference = "checkout-2";
    });
    assert.deepEqual(
      await f.service.acceptPaymentNotification({
        id: "checkout-2",
        status: "PAID",
      }),
      { duplicate: false },
    );
    assert.equal(f.store.read().payments[1]!.status, "paid");
    assert.equal(f.receipt("checkout-2").outcome, undefined);
  } finally {
    f.store.close();
  }
});

for (const id of [
  "odd-order",
  "wrong-id",
  "not-found",
  "provider-down",
  "never-heard-of-it",
])
  test(`unknown or inconsistent reference ${id} keeps the retry answer and stays open`, async () => {
    const f = setup();
    try {
      const before = f.business();
      await assert.rejects(
        f.service.acceptPaymentNotification({ id, status: "PAID" }),
        retry,
      );
      assert.equal(f.receipt(id).completedAt, undefined);
      assert.equal(f.receipt(id).outcome, undefined);
      assert.equal(f.receipt(id).attempts, 1);
      assert.equal(f.business(), before);
    } finally {
      f.store.close();
    }
  });

test("matched website checkouts reconcile exactly as before, with no ownership lookup", async () => {
  const f = setup();
  try {
    await f.service.acceptPaymentNotification({
      id: "checkout-1",
      status: "PAID",
    });
    assert.equal(f.store.read().payments[0]!.status, "paid");
    assert.equal(f.store.read().orders[0]!.state, "Confirmed");
    assert.equal(f.receipt("checkout-1").outcome, undefined);
    assert.deepEqual(f.gets, ["checkout-1"]);
  } finally {
    f.store.close();
  }
});

test("without an explicit activation instant even a new external receipt remains open", async () => {
  const f = setup();
  try {
    f.service.externalCheckoutAcknowledgementSince = undefined;
    await assert.rejects(
      f.service.acceptPaymentNotification({
        id: "external-new",
        status: "PAID",
      }),
      retry,
    );
    assert.equal(f.receipt("external-new").completedAt, undefined);
    assert.equal(f.receipt("external-new").outcome, undefined);
    assert.deepEqual(f.gets, []);
  } finally {
    f.store.close();
  }
});

test("legacy unmatched receipts stay open while new external receipts are acknowledged", async () => {
  const f = setup();
  try {
    const before = f.business();
    const historicalAt = "2026-10-02T11:19:51.136Z";
    const cutoff = Date.now() - 60_000;
    f.service.externalCheckoutAcknowledgementSince = cutoff;
    f.store.write((s) => {
      s.paymentNotifications = [
        "external-link",
        "external-text",
        "provider-down",
      ].map((checkoutId, i) => ({
        id: "stored-" + i,
        checkoutId,
        status: "PAID",
        receivedAt: historicalAt,
        nextAt: 0,
        attempts: 179,
      }));
    });
    const legacyBefore = JSON.stringify(f.store.read().paymentNotifications);
    await f.service.drain();
    assert.equal(
      JSON.stringify(f.store.read().paymentNotifications),
      legacyBefore,
    );
    assert.deepEqual(f.gets, []);
    assert.equal(f.business(), before);

    await f.service.acceptPaymentNotification({
      id: "external-new",
      status: "PAID",
    });
    assert.equal(f.receipt("external-new").outcome, "external");
    assert.ok(f.receipt("external-new").completedAt);
    assert.equal(
      JSON.stringify(f.store.read().paymentNotifications!.slice(0, 3)),
      legacyBefore,
    );
    assert.deepEqual(f.gets, ["external-new"]);
    assert.equal(f.business(), before);
  } finally {
    f.store.close();
  }
});

test("Paymennt retries of a legacy checkout cannot close historical or newly created receipts", async () => {
  const f = setup();
  try {
    const { notificationIdentity } =
      await import("../../server/adapters/paymennt-notification");
    const oldEvent = { id: "external-link", status: "PAID" };
    const oldId = notificationIdentity(oldEvent);
    f.store.write((s) => {
      s.paymentNotifications = [
        {
          id: oldId,
          checkoutId: "external-link",
          status: "PAID",
          receivedAt: "2026-10-02T11:19:51.136Z",
          nextAt: 0,
          attempts: 179,
        },
      ];
    });
    await assert.rejects(f.service.acceptPaymentNotification(oldEvent), retry);
    assert.equal(f.receipt("external-link").completedAt, undefined);
    assert.deepEqual(f.gets, []);

    await assert.rejects(
      f.service.acceptPaymentNotification({
        id: "external-link",
        status: "CANCELLED",
      }),
      retry,
    );
    assert.equal(
      f.store
        .read()
        .paymentNotifications!.filter((r) => r.outcome === "external").length,
      0,
    );
    assert.deepEqual(f.gets, []);
    const before = f.store.read().paymentNotifications!.map((r) => r.attempts);
    await f.service.drain();
    assert.deepEqual(
      f.store.read().paymentNotifications!.map((r) => r.attempts),
      before,
    );
    assert.equal(f.store.read().orders.length, 2);
    assert.equal(f.store.read().payments.length, 2);
  } finally {
    f.store.close();
  }
});

// ---- Activation cutoff: parsing, the hard floor, restarts and the real backlog ----
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import {
  EXTERNAL_ACK_FLOOR_MS,
  parseExternalAckSince,
} from "../../server/domain/external-ack";

test("the cutoff must be an exact, real UTC instant; unset means off", () => {
  assert.equal(parseExternalAckSince(undefined), undefined);
  assert.equal(
    parseExternalAckSince("2026-10-12T08:00:00Z"),
    Date.parse("2026-10-12T08:00:00Z"),
  );
  assert.equal(
    parseExternalAckSince("2026-10-12T08:00:00.5Z"),
    Date.parse("2026-10-12T08:00:00.500Z"),
  );
  for (const bad of [
    "",
    "true",
    "now",
    "2026-10-12",
    "2026-10-12T08:00:00", // no timezone
    "2026-10-12T08:00:00+04:00", // local offset
    "2026-10-12 08:00:00Z",
    "2026-10-12T08:00Z",
    "2026-02-30T00:00:00Z", // rolls forward to 2 March if accepted
    "2026-13-01T00:00:00Z",
    "2026-10-12T25:00:00Z",
    " 2026-10-12T08:00:00Z",
    "1791561600000",
  ])
    assert.throws(
      () => parseExternalAckSince(bad),
      /PAYMENNT_EXTERNAL_ACK_SINCE/,
      bad,
    );
});

test("a cutoff typed too early is raised to the floor, so the audited backlog can never qualify", async () => {
  // Every audited Production receipt was first received between these instants.
  const oldest = Date.parse("2026-10-02T11:19:51.136Z");
  const newest = Date.parse("2026-10-09T10:53:11.465Z");
  assert.ok(newest < EXTERNAL_ACK_FLOOR_MS);
  for (const early of [
    "2020-01-01T00:00:00Z",
    "2026-10-01T00:00:00Z",
    "2026-10-09T10:00:00Z",
  ])
    assert.equal(parseExternalAckSince(early), EXTERNAL_ACK_FLOOR_MS);
  const f = setup();
  try {
    f.service.externalCheckoutAcknowledgementSince = parseExternalAckSince(
      "2020-01-01T00:00:00Z",
    );
    f.store.write((s) => {
      s.paymentNotifications = Array.from({ length: 31 }, (_, i) => ({
        id: `audited-${i}`,
        checkoutId: i % 2 ? "external-link" : "external-text",
        status: i === 30 ? "CANCELLED" : "PAID",
        receivedAt: new Date(
          oldest + ((newest - oldest) * i) / 30,
        ).toISOString(),
        nextAt: 0,
        attempts: 100 + i,
      }));
    });
    const stored = JSON.stringify(f.store.read().paymentNotifications);
    const business = f.business();
    for (let pass = 0; pass < 5; pass++) await f.service.drain();
    assert.equal(JSON.stringify(f.store.read().paymentNotifications), stored);
    assert.deepEqual(f.gets, []);
    assert.equal(f.business(), business);
  } finally {
    f.store.close();
  }
});

test("restart durability: a new process with the same, a later or no cutoff leaves historical receipts open", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ext-ack-"));
  const path = join(dir, "state.sqlite");
  const historical = [
    {
      id: "h-1",
      checkoutId: "external-link",
      status: "PAID",
      receivedAt: "2026-10-02T11:19:51.136Z",
      nextAt: 0,
      attempts: 179,
    },
    {
      id: "h-2",
      checkoutId: "external-text",
      status: "PAID",
      receivedAt: "2026-10-09T10:53:11.465Z",
      nextAt: 0,
      attempts: 7,
    },
  ];
  const open = (since: number | undefined) => {
    const store = new Store(path, "test");
    const gets: string[] = [];
    const provider = new PaymenntProvider(
      { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
      async (url) => {
        const id = decodeURIComponent(String(url).split("/").at(-1)!);
        gets.push(id);
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              id,
              requestId: "7b1d9c7e-0000-4000-8000-0000000000aa",
              orderId: null,
              amount: 10,
              currency: "AED",
              status: "PAID",
            },
          }),
        );
      },
    );
    const service = new CommerceService(
      store,
      new DisabledWhatsAppProvider(),
      provider,
    );
    service.externalCheckoutAcknowledgementSince = since;
    return { store, service, gets };
  };
  try {
    const first = open(undefined);
    first.store.write((s) => {
      s.paymentNotifications = structuredClone(historical);
    });
    first.store.close();
    const cutoff = Date.now() - 1000;
    for (const since of [
      cutoff,
      cutoff,
      Date.now() + 3600_000,
      undefined,
      cutoff,
    ]) {
      const run = open(since);
      try {
        const attemptsBefore = run.store
          .read()
          .paymentNotifications!.filter((r) => r.id.startsWith("h-"))
          .map((r) => r.attempts);
        await run.service.drain();
        // Paymennt retries the old event, and sends a new status for the old checkout.
        await assert.rejects(
          run.service.acceptPaymentNotification({
            id: "external-link",
            status: "PAID",
          }),
          retry,
        );
        await assert.rejects(
          run.service.acceptPaymentNotification({
            id: "external-link",
            status: "REFUNDED",
          }),
          retry,
        );
        const receipts = run.store.read().paymentNotifications!;
        assert.equal(
          receipts.filter((r) => r.outcome === "external").length,
          0,
        );
        assert.equal(receipts.filter((r) => r.completedAt).length, 0);
        const kept = receipts.filter((r) => r.id.startsWith("h-"));
        // Identity, first-received time and open state never change.
        assert.deepEqual(
          kept.map((r) => [r.id, r.checkoutId, r.status, r.receivedAt]),
          historical.map((r) => [r.id, r.checkoutId, r.status, r.receivedAt]),
        );
        // With a cutoff the worker does not touch them at all. With none it
        // retries them as it does today: the counter grows, nothing closes.
        if (since !== undefined)
          assert.deepEqual(
            kept.map((r) => r.attempts),
            attemptsBefore,
          );
        else assert.ok(kept.every((r, i) => r.attempts >= attemptsBefore[i]!));
        assert.deepEqual(
          run.gets,
          [],
          "no provider lookup is spent on historical checkouts",
        );
      } finally {
        run.store.close();
      }
    }
    // After all those restarts a genuinely new external checkout is still acknowledged.
    const last = open(cutoff);
    try {
      assert.deepEqual(
        await last.service.acceptPaymentNotification({
          id: "brand-new",
          status: "PAID",
        }),
        { duplicate: false },
      );
      const fresh = last.store
        .read()
        .paymentNotifications!.find((r) => r.checkoutId === "brand-new")!;
      assert.equal(fresh.outcome, "external");
      assert.deepEqual(last.gets, ["brand-new"]);
    } finally {
      last.store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function server(port: number, env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "ext-http-"));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/web-checkout-server.ts"],
    {
      env: {
        ...process.env,
        ...env,
        DB_PATH: join(dir, "store.sqlite"),
        API_PORT: String(port),
        PORT: String(port),
        APP_ORIGIN: base,
        FIXTURE_EXTERNAL_CHECKOUT: "ext-http-1",
      },
      stdio: ["ignore", "ignore", "ignore"],
    },
  );
  let up = false;
  for (let i = 0; i < 120 && child.exitCode === null; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) {
        up = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  const post = (body: string, signature?: string) =>
    fetch(base + "/api/webhooks/payment", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pointcheckout-topic": "checkout/paid",
        "x-pointcheckout-hmac-sha256":
          signature ??
          createHmac("sha256", "fixture-hmac-key")
            .update(body)
            .digest("base64"),
      },
      body,
    });
  const close = async () => {
    child.kill();
    await new Promise<void>((r) =>
      child.exitCode !== null ? r() : child.once("exit", () => r()),
    );
    rmSync(dir, { recursive: true, force: true });
  };
  return { up, child, post, close };
}
const externalBody = JSON.stringify({
  id: "ext-http-1",
  status: "PAID",
  statusUpdateTimestamp: 1,
});

test("HTTP: with the cutoff set, a signed external notification is acknowledged; unsigned is refused; unknown still retries", async () => {
  const s = await server(3161, {
    FIXTURE_DATE: "2026-10-20T08:00:00+04:00",
    PAYMENNT_EXTERNAL_ACK_SINCE: "2026-10-19T00:00:00Z",
  });
  try {
    assert.equal(s.up, true);
    assert.equal(
      (await s.post(externalBody, "bm90LXRoZS1zaWduYXR1cmU=")).status,
      401,
    );
    const first = await s.post(externalBody);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { duplicate: false });
    const again = await s.post(externalBody);
    assert.equal(again.status, 200);
    assert.deepEqual(await again.json(), { duplicate: true });
    const unknown = await s.post(
      JSON.stringify({
        id: "never-heard-of-it",
        status: "PAID",
        statusUpdateTimestamp: 1,
      }),
    );
    assert.equal(unknown.status, 503);
  } finally {
    await s.close();
  }
});

test("HTTP: with the cutoff unset, the same signed external notification keeps the 503 retry answer", async () => {
  const s = await server(3162, { FIXTURE_DATE: "2026-10-20T08:00:00+04:00" });
  try {
    assert.equal(s.up, true);
    assert.equal((await s.post(externalBody)).status, 503);
    assert.equal((await s.post(externalBody)).status, 503);
  } finally {
    await s.close();
  }
});

test("HTTP: an invalid cutoff stops the server from starting instead of guessing", async () => {
  const s = await server(3163, {
    PAYMENNT_EXTERNAL_ACK_SINCE: "2026-02-30T00:00:00Z",
  });
  try {
    assert.equal(s.up, false);
    assert.notEqual(s.child.exitCode, 0);
  } finally {
    await s.close();
  }
});
