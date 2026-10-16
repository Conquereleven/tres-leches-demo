import { lineKey, preparationText } from "../../shared/pack-composition";
import { orderProductName } from "./product-names";
import { OperationalProductName } from "./OperationalProductName";
import { useOps } from "./ops-i18n";
import type { ReactNode } from "react";
import {
  CalendarBlank,
  CheckCircle,
  Clock,
  MapPin,
} from "@phosphor-icons/react";
import type { Order } from "../../server/domain/model";
import { money, type Workspace as Data } from "./api";
import { orderReference } from "../../shared/order-number";
import {
  FULFILMENT,
  FULFILMENT_LABEL,
  NEXT_ACTION,
  fulfilmentIndex,
  paymentBadge,
} from "./orders-board";

type Run = (body: Record<string, unknown>, path?: string) => Promise<boolean>;

const customerOf = (data: Data, o: Order) =>
  data.conversations.find((c) => c.id === o.conversationId);
const productName = (data: Data, o: Order, id: string) =>
  orderProductName(o, id, data.catalog);

/**
 * Compact order card for the Kitchen and Deliveries queues. The Orders page
 * itself is the list and the dedicated order page (OrdersList, OrderDetails).
 */
export function OrderCard({
  order: o,
  data,
  run,
  today,
  details,
  openConversation,
  openOrder,
}: {
  order: Order;
  data: Data;
  run: Run;
  today: string;
  details: (o: Order) => ReactNode;
  openConversation: (conversationId: string) => void;
  openOrder?: (orderId: string) => void;
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
          <li key={lineKey(l)}>
            <b>{l.quantity}×</b>{" "}
            <OperationalProductName
              product={productName(data, o, l.productId)}
              id={l.productId}
            />
            {l.composition && <p lang="en">{preparationText(l)}</p>}
          </li>
        ))}
      </ul>

      {o.fulfillmentMethod !== "pickup" &&
        (!o.delivery?.address?.trim() || !o.delivery?.building?.trim()) && (
          <p role="alert" className="ops-address-review">
            <strong>{t("Address incomplete")}</strong> ·{" "}
            {t("Review address before dispatch")}
          </p>
        )}
      {o.fulfillmentMethod !== "pickup" &&
        o.delivery?.addressVerification !== "VERIFIED" && (
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
      {o.delivery?.notes && (
        <p className="ops-order-instructions">
          <strong>{t("Delivery notes")}</strong> {o.delivery.notes}
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
            <dd>
              <strong>{o.pickup?.preferredTime ?? o.delivery?.slot}</strong>
            </dd>
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
        {o.fulfillmentMethod !== "pickup" && (
          <>
            <div>
              <dt>{t("Full address")}</dt>
              <dd>{o.address || t("Not stored")}</dd>
            </div>
            <div>
              <dt>{t("Street / address")}</dt>
              <dd>{o.delivery?.address || t("Not stored")}</dd>
            </div>
            <div>
              <dt>{t("Building / villa")}</dt>
              <dd>{o.delivery?.building || t("Not stored")}</dd>
            </div>
            <div>
              <dt>{t("Apartment / unit")}</dt>
              <dd>{o.delivery?.unit || t("Not stored")}</dd>
            </div>
          </>
        )}
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
        {openOrder && (
          <button className="co-link" onClick={() => openOrder(o.id)}>
            {t("Open order page")}
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
