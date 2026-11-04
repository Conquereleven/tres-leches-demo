import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { paidFixture } from "../fixtures/customer-paid";
import { Store } from "../../server/db/store";
import { ResendEmailProvider } from "../../server/adapters/resend";
import {
  dispatchCustomerNotifications,
  recoverInterruptedCustomerNotifications,
} from "../../server/domain/customer-notifications";
import {
  CUSTOMER_EMAIL_V2_GRACE_MS,
  customerEmailV2Since,
  windowStartsAt,
} from "../../server/domain/customer-email-v2";
import { windowEmailLabel } from "../../src/commerce/customer-email-status";
import type { Actor, CustomerNotification } from "../../server/domain/model";

const admin: Actor = { id: "liza", role: "admin" };
type Fixture = ReturnType<typeof paidFixture>;

/** The paid fixture with V2 enabled (legacy paid confirmation also on). */
function v2(path?: string) {
  const f = paidFixture(path);
  f.service.customerEmailV2Since = f.since;
  return f;
}
const fake = (result: () => Response | Promise<Response>) => {
  const calls: Array<{ key: string; subject: string }> = [];
  const provider = new ResendEmailProvider(
    { apiKey: "fixture-only-key", from: "3L <orders@example.invalid>" },
    async (_url, init) => {
      const body = JSON.parse(String(init!.body));
      calls.push({
        key: (init!.headers as Record<string, string>)["Idempotency-Key"]!,
        subject: body.subject,
      });
      return result();
    },
  );
  return { provider, calls };
};
const accepted = () => fake(() => Response.json({ id: "provider-accepted" }));
const dispatch = (
  f: Fixture,
  provider: ResendEmailProvider,
  at: number,
  since: string | null = f.since,
) =>
  dispatchCustomerNotifications(
    f.store,
    provider,
    "customerNotifications",
    f.since,
    since ?? undefined,
    () => at,
  );
const rows = (f: Fixture) => f.store.read().customerNotifications ?? [];
const windowRow = (f: Fixture) =>
  rows(f).find((r) => r.event === "ORDER_SCHEDULED_WINDOW_STARTED")!;
async function paid(f: Fixture, pickup = false) {
  const key = await f.place(pickup);
  f.providerState.status = "PAID";
  await f.reconcile(key);
  return key;
}
const move = (f: Fixture, key: string, state: "Production" | "Ready") => {
  const o = f.order(key);
  const c = f.store
    .read()
    .conversations.find((c) => c.id === o.conversationId)!;
  if (c.assignedAgent !== admin.id)
    f.service.command(
      { type: "assign", id: c.id, version: c.version, agent: admin.id },
      randomUUID(),
      admin,
    );
  const current = f.order(key);
  return f.service.command(
    { type: "transition", id: current.id, version: current.version, state },
    randomUUID(),
    admin,
  );
};

test("V2 activation is explicit, needs email delivery and a valid epoch", () => {
  assert.equal(customerEmailV2Since({}), undefined);
  assert.throws(() =>
    customerEmailV2Since({ CUSTOMER_EMAIL_V2_ENABLED: "true" }),
  );
  assert.throws(() =>
    customerEmailV2Since({
      CUSTOMER_EMAIL_V2_ENABLED: "true",
      CUSTOMER_EMAIL_ENABLED: "true",
      CUSTOMER_EMAIL_V2_SINCE: "tomorrow",
    }),
  );
  assert.equal(
    customerEmailV2Since({
      CUSTOMER_EMAIL_V2_ENABLED: "true",
      CUSTOMER_EMAIL_ENABLED: "true",
      CUSTOMER_EMAIL_V2_SINCE: "2026-11-01T12:00:00+04:00",
    }),
    "2026-11-01T08:00:00.000Z",
  );
});

