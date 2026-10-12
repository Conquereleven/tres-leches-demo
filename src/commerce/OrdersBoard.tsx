import { orderProductName, productSearchText } from "./product-names";
import { OperationalProductName } from "./OperationalProductName";
import { useOps } from "./ops-i18n";
import { useState, type ReactNode } from "react";
import {
  CalendarBlank,
  CheckCircle,
  Clock,
  CurrencyCircleDollar,
  MapPin,
  Oven,
  Receipt,
  Truck,
} from "@phosphor-icons/react";
import type { Order } from "../../server/domain/model";
import { money, type Workspace as Data } from "./api";
import { orderReference } from "../../shared/order-number";
import {
  BOARD_FILTERS,
  BOARD_VIEWS,
  FULFILMENT,
  FULFILMENT_LABEL,
  NEXT_ACTION,
  boardMetrics,
  byDue,
  dubaiDate,
  fulfilmentIndex,
  inQueue,
  matchesFilter,
  matchesView,
  paymentBadge,
  type BoardFilter,
  type BoardView,
} from "./orders-board";

type Run = (body: Record<string, unknown>, path?: string) => Promise<boolean>;

const customerOf = (data: Data, o: Order) =>
  data.conversations.find((c) => c.id === o.conversationId);
const productName = (data: Data, o: Order, id: string) =>
  orderProductName(o, id, data.catalog);

/**
 * Kitchen-first orders board: what needs preparing, when it is due and
 * whether it is paid. Only paid orders are in the queue; orders still
 * waiting for payment sit in a separate, collapsed list.
 */
