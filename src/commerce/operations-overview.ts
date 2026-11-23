import { fulfillmentPending } from "../../shared/payment-fulfillment";
import { fulfillmentSchedule } from "../../shared/fulfillment-schedule";
import type { Workspace } from "./api";
export function overviewMetrics(
  data: Pick<Workspace, "orders" | "payments" | "jobs" | "integrationHealth">,
) {
  const open = data.orders.filter(
    (o) => !["Delivered", "Cancelled"].includes(o.state),
  );
  const accepted = open.filter((o) => !fulfillmentPending(o));
  return {
    manualReview: open.filter(
      (o) => o.delivery?.addressVerification === "UNVERIFIED",
    ).length,
    attention: open.filter(
      (o) =>
        fulfillmentPending(o) ||
        o.delivery?.addressVerification === "UNVERIFIED" ||
        data.payments.find((p) => p.id === o.paymentId)?.directAttempt ===
          "unknown",
    ).length,
    confirmed: accepted.filter((o) => ["Paid", "Confirmed"].includes(o.state))
      .length,
    preparing: accepted.filter((o) => o.state === "Production").length,
    ready: accepted.filter((o) => o.state === "Ready").length,
    deliveries: accepted.filter(
      (o) =>
        o.fulfillmentMethod !== "pickup" &&
        ["Ready", "Out for Delivery"].includes(o.state),
    ).length,
    failedJobs: data.jobs.filter((j) =>
      ["failed", "unknown"].includes(j.status),
    ).length,
    inboundFailed: data.integrationHealth?.inboundFailed ?? 0,
  };
}

/** Current operational facts only; never a financial calculation or SLA model. */
export function overviewAgenda(data: Workspace, today: string) {
  const open = data.orders.filter(
    (o) => !["Delivered", "Cancelled"].includes(o.state),
  );
  const accepted = open.filter((o) => !fulfillmentPending(o));
  const scheduled = (o: Workspace["orders"][number]) =>
    fulfillmentSchedule(o).date;
  const reasons = (o: Workspace["orders"][number]) => {
    const payment = data.payments.find((p) => p.id === o.paymentId);
    const tags: string[] = [];
    if (fulfillmentPending(o)) tags.push("Fulfillment pending confirmation");
    if (scheduled(o) === today) tags.push("Scheduled today");
    if (
      o.fulfillmentMethod !== "pickup" &&
      ["Confirmed", "Paid", "Production", "Ready", "Out for Delivery"].includes(
        o.state,
      ) &&
      o.delivery?.addressVerification !== "VERIFIED"
    )
      tags.push("Manual address review");
    if (
      payment?.directAttempt === "unknown" ||
      data.jobs.some(
        (j) =>
          ["failed", "unknown"].includes(j.status) &&
          [o.id, o.paymentId, o.conversationId].includes(j.entityId),
      )
    )
      tags.push("Failed or uncertain jobs");
    if (
      (data.customerNotifications ?? []).some(
        (n) => n.orderId === o.id && n.status === "failed",
      )
    )
      tags.push("Customer email needs review");
    return tags;
  };
  const priorities = open
    .map((order) => ({ order, reasons: reasons(order) }))
    .filter((x) => x.reasons.length)
    .sort(
      (a, b) =>
        Number(fulfillmentPending(b.order)) -
          Number(fulfillmentPending(a.order)) ||
        Number(b.reasons.includes("Scheduled today")) -
          Number(a.reasons.includes("Scheduled today")) ||
        (scheduled(a.order) ?? "9999").localeCompare(
          scheduled(b.order) ?? "9999",
        ) ||
        a.order.id.localeCompare(b.order.id),
    );
  const stages = [
    "Awaiting Payment",
    "Paid",
    "Confirmed",
    "Production",
    "Ready",
    "Out for Delivery",
  ] as const;
  return {
    priorities,
    scheduledToday: data.orders.filter((o) => scheduled(o) === today).length,
    pipeline: [
      ...stages.map((state) => ({
        state,
        count: accepted.filter((o) => o.state === state).length,
      })),
      ...(open.some(fulfillmentPending)
        ? [
            {
              state: "Fulfillment pending confirmation",
              count: open.filter(fulfillmentPending).length,
            },
          ]
        : []),
    ],
    confirmed: accepted.filter((o) => o.state === "Confirmed").length,
    pickupReady: accepted.filter(
      (o) => o.state === "Ready" && o.fulfillmentMethod === "pickup",
    ).length,
    deliveryReady: accepted.filter(
      (o) => o.state === "Ready" && o.fulfillmentMethod !== "pickup",
    ).length,
    out: accepted.filter((o) => o.state === "Out for Delivery").length,
    emailIssues: (data.customerNotifications ?? []).filter(
      (n) => n.status === "failed",
    ).length,
  };
}