test("each slot is due at its own start in Asia/Dubai", () => {
  assert.equal(
    windowStartsAt("2026-11-02", "8:00 AM – 1:00 PM"),
    "2026-11-02T04:00:00.000Z",
  );
  assert.equal(
    windowStartsAt("2026-11-02", "1:00 PM – 4:00 PM"),
    "2026-11-02T09:00:00.000Z",
  );
  assert.equal(
    windowStartsAt("2026-11-02", "4:00 PM – 9:00 PM"),
    "2026-11-02T12:00:00.000Z",
  );
  assert.equal(windowStartsAt("2026-11-02", "afternoon, after 4 pm"), null);
  assert.equal(windowStartsAt("2026-02-30", "8:00 AM – 1:00 PM"), null);
});

for (const pickup of [false, true])
  test(`paid order records one confirmation and one scheduled window email; pickup=${pickup}`, async () => {
    const f = v2();
    try {
      const key = await paid(f, pickup);
      // Duplicate reconciliations and provider notifications change nothing.
      await f.reconcile(key);
      const payment = f.store.read().payments[0]!;
      const event = {
        id: payment.providerReference!,
        status: "PAID",
        statusUpdateTimestamp: new Date().toISOString(),
      };
      await f.service.acceptPaymentNotification(event);
      await f.service.acceptPaymentNotification(event);
      const all = rows(f);
      assert.deepEqual(all.map((r) => r.event).sort(), [
        "ORDER_PAID",
        "ORDER_SCHEDULED_WINDOW_STARTED",
      ]);
      assert.ok(all.every((r) => r.flow === "v2" && r.status === "pending"));
      const o = f.order(key);
      const date = pickup ? o.pickup!.pickupDate : o.delivery!.date;
      assert.equal(windowRow(f).dueAt, `${date}T12:00:00.000Z`);
      // Internal team email is unchanged: one row, original subject.
      const internal = f.store.read().operationsEmailNotifications!;
      assert.equal(internal.length, 1);
      assert.match(internal[0]!.subject, /^New paid 3L order #001$/);

      const confirmed = all.find((r) => r.event === "ORDER_PAID")!;
      assert.equal(confirmed.subject, "Your 3L order #001 is confirmed");
      assert.match(confirmed.html!, /Order Confirmed: #001/);
      assert.match(confirmed.body, /Total paid: AED 66\.00/);
      assert.match(
        confirmed.body,
        /6 × Traditional Chocolate Concha · Mini · 40 g/,
      );
      for (const r of all)
        assert.doesNotMatch(
          `${r.subject}\n${r.body}\n${r.html}`,
          /TL-|operations\/orders|REVIEW|Private Street|Fixture Street|0500000000|checkout-|requestId/,
        );
      const window = windowRow(f);
      assert.match(
        window.subject,
        pickup ? /is ready for pickup/ : /delivery window has started/,
      );
      // Never asserts dispatch or courier progress.
      assert.doesNotMatch(
        window.body,
        /on the way|courier|dispatched|out for delivery/i,
      );
      assert.equal(
        windowEmailLabel(window),
        "Programado para el inicio de la ventana",
      );
    } finally {
      f.store.close();
    }
  });

test("the window email waits for its start, is sent once, and the two-hour rule never expires it", async () => {
  const f = v2();
  try {
    await paid(f);
    const due = Date.parse(windowRow(f).dueAt!);
    const createdAt = Date.parse(windowRow(f).createdAt);
    const mail = accepted();
    // Confirmation goes now; the window email does not.
    await dispatch(f, mail.provider, createdAt + 1000);
    assert.deepEqual(
      mail.calls.map((c) => c.subject),
      ["Your 3L order #001 is confirmed"],
    );
    // Hours later, still before the window: neither sent nor expired.
    await dispatch(f, mail.provider, createdAt + 3 * 60 * 60 * 1000);
    await dispatch(f, mail.provider, due - 1);
    assert.equal(mail.calls.length, 1);
    assert.equal(windowRow(f).status, "pending");
    await dispatch(f, mail.provider, due);
    await dispatch(f, mail.provider, due + 1000);
    assert.equal(mail.calls.length, 2);
    assert.equal(mail.calls[1]!.key, windowRow(f).id);
    assert.equal(windowRow(f).status, "sent");
    assert.equal(windowRow(f).deliveryOutcome, "accepted");
  } finally {
    f.store.close();
  }
});

test("within the 30-minute grace it is sent; beyond it an operational exception is recorded instead", async () => {
  for (const [late, sent] of [
    [CUSTOMER_EMAIL_V2_GRACE_MS - 60_000, true],
    [CUSTOMER_EMAIL_V2_GRACE_MS + 60_000, false],
  ] as const) {
    const f = v2();
    try {
      await paid(f);
      const due = Date.parse(windowRow(f).dueAt!);
      const mail = accepted();
      await dispatch(f, mail.provider, due + late);
      assert.equal(
        mail.calls.some((c) => c.key === windowRow(f).id),
        sent,
      );
      if (!sent) {
        assert.equal(windowRow(f).status, "failed");
        assert.match(windowRow(f).lastError!, /^Late/);
        assert.equal(
          windowEmailLabel(windowRow(f)),
          "No enviado · fuera de tiempo",
        );
        assert.ok(
          f.store
            .read()
            .audit.some((a) =>
              /operational exception, window email not sent/.test(a.action),
            ),
        );
      }
    } finally {
      f.store.close();
    }
  }
});

test("the schedule survives a restart; an interrupted send is never resent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-email-v2-"));
  const path = join(dir, "state.sqlite");
  try {
    const f = v2(path);
    await paid(f);
    const id = windowRow(f).id;
    const due = Date.parse(windowRow(f).dueAt!);
    f.store.close();
    const reopened = new Store(path, "test");
    const row = reopened
      .read()
      .customerNotifications!.find((r) => r.id === id)!;
    assert.equal(row.status, "pending");
    assert.equal(Date.parse(row.dueAt!), due);
    // A crash mid-send leaves "sending": recovered as unknown, not retried.
    reopened.write((s) => {
      s.customerNotifications!.find((r) => r.id === id)!.status = "sending";
    });
    recoverInterruptedCustomerNotifications(reopened);
    const recovered = reopened
      .read()
      .customerNotifications!.find((r) => r.id === id)!;
    assert.equal(recovered.status, "failed");
    assert.equal(recovered.deliveryOutcome, "unknown");
    const mail = accepted();
    await dispatchCustomerNotifications(
      reopened,
      mail.provider,
      "customerNotifications",
      undefined,
      recovered.activationSince,
      () => due,
    );
    assert.ok(!mail.calls.some((c) => c.key === id));
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an uncertain provider outcome is recorded as unknown and never retried", async () => {
  const f = v2();
  try {
    await paid(f);
    const due = Date.parse(windowRow(f).dueAt!);
    const failing = fake(() => {
      throw new TypeError("network reset");
    });
    await dispatch(f, failing.provider, due);
    assert.equal(windowRow(f).deliveryOutcome, "unknown");
    const mail = accepted();
    await dispatch(f, mail.provider, due + 1000);
    assert.ok(!mail.calls.some((c) => c.key === windowRow(f).id));
  } finally {
    f.store.close();
  }
});