export function OrdersBoard({
  data,
  run,
  details,
  openConversation,
}: {
  data: Data;
  run: Run;
  details: (o: Order) => ReactNode;
  openConversation: (conversationId: string) => void;
}) {
  const { t } = useOps();
  const [view, setView] = useState<BoardView>("today");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<BoardFilter>("any");
  const today = dubaiDate();
  const metrics = boardMetrics(data.orders, data.payments, today);
  const queue = data.orders.filter(inQueue);
  const inView = queue.filter((o) => matchesView(o, view, today));
  const shown = inView
    .filter(
      (o) =>
        matchesFilter(o, filter) &&
        [
          orderReference(o),
          o.id,
          customerOf(data, o)?.customer,
          ...o.lines.map((l) =>
            productSearchText(productName(data, o, l.productId), l.productId),
          ),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(byDue);
  const unpaid = data.orders
    .filter((o) => o.state === "Awaiting Payment")
    .sort(byDue);
  const upcoming = queue.filter((o) => matchesView(o, "upcoming", today));
  return (
    <div className="ops-orders">
      <section className="ops-metrics" aria-label={t("Resumen de hoy")}>
        <Metric
          icon={<Receipt aria-hidden />}
          label={t("Pedidos de hoy")}
          value={String(metrics.todayOrders)}
          hint={t("Con entrega hoy")}
        />
        <Metric
          icon={<CurrencyCircleDollar aria-hidden />}
          label={t("Confirmed payments today")}
          value={t(money(metrics.todayRevenueFils))}
          hint={t("Pagos confirmados hoy")}
        />
        <Metric
          icon={<Oven aria-hidden />}
          label={t("En preparación")}
          value={String(metrics.preparing)}
        />
        <Metric
          icon={<Truck aria-hidden />}
          label={t("En camino")}
          value={String(metrics.outForDelivery)}
        />
      </section>

      <label className="ops-order-search">
        {t("Search orders")}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Order, customer or product")}
        />
      </label>
      <div className="ops-board-controls">
        <div
          className="ops-views"
          role="group"
          aria-label={t("Vista de pedidos")}
        >
          {BOARD_VIEWS.map(([id, label]) => (
            <button
              key={id}
              aria-pressed={view === id}
              onClick={() => setView(id)}
            >
              {t(label)}
              <span>
                {queue.filter((o) => matchesView(o, id, today)).length}
              </span>
            </button>
          ))}
        </div>
        <div
          className="ops-chips"
          role="group"
          aria-label={t("Filtrar por estado")}
        >
          {BOARD_FILTERS.map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {t(label)} · {inView.filter((o) => matchesFilter(o, id)).length}
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <ul className="ops-order-list" aria-label={t("Pedidos")}>
          {shown.map((o) => (
            <li key={o.id}>
              <OrderCard
                order={o}
                data={data}
                run={run}
                today={today}
                details={details}
                openConversation={openConversation}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="ops-board-empty">
          <span className="ops-empty-icon">
            <Receipt size={30} aria-hidden />
          </span>
          <h2>
            {queue.length
              ? view === "today"
                ? t("Nada pendiente para hoy")
                : t("Sin pedidos en esta vista")
              : t("Todo listo para el primer pedido")}
          </h2>
          <p className="co-empty">
            {queue.length
              ? t("Cambia la vista o el filtro para ver otros pedidos.")
              : t(
                  "No orders yet. Los pedidos pagados aparecerán aquí automáticamente.",
                )}
          </p>
          {view === "today" && upcoming.length > 0 && (
            <button className="co-link" onClick={() => setView("upcoming")}>
              {t("View upcoming orders", { count: upcoming.length })}
            </button>
          )}
        </div>
      )}

      {unpaid.length > 0 && (
        <details className="ops-unpaid">
          <summary>
            {t("Sin pago confirmado ·")} {unpaid.length}
            <small>{t("Fuera de la cola de producción")}</small>
          </summary>
          <ul className="ops-order-list">
            {unpaid.map((o) => (
              <li key={o.id}>
                <OrderCard
                  order={o}
                  data={data}
                  run={run}
                  today={today}
                  details={details}
                  openConversation={openConversation}
                />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  const { t } = useOps();
  return (
    <div className="ops-metric">
      <span className="ops-metric-icon">{icon}</span>
      <p>{t(label)}</p>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function OrderCard({
  order: o,
  data,
  run,
  today,
  details,
  openConversation,
}: {
  order: Order;
  data: Data;
  run: Run;
  today: string;
  details: (o: Order) => ReactNode;
  openConversation: (conversationId: string) => void;
}) {
  const { t, formatDate } = useOps();
  const c = customerOf(data, o);
  const payment = data.payments.find((p) => p.id === o.paymentId);
  const badge = paymentBadge(payment);
  const date = o.pickup?.pickupDate ?? o.delivery?.date;
  const due = {
    tone: !date
      ? "none"
      : date < today
        ? "late"
        : date === today
          ? "today"
          : "future",
    label: !date
      ? t("Sin fecha")
      : `${date < today && o.state !== "Delivered" ? t("Overdue") + " · " : ""}${formatDate(date, false)}`,
  };
  const web = c?.sourceNumberId === "web";
  const owned = !!c && c.assignedAgent === data.actor.id && c.status === "open";
  const canTake =
    !!c &&
    !owned &&
    c.status === "open" &&
    (!c.assignedAgent || ["admin", "manager"].includes(data.actor.role));
  const next =
    o.fulfillmentMethod === "pickup" && o.state === "Ready"
      ? { to: "Delivered" as const, label: "Confirmar recogida" }
      : NEXT_ACTION[o.state];
  const step = fulfilmentIndex(o.state);
  const assignee = data.agents.find((a) => a.id === c?.assignedAgent)?.name;
  return (
    <article
      className="ops-order-card"
      data-state={o.state}
      data-payment={badge.tone}
      aria-label={`${t("Order")} ${orderReference(o)}`}
    >
      <header className="ops-oc-head">
        {/* The number customers quote; absent only for unpaid or pre-numbering orders. */}
        {o.publicOrderNumber && (
          <strong className="ops-oc-number">{orderReference(o)}</strong>
        )}
        <span className={`ops-pay ops-pay-${badge.tone}`}>
          {badge.tone === "paid" && <CheckCircle weight="fill" aria-hidden />}
          {t(badge.label)}
        </span>
        <span className="ops-oc-state">
          {t(FULFILMENT_LABEL[o.state] ?? o.state)}
        </span>
        <strong className="ops-oc-total">{t(money(o.quote?.totalFils))}</strong>
      </header>

      <div className="ops-oc-who">
        <h2>{c?.customer ?? t("Cliente")}</h2>
        <p>
          <span title={t("Referencia interna")}>{o.id}</span> ·{" "}
          {o.fulfillmentMethod === "pickup" ? t("PICKUP") : t("DELIVERY")} ·{" "}
          {web ? t("Web") : (c?.sourceNumberId.toUpperCase() ?? "")}
          {c?.phone && <> · {c.phone}</>}
        </p>
      </div>

      {o.customerDetails?.whatsappNumber && (
        <p className="ops-oc-whatsapp">
          {t("WhatsApp:")}{" "}
          <a
            href={`https://wa.me/${o.customerDetails.whatsappNumber.slice(1)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {o.customerDetails.whatsappNumber}
          </a>
        </p>
      )}
      <ul className="ops-oc-lines" aria-label={t("Productos")}>
        {o.lines.map((l) => (
          <li key={l.productId}>
            <b>{l.quantity}×</b>{" "}
            <OperationalProductName
              product={productName(data, o, l.productId)}
              id={l.productId}
            />
          </li>
        ))}
      </ul>

      {o.delivery?.addressVerification === "UNVERIFIED" && (
        <p role="status" className="ops-address-review">
          <strong>{t("ADDRESS NOT VERIFIED")}</strong>
          {t("· Revisión manual de dirección requerida")}
        </p>
      )}
      {o.customerDetails?.instructions && (
        <p className="ops-order-instructions">
          <strong>{t("Preparation instructions")}</strong>{" "}
          {o.customerDetails.instructions}
        </p>
      )}
      <dl className="ops-oc-meta">
        <div data-tone={o.state === "Delivered" ? "none" : due.tone}>
          <dt>
            <CalendarBlank aria-hidden />{" "}
            {o.fulfillmentMethod === "pickup" ? t("Pickup") : t("Entrega")}
          </dt>
          <dd>
            {o.state === "Delivered" && due.tone === "late"
              ? due.label.replace("Atrasado · ", "")
              : due.label}
          </dd>
        </div>
        {(o.pickup?.preferredTime || o.delivery?.slot) && (
          <div>
            <dt>
              <Clock aria-hidden />
              {t("Hora")}
            </dt>
            <dd>{o.pickup?.preferredTime ?? o.delivery?.slot}</dd>
          </div>
        )}
        <div>
          <dt>
            <MapPin aria-hidden />{" "}
            {o.fulfillmentMethod === "pickup" ? t("Pickup") : t("Zona")}
          </dt>
          <dd>
            {o.fulfillmentMethod === "pickup"
              ? t("Pastelerías 3L · Recoger en tienda")
              : (o.quote?.zoneName ?? t("Ubicación pendiente"))}
          </dd>
        </div>
      </dl>

      {step >= 0 && (
        <ol className="ops-oc-steps" aria-label={t("Preparación")}>
          {FULFILMENT.map((s, i) => (
            <li
              key={s.state}
              className={i < step ? "done" : i === step ? "current" : ""}
              aria-current={i === step ? "step" : undefined}
            >
              {t(s.label)}
            </li>
          ))}
        </ol>
      )}

      <div className="ops-oc-actions">
        {o.state === "Paid" && (
          <p className="co-muted">
            {t("Se confirma automáticamente al conciliar el pago.")}
          </p>
        )}
        {next &&
          (owned ? (
            <button
              className="primary"
              onClick={() =>
                void run({
                  type: "transition",
                  id: o.id,
                  version: o.version,
                  state: next.to,
                })
              }
            >
              {t(next.label)}
            </button>
          ) : canTake ? (
            <button
              className="primary"
              onClick={() =>
                void run({
                  type: "assign",
                  id: c!.id,
                  version: c!.version,
                  agent: data.actor.id,
                })
              }
            >
              {t("Tomar pedido")}
            </button>
          ) : (
            <p className="co-muted">
              {assignee
                ? `Asignado a ${assignee}.`
                : t("Reabre la conversación para gestionar este pedido.")}
            </p>
          ))}
        {!web && c && (
          <button className="co-link" onClick={() => openConversation(c.id)}>
            {t("Abrir conversación")}
          </button>
        )}
      </div>

      <details className="ops-order-details">
        <summary>{t("Ver pedido y seguimiento")}</summary>
        {details(o)}
      </details>
    </article>
  );
}
