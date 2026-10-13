import type { Workspace } from "./api";
import { orderPath } from "./order-view";
import { useOps } from "./ops-i18n";
import { overviewMetrics } from "./operations-overview";
import { orderReference } from "../../shared/order-number";
import {
  Receipt,
  Oven,
  CheckCircle,
  Truck,
  WarningCircle,
} from "@phosphor-icons/react";
export function OperationsOverview({
  data,
  onNavigate,
}: {
  data: Workspace;
  onNavigate: (view: string) => void;
}) {
  const { t, formatDate } = useOps();
  const metrics = overviewMetrics(data);
  const cards = [
    ["Orders requiring attention", metrics.attention, WarningCircle],
    ["Paid / confirmed", metrics.confirmed, Receipt],
    ["Preparing", metrics.preparing, Oven],
    ["Ready", metrics.ready, CheckCircle],
    ["Deliveries pending", metrics.deliveries, Truck],
  ] as const;
  const orders = data.orders
    .slice()
    .sort((a, b) =>
      (b.audit.at(-1)?.at ?? "").localeCompare(a.audit.at(-1)?.at ?? ""),
    )
    .slice(0, 6);
  return (
    <div className="ops-overview">
      <section className="ops-overview-intro">
        <div>
          <p className="ops-kicker">{t("WORKSPACE SNAPSHOT")}</p>
          <h2>{t("Keep every order moving")}</h2>
          <p>{t("Current workspace data · no estimated revenue")}</p>
        </div>
        <button className="primary" onClick={() => onNavigate("orders")}>
          {t("View orders")}
        </button>
      </section>
      <section className="ops-summary-grid" aria-label={t("Overview metrics")}>
        {cards.map(([label, count, Icon]) => (
          <button
            key={label}
            className="ops-summary-card"
            onClick={() =>
              onNavigate(label === "Deliveries pending" ? "delivery" : "orders")
            }
          >
            <Icon size={22} aria-hidden />
            <span>{t(label)}</span>
            <strong>{count}</strong>
          </button>
        ))}
      </section>
      <div className="ops-overview-columns">
        <section className="ops-panel">
          <h2>{t("Recent order activity")}</h2>
          {orders.length ? (
            <div className="ops-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("Order")}</th>
                    <th>{t("Status")}</th>
                    <th>{t("Scheduled date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <a href={orderPath(o.id)}>{orderReference(o)}</a>
                      </td>
                      <td>
                        <span className="ops-status-pill">{t(o.state)}</span>
                      </td>
                      <td>
                        {o.pickup?.pickupDate || o.delivery?.date
                          ? formatDate(
                              o.pickup?.pickupDate ?? o.delivery!.date!,
                              false,
                            )
                          : t("Sin fecha")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="co-empty">{t("No orders recorded")}</p>
          )}
        </section>
        <section className="ops-panel">
          <h2>{t("Operational warnings")}</h2>
          <ul className="ops-warning-list">
            <li>
              {t("Manual address review")}:{" "}
              <strong>{metrics.manualReview}</strong>
            </li>
            <li>
              {t("Failed or uncertain jobs")}:{" "}
              <strong>{metrics.failedJobs}</strong>
            </li>
            <li>
              {t("Inbound notifications requiring review")}:{" "}
              <strong>{metrics.inboundFailed}</strong>
            </li>
          </ul>
          <p className="co-muted">{t("Printer connection not configured")}</p>
          <button onClick={() => onNavigate("print")}>
            {t("Open Print Center")}
          </button>
        </section>
      </div>
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