for (const [name, mutate, reason] of [
  [
    "refund",
    (f: Fixture) =>
      f.store.write((s) => {
        s.payments[0]!.status = "refunded";
      }),
    /^Payment not in paid state/,
  ],
  [
    "cancellation",
    (f: Fixture) =>
      f.store.write((s) => {
        s.orders[0]!.state = "Cancelled";
      }),
    /^Order cancelled/,
  ],
  [
    "a changed schedule",
    (f: Fixture) =>
      f.store.write((s) => {
        s.orders[0]!.delivery!.slot = "8:00 AM – 1:00 PM";
      }),
    /^Schedule changed/,
  ],
] as const)
  test(`after ${name} the window email is not sent and the reason is recorded`, async () => {
    const f = v2();
    try {
      await paid(f);
      const due = Date.parse(windowRow(f).dueAt!);
      mutate(f);
      const mail = accepted();
      await dispatch(f, mail.provider, due);
      assert.ok(!mail.calls.some((c) => c.key === windowRow(f).id));
      assert.equal(windowRow(f).status, "failed");
      assert.match(windowRow(f).lastError!, reason);
      assert.equal(
        windowEmailLabel(windowRow(f)),
        "No enviado · pedido no elegible",
      );
    } finally {
      f.store.close();
    }
  });

