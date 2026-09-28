import test from "node:test";
import assert from "node:assert/strict";
import {
  firstName,
  fulfilmentStep,
  paymentStateOf,
  paymentStateOfError,
  stateCopy,
} from "../../src/brand/checkout-states";
import {
  NEXT_ACTION,
  boardMetrics,
  dueLabel,
  inQueue,
  matchesFilter,
  matchesView,
  paymentBadge,
} from "../../src/commerce/orders-board";
import { transitions } from "../../server/domain/workflow";
import type { Order } from "../../server/domain/model";

test("success is shown only for a reconciled paid payment on a confirmed order", () => {
  const base = { url: null, actionRequired: null };
  assert.equal(
    paymentStateOf({ ...base, paymentStatus: "paid", status: "Confirmed" }),
    "PAID",
  );
  for (const status of ["Paid", "Awaiting Payment", "Cancelled"])
    assert.notEqual(
      paymentStateOf({ ...base, paymentStatus: "paid", status }),
      "PAID",
    );
  assert.equal(
    paymentStateOf({
      ...base,
      paymentStatus: "pending",
      status: "Awaiting Payment",
    }),
    "PROCESSING",
  );
});

test("ambiguous, declined, failed and 3-D Secure states", () => {
  const s = (over: object) => ({
    status: "Awaiting Payment",
    paymentStatus: "pending",
    url: null,
    actionRequired: null,
    ...over,
  });
  assert.equal(
    paymentStateOf(s({ actionRequired: "review_payment" })),
    "HELD_FOR_REVIEW",
  );
  // A review hold wins even if the payment record already says failed.
  assert.equal(
    paymentStateOf(
      s({ actionRequired: "review_payment", paymentStatus: "failed" }),
    ),
    "HELD_FOR_REVIEW",
  );
  assert.equal(paymentStateOf(s({ paymentStatus: "failed" })), "DECLINED");
  assert.equal(paymentStateOf(s({ paymentStatus: "expired" })), "FAILED");
  assert.equal(paymentStateOf(s({ paymentStatus: "cancelled" })), "FAILED");
  assert.equal(paymentStateOf(s({ url: "https://x.invalid" })), "3DS_REDIRECT");
  assert.equal(
    paymentStateOf(s({ actionRequired: "complete_payment" })),
    "READY",
  );
  assert.equal(
    paymentStateOfError(
      "The payment result could not be verified. Your order is held for review.",
    ),
    "HELD_FOR_REVIEW",
  );
  assert.equal(
    paymentStateOfError(
      "Payment could not be processed. Please check your details or try again.",
    ),
    "DECLINED",
  );
  assert.equal(paymentStateOfError("Network down"), null);
});

test("customer copy is the approved wording and never provider terminology", () => {
  assert.deepEqual(
    [stateCopy("HELD_FOR_REVIEW").title, stateCopy("HELD_FOR_REVIEW").message],
    [
      "We're confirming your payment",
      "Your order is saved while we verify the payment. Please don't pay again.",
    ],
  );
  assert.equal(stateCopy("DECLINED").title, "Payment wasn't completed");
  assert.equal(
    stateCopy("FAILED", "expired").message,
    "Your card has not been confirmed as charged. Please review the message below before trying again.",
  );
  const all = (
    [
      "READY",
      "PROCESSING",
      "PAID",
      "DECLINED",
      "FAILED",
      "HELD_FOR_REVIEW",
      "3DS_REDIRECT",
    ] as const
  )
    .map((s) => JSON.stringify(stateCopy(s)))
    .join(" ");
  assert.doesNotMatch(all, /paymennt|token|webhook|reconcil|provider|HTTP/i);
  assert.equal(firstName("  Layla  Fixture "), "Layla");
  assert.equal(fulfilmentStep("Confirmed"), 0);
  assert.equal(fulfilmentStep("Ready"), 1);
  assert.equal(fulfilmentStep("Delivered"), 3);
});

const order = (state: string, date?: string, paidAt?: string) =>
  ({
    id: state,
    state,
    paymentId: `p-${state}`,
    delivery: date
      ? { zoneId: "z", address: "a", building: "b", date, slot: "s" }
      : undefined,
    audit: paidAt ? [{ at: paidAt, actor: "x", action: "", to: "Paid" }] : [],
  }) as unknown as Order;

test("awaiting payment never enters the production queue", () => {
  assert.equal(inQueue(order("Awaiting Payment")), false);
  assert.equal(inQueue(order("Cancelled")), false);
  for (const s of ["Paid", "Confirmed", "Production", "Ready"])
    assert.equal(inQueue(order(s)), true);
});

test("views and filters follow the kitchen's day", () => {
  const today = "2026-09-28";
  assert.equal(matchesView(order("Confirmed", today), "today", today), true);
  assert.equal(
    matchesView(order("Confirmed", "2026-09-27"), "today", today),
    true,
  );
  assert.equal(
    matchesView(order("Delivered", "2026-09-27"), "today", today),
    false,
  );
  assert.equal(
    matchesView(order("Confirmed", "2026-09-29"), "upcoming", today),
    true,
  );
  assert.equal(
    matchesView(order("Confirmed", "2026-09-29"), "today", today),
    false,
  );
  assert.equal(matchesFilter(order("Paid"), "paid"), true);
  assert.equal(matchesFilter(order("Production"), "preparing"), true);
  assert.equal(matchesFilter(order("Out for Delivery"), "delivery"), true);
  assert.equal(matchesFilter(order("Delivered"), "completed"), true);
  assert.equal(dueLabel(today, today).label, "Hoy");
  assert.equal(dueLabel("2026-09-29", today).label, "Mañana");
  assert.match(dueLabel("2026-09-20", today).label, /^Atrasado/);
});

test("metrics count paid work only", () => {
  const today = "2026-09-28";
  const orders = [
    order("Confirmed", today, "2026-09-28T08:00:00Z"),
    order("Production", today, "2026-09-27T08:00:00Z"),
    order("Out for Delivery", "2026-09-29", "2026-09-28T09:00:00Z"),
    order("Awaiting Payment", today),
  ];
  const payments = [
    { id: "p-Confirmed", status: "paid" as const, amountFils: 5000 },
    { id: "p-Production", status: "paid" as const, amountFils: 2500 },
    { id: "p-Out for Delivery", status: "paid" as const, amountFils: 7500 },
    { id: "p-Awaiting Payment", status: "pending" as const, amountFils: 9900 },
  ];
  assert.deepEqual(boardMetrics(orders, payments, today), {
    todayOrders: 2,
    todayRevenueFils: 12500,
    preparing: 1,
    outForDelivery: 1,
  });
});

test("quick actions use existing state-machine transitions only", () => {
  for (const [from, action] of Object.entries(NEXT_ACTION))
    assert.ok(
      transitions[from as keyof typeof transitions].includes(action!.to),
      `${from} → ${action!.to}`,
    );
  assert.equal(paymentBadge({ status: "paid" }).tone, "paid");
  assert.equal(
    paymentBadge({ status: "pending", directAttempt: "unknown" }).tone,
    "review",
  );
});
