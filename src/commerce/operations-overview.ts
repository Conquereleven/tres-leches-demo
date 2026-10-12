import type { Workspace } from "./api";
export function overviewMetrics(
  data: Pick<Workspace, "orders" | "payments" | "jobs" | "integrationHealth">,
) {
  const open = data.orders.filter(
    (o) => !["Delivered", "Cancelled"].includes(o.state),
  );
  return {
    manualReview: open.filter(
      (o) => o.delivery?.addressVerification === "UNVERIFIED",
    ).length,
    attention: open.filter(
      (o) =>
        o.delivery?.addressVerification === "UNVERIFIED" ||
        data.payments.find((p) => p.id === o.paymentId)?.directAttempt ===
          "unknown",
    ).length,
    confirmed: open.filter((o) => ["Paid", "Confirmed"].includes(o.state))
      .length,
    preparing: open.filter((o) => o.state === "Production").length,
    ready: open.filter((o) => o.state === "Ready").length,
    deliveries: open.filter(
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