test("a missing customer email queues nothing and is recorded", async () => {
  const f = v2();
  try {
    const key = await f.place();
    f.store.write((s) => {
      delete s.orders[0]!.customerDetails!.email;
    });
    f.providerState.status = "PAID";
    await f.reconcile(key);
    assert.equal(rows(f).length, 0);
    assert.ok(
      f.store
        .read()
        .audit.some((a) => /no customer email address/.test(a.action)),
    );
    assert.equal(f.store.read().operationsEmailNotifications!.length, 1);
  } finally {
    f.store.close();
  }
});

test("enrolled orders get no OMS progress emails; OMS still moves and internal email is unchanged", async () => {
  const f = v2();
  try {
    const key = await paid(f, true);
    move(f, key, "Production");
    move(f, key, "Ready");
    assert.equal(f.order(key).state, "Ready");
    assert.deepEqual(
      rows(f)
        .map((r) => r.event)
        .sort(),
      ["ORDER_PAID", "ORDER_SCHEDULED_WINDOW_STARTED"],
    );
    assert.equal(f.store.read().operationsEmailNotifications!.length, 1);
  } finally {
    f.store.close();
  }
});

test("an enrolled order keeps V2 after the flag is turned off or the epoch changes: no third customer email", async () => {
  const f = v2();
  try {
    const key = await paid(f, true);
    const before = structuredClone(rows(f));
    const events = structuredClone(f.store.read().events);
    // V2 turned off, legacy confirmation still on; then a new epoch.
    f.service.customerEmailV2Since = undefined;
    move(f, key, "Production");
    f.service.customerEmailV2Since = new Date().toISOString();
    move(f, key, "Ready");
    assert.equal(f.order(key).state, "Ready");
    assert.equal(rows(f).length, 2);
    assert.deepEqual(rows(f), before);
    for (const [k, v] of Object.entries(events))
      assert.equal(f.store.read().events[k], v, k);
    assert.equal(f.store.read().operationsEmailNotifications!.length, 1);
  } finally {
    f.store.close();
  }
});

test("without V2 the existing flow is unchanged: legacy confirmation and progress emails", async () => {
  const f = paidFixture();
  try {
    const key = await paid(f, true);
    move(f, key, "Production");
    move(f, key, "Ready");
    assert.deepEqual(
      rows(f).map((r) => [r.event, r.flow]),
      [
        ["ORDER_PAID", undefined],
        ["ORDER_PRODUCTION_STARTED", undefined],
        ["ORDER_READY_FOR_PICKUP", undefined],
      ],
    );
  } finally {
    f.store.close();
  }
});

test("orders before the V2 epoch are not enrolled; no backfill", async () => {
  const f = paidFixture();
  try {
    f.service.customerEmailV2Since = new Date(
      Date.now() + 60_000,
    ).toISOString();
    await paid(f);
    assert.ok(rows(f).every((r) => r.flow !== "v2"));
  } finally {
    f.store.close();
  }
});

test("turning V2 off holds its emails; a new epoch never releases the old ones", async () => {
  const f = v2();
  try {
    await paid(f);
    const due = Date.parse(windowRow(f).dueAt!);
    const createdAt = Date.parse(windowRow(f).createdAt);
    const mail = accepted();
    await dispatch(f, mail.provider, createdAt, null);
    await dispatch(f, mail.provider, due, null);
    assert.equal(mail.calls.length, 0);
    await dispatch(f, mail.provider, due, new Date(due).toISOString());
    assert.equal(mail.calls.length, 0);
    assert.ok(
      rows(f).every(
        (r: CustomerNotification) =>
          r.status === "failed" && /^Expired/.test(r.lastError!),
      ),
    );
  } finally {
    f.store.close();
  }
});
