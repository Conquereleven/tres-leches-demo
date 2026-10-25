import { dubaiDay } from "../../server/analytics/engine";
import { DailyFinanceSummary } from "./DailyFinanceSummary";
import { ReportPanel, Distribution } from "./ReportingPrimitives";
import "./operations-experience-v2.css";
import type { Workspace } from "./api";
import { orderPath } from "./order-view";
import { useOps } from "./ops-i18n";
import { overviewMetrics, overviewAgenda } from "./operations-overview";
import { orderReference } from "../../shared/order-number";
import { Receipt, Oven, CheckCircle, Truck } from "@phosphor-icons/react";
export function OperationsOverview({
  data,
  onNavigate,
}: {
  data: Workspace;
  onNavigate: (view: string) => void;
}) {
  const { t, formatDate } = useOps();
  const today = dubaiDay(new Date().toISOString())!;
  const metrics = overviewMetrics(data),
    agenda = overviewAgenda(data, today);
  const route: Record<string, string> = {
    "Awaiting Payment": "unpaid",
    Paid: "to-confirm",
    Confirmed: "confirmed",
    Production: "preparing",
    Ready: "ready",
    "Out for Delivery": "out",
  };
  const cards = [
    [
      "Scheduled today",
      agenda.scheduledToday,
      `orders?dueFrom=${today}&dueTo=${today}`,
      Receipt,
    ],
    [
      "Awaiting preparation",
      agenda.confirmed,
      "orders?status=confirmed",
      Receipt,
    ],
    ["Preparing", metrics.preparing, "orders?status=preparing", Oven],
    [
      "Ready for pickup",
      agenda.pickupReady,
      "orders?status=ready&method=pickup",
      CheckCircle,
    ],
    [
      "Ready for delivery",
      agenda.deliveryReady,
      "orders?status=ready&method=delivery",
      Truck,
    ],
    ["Out for Delivery", agenda.out, "orders?status=out", Truck],
  ] as const;
  const recent = data.orders
    .slice()
    .sort((a, b) =>
      (b.audit.at(-1)?.at ?? "").localeCompare(a.audit.at(-1)?.at ?? ""),
    )
    .slice(0, 8);
  const schedule = (o: Workspace["orders"][number]) =>
    [
      o.pickup?.pickupDate ?? o.delivery?.date,
      o.pickup?.preferredTime ?? o.delivery?.slot,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <div className="ops-overview ops-v2">
      <section className="ops-v2-intro">
        <div>
          <p className="ops-kicker">{t("DAILY OPERATIONS")}</p>
          <h2>{t("A clear view of the day")}</h2>
          <p>{t("Current workspace snapshot · no SLA estimates")}</p>
        </div>
        <div className="ops-v2-date">
          <span>{t("Asia/Dubai")}</span>
          <strong>{formatDate(today, false)}</strong>
          <button className="primary" onClick={() => onNavigate("orders")}>
            {t("View orders")}
          </button>
        </div>
      </section>
      <section
        className="ops-summary-grid ops-v2-summary"
        aria-label={t("Overview metrics")}
      >
        {cards.map(([label, count, destination, Icon]) => (
          <button
            key={label}
            className="ops-summary-card"
            onClick={() => onNavigate(destination)}
          >
            <Icon size={21} aria-hidden />
            <span>{t(label)}</span>
            <strong>{count}</strong>
            <small>{t("View matching orders")}</small>
          </button>
        ))}
      </section>
      {["admin", "manager"].includes(data.actor.role) && (
        <DailyFinanceSummary today={today} userId={data.actor.id} />
      )}
      <ReportPanel
        title={t("Current order pipeline")}
        subtitle={t("Current states · not historical throughput")}
      >
        <Distribution
          label={t("Current order pipeline")}
          rows={agenda.pipeline.map((x) => ({
            label: t(x.state),
            count: x.count,
            href: `/operations/orders?status=${route[x.state]}`,
          }))}
        />
      </ReportPanel>
      <div className="ops-v2-columns">
        <ReportPanel
          title={t("Today's priorities")}
          subtitle={t(
            "Scheduled work and recorded exceptions · no invented deadlines",
          )}
          action={
            <a href={`/operations/orders?dueFrom=${today}&dueTo=${today}`}>
              {t("View today's schedule")}
            </a>
          }
        >
          {agenda.priorities.length ? (
            <ol className="ops-v2-priorities">
              {agenda.priorities.slice(0, 8).map(({ order, reasons }) => (
                <li key={order.id}>
                  <div className="ops-v2-priority-title">
                    <a href={orderPath(order.id)}>{orderReference(order)}</a>
                    <span>{t(order.state)}</span>
                  </div>
                  <p>
                    {t(
                      order.fulfillmentMethod === "pickup"
                        ? "Pickup"
                        : "Delivery",
                    )}{" "}
                    · {schedule(order) || t("Sin fecha")}
                  </p>
                  <ul>
                    {reasons.map((reason) => (
                      <li key={reason}>{t(reason)}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <p className="co-empty">
              {t("No scheduled work or exceptions to review")}
            </p>
          )}
          {agenda.priorities.length > 8 && (
            <p className="ops-v2-note">
              {t("More orders to review")}: {agenda.priorities.length - 8}
            </p>
          )}
        </ReportPanel>
        <ReportPanel
          title={t("Operational attention")}
          subtitle={t("Review evidence before taking action")}
        >
          <Distribution
            label={t("Operational warnings")}
            rows={[
              [
                "Orders requiring attention",
                agenda.priorities.filter((x) =>
                  x.reasons.some((r) => r !== "Scheduled today"),
                ).length,
              ],
              ["Failed or uncertain jobs", metrics.failedJobs],
              ["Customer email needs review", agenda.emailIssues],
              ["Inbound notifications requiring review", metrics.inboundFailed],
            ].map(([label, count]) => ({
              label: t(String(label)),
              count: Number(count),
            }))}
          />
          <p className="ops-v2-note">
            {t(
              "Email acceptance does not prove delivery. Review the order notification history.",
            )}
          </p>
          <button onClick={() => onNavigate("orders")}>
            {t("Open order workspace")}
          </button>
        </ReportPanel>
      </div>
      <ReportPanel
        title={t("Recent order activity")}
        subtitle={t("Stored order activity and fulfillment schedule")}
      >
        <div
          className="ops-table-scroll"
          role="region"
          tabIndex={0}
          aria-label={t("Recent order activity")}
        >
          <table>
            <thead>
              <tr>
                <th>{t("Order")}</th>
                <th>{t("Status")}</th>
                <th>{t("Fulfillment")}</th>
                <th>{t("Scheduled date")}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.id}>
                  <td>
                    <a href={orderPath(o.id)}>{orderReference(o)}</a>
                  </td>
                  <td>
                    <span className="ops-status-pill">{t(o.state)}</span>
                  </td>
                  <td>
                    {t(
                      o.fulfillmentMethod === "pickup" ? "Pickup" : "Delivery",
                    )}
                  </td>
                  <td>{schedule(o) || t("Sin fecha")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!recent.length && (
            <p className="co-empty">{t("No orders recorded")}</p>
          )}
        </div>
      </ReportPanel>
    </div>
  );
}
export function ProductsAvailability({
  role,
}: {
  role: Workspace["actor"]["role"];
}) {
  const { t } = useOps();
  return (
    <section className="ops-panel ops-availability">
      <h2>{t("Product Hub")}</h2>
      <p>
        {t(
          ["admin", "manager", "operator"].includes(role)
            ? "Product Hub is not integrated in this release"
            : "Product Hub access is restricted",
        )}
      </p>
      <p>
        {t(
          "The approved catalog remains unchanged. No editor or unfinished API is connected.",
        )}
      </p>
    </section>
  );
}
export function OperationsSettings({ data }: { data: Workspace }) {
  const { t } = useOps();
  if (!["admin", "manager"].includes(data.actor.role))
    return (
      <section className="ops-panel" role="status">
        {t("Settings access is restricted")}
      </section>
    );
  return (
    <section className="ops-panel">
      <h2>{t("Workspace settings")}</h2>
      <dl className="ops-settings-list">
        <dt>{t("Agente")}</dt>
        <dd>
          {data.agents.find((a) => a.id === data.actor.id)?.name ??
            data.actor.id}
        </dd>
        <dt>{t("Role")}</dt>
        <dd>{t(data.actor.role)}</dd>
        <dt>{t("Preference storage")}</dt>
        <dd>{t("Language is saved per user in this browser only")}</dd>
      </dl>
      <p>
        {t(
          "Printer registration is deferred until verified Windows connectivity",
        )}
      </p>
      <p className="co-muted">
        {t("Existing roles and server permissions remain authoritative")}
      </p>
    </section>
  );
}
