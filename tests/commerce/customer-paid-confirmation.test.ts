import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { paidFixture } from "../fixtures/customer-paid";
import { Store } from "../../server/db/store";
import {
  dispatchCustomerNotifications,
  recoverInterruptedCustomerNotifications,
  customerPaidEmailSince,
  recordCustomerEvent,
  renderCustomerEmail,
  CUSTOMER_EMAIL_MAX_AGE_MS,
} from "../../server/domain/customer-notifications";
import { ResendEmailProvider } from "../../server/adapters/resend";
import { paidEmailLabel } from "../../src/commerce/customer-email-status";
import { checkoutCapability } from "../../src/brand/checkout-capability";
import { orderNotifications } from "../../src/commerce/order-view";
import type { Workspace } from "../../src/commerce/api";

const send = (
  f: ReturnType<typeof paidFixture>,
  provider: ResendEmailProvider,
) =>
  dispatchCustomerNotifications(
    f.store,
    provider,
    "customerNotifications",
    f.since,
  );
const fake = (result: () => Response | Promise<Response>) => {
  const calls: Array<{ key: string; body: Record<string, unknown> }> = [];
  const provider = new ResendEmailProvider(
    { apiKey: "fixture-only-key", from: "3L <orders@example.invalid>" },
    async (_url, init) => {
      calls.push({
        key: (init!.headers as Record<string, string>)["Idempotency-Key"]!,
        body: JSON.parse(String(init!.body)),
      });
      return result();
    },
  );
  return { provider, calls };
};
test("activation is explicit, validated and dependent on email delivery", () => {
  assert.equal(customerPaidEmailSince({}), undefined);
  assert.throws(() =>
    customerPaidEmailSince({ CUSTOMER_ORDER_PAID_EMAIL_ENABLED: "true" }),
  );
  assert.throws(() =>
    customerPaidEmailSince({
      CUSTOMER_ORDER_PAID_EMAIL_ENABLED: "true",
      CUSTOMER_EMAIL_ENABLED: "true",
      CUSTOMER_ORDER_PAID_EMAIL_SINCE: "garbage",
    }),
  );
  assert.equal(
    customerPaidEmailSince({
      CUSTOMER_ORDER_PAID_EMAIL_ENABLED: "true",
      CUSTOMER_EMAIL_ENABLED: "true",
      CUSTOMER_ORDER_PAID_EMAIL_SINCE: "2026-10-25T12:00:00+04:00",
    }),
    "2026-10-25T08:00:00.000Z",
  );
});
for (const pickup of [false, true])
  test(`authoritative paid+confirmed queues one frozen customer and internal email; pickup=${pickup}`, async () => {
    const f = paidFixture();
    try {
      const key = await f.place(pickup);
      assert.equal(f.store.read().customerNotifications?.length ?? 0, 0);
      f.providerState.status = "PAID";
      await f.reconcile(key);
      const o = f.order(key);
      assert.equal(o.state, "Confirmed");
      const row = f.store.read().customerNotifications![0]!;
      assert.equal(row.event, "ORDER_PAID");
      assert.equal(row.status, "pending");
      assert.match(row.subject, /#001 is confirmed!/);
      assert.match(row.body, /Total paid: AED 66.00/);
      assert.match(row.html!, /Your order is confirmed!/);
      assert.match(row.body, pickup ? /Pickup/ : /Delivery/);
      assert.doesNotMatch(
        row.body,
        /now being prepared|Private Street|providerReference|fixture-key/,
      );
      assert.equal(f.store.read().operationsEmailNotifications?.length, 1);
      await f.reconcile(key);
      await f.reconcile(key);
      const payment = f.store.read().payments[0]!;
      const event = {
        id: payment.providerReference!,
        status: "PAID",
        statusUpdateTimestamp: new Date().toISOString(),
      };
      await f.service.acceptPaymentNotification(event);
      await f.service.acceptPaymentNotification(event);
      assert.equal(f.store.read().customerNotifications!.length, 1);
      assert.equal(f.store.read().operationsEmailNotifications!.length, 1);
      const mail = fake(() => Response.json({ id: "provider-accepted" }));
      const before = structuredClone(f.order(key));
      await send(f, mail.provider);
      await send(f, mail.provider);
      assert.equal(mail.calls.length, 1);
      assert.equal(mail.calls[0]!.key, row.id);
      assert.deepEqual(f.order(key), before);
      assert.equal(
        f.store.read().customerNotifications![0]!.deliveryOutcome,
        "accepted",
      );
      assert.match(
        paidEmailLabel(f.store.read().customerNotifications![0]!),
        /delivery unverified/,
      );
    } finally {
      f.store.close();
    }
  });
for (const status of [
  "PENDING",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "AUTHORIZED",
])
  test(`${status} generates no customer paid confirmation`, async () => {
    const f = paidFixture();
    try {
      const k = await f.place();
      f.providerState.status = status;
      await f.reconcile(k);
      assert.equal(f.store.read().customerNotifications?.length ?? 0, 0);
    } finally {
      f.store.close();
    }
  });
test("manual transitions cannot manufacture a paid-confirmation event", async () => {
  const f = paidFixture();
  try {
    const k = await f.place();
    f.store.write((s) => {
      assert.equal(
        recordCustomerEvent(s, f.order(k), "Paid", "Confirmed"),
        null,
      );
    });
    assert.equal(f.store.read().customerNotifications?.length ?? 0, 0);
  } finally {
    f.store.close();
  }
});
test("disabled feature, historical order creation, historical payment creation and missing email are excluded", async () => {
  for (const condition of [
    "disabled",
    "old-order",
    "old-payment",
    "no-email",
  ]) {
    const f = paidFixture();
    try {
      const k = await f.place();
      if (condition === "disabled")
        f.service.customerPaidEmailSince = undefined;
      f.store.write((s) => {
        if (condition === "old-order")
          s.orders[0]!.audit[0]!.at = "2025-01-01T00:00:00Z";
        if (condition === "old-payment")
          s.payments[0]!.createdAt = "2025-01-01T00:00:00Z";
        if (condition === "no-email")
          delete s.orders[0]!.customerDetails!.email;
      });
      f.providerState.status = "PAID";
      await f.reconcile(k);
      assert.equal(f.order(k).state, "Confirmed");
      assert.equal(
        f.store.read().customerNotifications?.length ?? 0,
        0,
        condition,
      );
    } finally {
      f.store.close();
    }
  }
});
test("already-paid historical order is not backfilled on enable or reconciliation", async () => {
  const f = paidFixture();
  try {
    f.service.customerPaidEmailSince = undefined;
    const k = await f.place();
    f.providerState.status = "PAID";
    await f.reconcile(k);
    const order = structuredClone(f.order(k));
    f.service.customerPaidEmailSince = f.since;
    await f.reconcile(k);
    assert.deepEqual(f.order(k), order);
    assert.equal(f.store.read().customerNotifications?.length ?? 0, 0);
  } finally {
    f.store.close();
  }
});
for (const kind of ["timeout", "malformed", "500", "422"])
  test(`${kind}: one attempt, explicit uncertainty/rejection, no blind resend`, async () => {
    const f = paidFixture();
    try {
      const k = await f.place();
      f.providerState.status = "PAID";
      await f.reconcile(k);
      const mail = fake(() => {
        if (kind === "timeout")
          throw new DOMException("fixture timeout", "TimeoutError");
        return kind === "malformed"
          ? Response.json({})
          : new Response("{}", { status: Number(kind) });
      });
      await send(f, mail.provider);
      await send(f, mail.provider);
      const row = f.store.read().customerNotifications![0]!;
      assert.equal(mail.calls.length, 1);
      assert.equal(row.deliveryOutcome, kind === "422" ? "failed" : "unknown");
      assert.equal(row.attemptCount, 1);
      assert.ok(!row.providerMessageId);
    } finally {
      f.store.close();
    }
  });
test("restart and concurrent store handles preserve one durable event and one send", async () => {
  const dir = mkdtempSync(join(tmpdir(), "paid-mail-")),
    file = join(dir, "state.sqlite");
  let f = paidFixture(file);
  try {
    const k = await f.place();
    f.providerState.status = "PAID";
    await f.reconcile(k);
    const row = f.store.read().customerNotifications![0]!;
    f.store.close();
    f = paidFixture(file);
    f.since = row.activationSince!;
    const other = new Store(file, "test"),
      mail = fake(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return Response.json({ id: "accepted-once" });
      });
    try {
      await Promise.all([
        send(f, mail.provider),
        dispatchCustomerNotifications(
          other,
          mail.provider,
          "customerNotifications",
          f.since,
        ),
      ]);
      assert.equal(mail.calls.length, 1);
      assert.equal(f.store.read().customerNotifications![0]!.id, row.id);
    } finally {
      other.close();
    }
  } finally {
    f.store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("crash in sending is unknown and never blindly replayed after restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "paid-crash-")),
    file = join(dir, "state.sqlite");
  let f = paidFixture(file);
  try {
    const k = await f.place();
    f.providerState.status = "PAID";
    await f.reconcile(k);
    f.store.write((s) => {
      s.customerNotifications![0]!.status = "sending";
      s.customerNotifications![0]!.attemptCount = 1;
    });
    f.store.close();
    f = paidFixture(file);
    recoverInterruptedCustomerNotifications(f.store);
    const mail = fake(() => Response.json({ id: "must-not-send" }));
    await send(f, mail.provider);
    assert.equal(mail.calls.length, 0);
    assert.equal(
      f.store.read().customerNotifications![0]!.deliveryOutcome,
      "unknown",
    );
  } finally {
    f.store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("new activation epoch suppresses historical pending confirmations and old unsent rows expire", async () => {
  for (const old of [false, true]) {
    const f = paidFixture();
    try {
      const k = await f.place();
      f.providerState.status = "PAID";
      await f.reconcile(k);
      if (old)
        f.store.write((s) => {
          s.customerNotifications![0]!.createdAt = new Date(
            Date.now() - CUSTOMER_EMAIL_MAX_AGE_MS - 1,
          ).toISOString();
        });
      else f.since = new Date(Date.now() + 1000).toISOString();
      const mail = fake(() => Response.json({ id: "must-not-send" }));
      await send(f, mail.provider);
      assert.equal(mail.calls.length, 0);
      assert.match(
        f.store.read().customerNotifications![0]!.lastError!,
        /Expired/,
      );
    } finally {
      f.store.close();
    }
  }
});
test("Operations exposes paid confirmation acceptance and last attempt, never inferred delivery", async () => {
  const f = paidFixture();
  try {
    const k = await f.place();
    f.providerState.status = "PAID";
    await f.reconcile(k);
    const mail = fake(() => Response.json({ id: "reference-1" }));
    await send(f, mail.provider);
    const rows = orderNotifications(
      {
        ...f.store.read(),
        customerEmailProvider: "resend",
      } as unknown as Workspace,
      f.order(k),
    );
    const row = rows.find((r) => r.channel === "Customer email")!;
    assert.match(row.label, /accepted.*unverified/);
    assert.equal(row.providerMessageId, "reference-1");
    assert.ok(row.lastAttemptAt);
  } finally {
    f.store.close();
  }
});
test("capability reader handles fresh tab, corrupt JSON, denied storage and never uses order numbers", () => {
  for (const value of [
    null,
    "{bad",
    JSON.stringify({ orderId: "026", email: "alex@example.invalid" }),
    JSON.stringify({ key: "#026" }),
    "[]",
  ])
    assert.equal(checkoutCapability({ getItem: () => value }), null);
  assert.equal(
    checkoutCapability({
      getItem: () => {
        throw Error("denied");
      },
    }),
    null,
  );
  const key = "00000000-0000-4000-8000-000000000000";
  assert.equal(
    checkoutCapability({ getItem: () => JSON.stringify({ key }) }),
    key,
  );
});

test("paid email preserves two distinct pack compositions, box quantities, pieces and paid total", async () => {
  const { paidPreview } = await import("../fixtures/customer-paid-preview");
  for (const pickup of [false, true]) {
    const order = paidPreview(pickup),
      before = structuredClone(order);
    const email = renderCustomerEmail("ORDER_PAID", order, {
      paidAmountFils: 70500,
    });
    assert.match(email.body, /Total paid: AED 705.00/);
    assert.match(email.html!, /AED 705.00/);
    assert.match(email.body, /24 pieces in 2 boxes/);
    assert.match(email.body, /12 pieces in 1 box/);
    assert.match(email.body, /4 ×/);
    assert.match(email.body, /8 ×/);
    assert.match(email.body, /12 ×/);
    assert.deepEqual(order, before);
    assert.doesNotMatch(email.html!, /TL-SYNTHETIC|alex@example|Fixture/);
  }
});
