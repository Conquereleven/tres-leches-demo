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
import {
  BOARD_FILTERS,
  BOARD_VIEWS,
  FULFILMENT,
  FULFILMENT_LABEL,
  NEXT_ACTION,
  boardMetrics,
  byDue,
  dubaiDate,
  dueLabel,
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
  (o.catalogSnapshot ?? data.catalog).find((p) => p.id === id)?.name ?? id;

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
  const [view, setView] = useState<BoardView>("today");
  const [filter, setFilter] = useState<BoardFilter>("any");
  const today = dubaiDate();
  const metrics = boardMetrics(data.orders, data.payments, today);
  const queue = data.orders.filter(inQueue);
  const inView = queue.filter((o) => matchesView(o, view, today));
  const shown = inView.filter((o) => matchesFilter(o, filter)).sort(byDue);
  const unpaid = data.orders
    .filter((o) => o.state === "Awaiting Payment")
    .sort(byDue);
  const upcoming = queue.filter((o) => matchesView(o, "upcoming", today));
  return (
    <div className="ops-orders">
      <section className="ops-metrics" aria-label="Resumen de hoy">
        <Metric
          icon={<Receipt aria-hidden />}
          label="Pedidos de hoy"
          value={String(metrics.todayOrders)}
          hint="Con entrega hoy"
        />
        <Metric
          icon={<CurrencyCircleDollar aria-hidden />}
          label="Ingresos de hoy"
          value={money(metrics.todayRevenueFils)}
          hint="Pagos confirmados hoy"
        />
        <Metric
          icon={<Oven aria-hidden />}
          label="En preparación"
          value={String(metrics.preparing)}
        />
        <Metric
          icon={<Truck aria-hidden />}
          label="En camino"
          value={String(metrics.outForDelivery)}
        />
      </section>

      <div className="ops-board-controls">
        <div className="ops-views" role="group" aria-label="Vista de pedidos">
          {BOARD_VIEWS.map(([id, label]) => (
            <button
              key={id}
              aria-pressed={view === id}
              onClick={() => setView(id)}
            >
              {label}
              <span>
                {queue.filter((o) => matchesView(o, id, today)).length}
              </span>
            </button>
          ))}
        </div>
        <div className="ops-chips" role="group" aria-label="Filtrar por estado">
          {BOARD_FILTERS.map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label} · {inView.filter((o) => matchesFilter(o, id)).length}
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <ul className="ops-order-list" aria-label="Pedidos">
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
                ? "Nada pendiente para hoy"
                : "Sin pedidos en esta vista"
              : "Todo listo para el primer pedido"}
          </h2>
          <p className="co-empty">
            {queue.length
              ? "Cambia la vista o el filtro para ver otros pedidos."
              : "No orders yet. Los pedidos pagados aparecerán aquí automáticamente."}
          </p>
          {view === "today" && upcoming.length > 0 && (
            <button className="co-link" onClick={() => setView("upcoming")}>
              Ver {upcoming.length} pedido{upcoming.length === 1 ? "" : "s"}{" "}
              próximo{upcoming.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      )}

      {unpaid.length > 0 && (
        <details className="ops-unpaid">
          <summary>
            Sin pago confirmado · {unpaid.length}
            <small>Fuera de la cola de producción</small>
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
  return (
    <div className="ops-metric">
      <span className="ops-metric-icon">{icon}</span>
      <p>{label}</p>
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
  const c = customerOf(data, o);
  const payment = data.payments.find((p) => p.id === o.paymentId);
  const badge = paymentBadge(payment);
  const due = dueLabel(o.pickup?.pickupDate ?? o.delivery?.date, today);
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
      aria-label={`Pedido ${o.id}`}
    >
      <header className="ops-oc-head">
        <span className={`ops-pay ops-pay-${badge.tone}`}>
          {badge.tone === "paid" && <CheckCircle weight="fill" aria-hidden />}
          {badge.label}
        </span>
        <span className="ops-oc-state">
          {FULFILMENT_LABEL[o.state] ?? o.state}
        </span>
        <strong className="ops-oc-total">{money(o.quote?.totalFils)}</strong>
      </header>

      <div className="ops-oc-who">
        <h3>{c?.customer ?? "Cliente"}</h3>
        <p>
          {o.id} · {o.fulfillmentMethod === "pickup" ? "PICKUP" : "DELIVERY"} ·{" "}
          {web ? "Web" : (c?.sourceNumberId.toUpperCase() ?? "")}
          {c?.phone && <> · {c.phone}</>}
        </p>
      </div>

      {o.customerDetails?.whatsappNumber && (
        <p className="ops-oc-whatsapp">
          WhatsApp:{" "}
          <a
            href={`https://wa.me/${o.customerDetails.whatsappNumber.slice(1)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {o.customerDetails.whatsappNumber}
          </a>
        </p>
      )}
      <ul className="ops-oc-lines" aria-label="Productos">
        {o.lines.map((l) => (
          <li key={l.productId}>
            <b>{l.quantity}×</b> {productName(data, o, l.productId)}
          </li>
        ))}
      </ul>

      {o.delivery?.addressVerification === "UNVERIFIED" && (
        <p role="status" className="ops-address-review">
          <strong>ADDRESS NOT VERIFIED</strong> · Revisión manual de dirección
          requerida
        </p>
      )}
      <dl className="ops-oc-meta">
        <div data-tone={o.state === "Delivered" ? "none" : due.tone}>
          <dt>
            <CalendarBlank aria-hidden />{" "}
            {o.fulfillmentMethod === "pickup" ? "Pickup" : "Entrega"}
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
              <Clock aria-hidden /> Hora
            </dt>
            <dd>{o.pickup?.preferredTime ?? o.delivery?.slot}</dd>
          </div>
        )}
        <div>
          <dt>
            <MapPin aria-hidden />{" "}
            {o.fulfillmentMethod === "pickup" ? "Pickup" : "Zona"}
          </dt>
          <dd>
            {o.fulfillmentMethod === "pickup"
              ? "Pastelerías 3L · Recoger en tienda"
              : (o.quote?.zoneName ?? "Ubicación pendiente")}
          </dd>
        </div>
      </dl>

      {step >= 0 && (
        <ol className="ops-oc-steps" aria-label="Preparación">
          {FULFILMENT.map((s, i) => (
            <li
              key={s.state}
              className={i < step ? "done" : i === step ? "current" : ""}
              aria-current={i === step ? "step" : undefined}
            >
              {s.label}
            </li>
          ))}
        </ol>
      )}

      <div className="ops-oc-actions">
        {o.state === "Paid" && (
          <p className="co-muted">
            Se confirma automáticamente al conciliar el pago.
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
              {next.label}
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
              Tomar pedido
            </button>
          ) : (
            <p className="co-muted">
              {assignee
                ? `Asignado a ${assignee}.`
                : "Reabre la conversación para gestionar este pedido."}
            </p>
          ))}
        {!web && c && (
          <button className="co-link" onClick={() => openConversation(c.id)}>
            Abrir conversación
          </button>
        )}
      </div>

      <details className="ops-order-details">
        <summary>Ver pedido y seguimiento</summary>
        {details(o)}
      </details>
    </article>
  );
}
