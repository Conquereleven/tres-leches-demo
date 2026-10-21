import { lineKey, preparationText } from "../../shared/pack-composition";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ChatsCircle,
  CheckCircle,
  Circle,
  CreditCard,
  EnvelopeSimple,
  MapPin,
  Phone,
  Receipt,
  Storefront,
  Translate,
  Truck,
  User,
  WarningCircle,
  WhatsappLogo,
} from "@phosphor-icons/react";
import type { Conversation, Order, Payment } from "../../server/domain/model";
import { orderReference } from "../../shared/order-number";
import type { Workspace as Data } from "./api";
import { TRANSLATION_REVIEW } from "./product-names";
import { FulfilmentBadge, PaymentBadge } from "./OrderBadges";
import { aed } from "./OrdersList";
import { useOps } from "./ops-i18n";
import {
  addressCheck,
  conversationOf,
  createdAt,
  customerName,
  dueDate,
  dueSlot,
  fulfilmentGroup,
  fulfilmentSteps,
  isDraft,
  orderActivity,
  orderLines,
  orderNotifications,
  orderPermissions,
  paymentMethod,
  paymentOf,
  type OrderPermissions,
} from "./order-view";

type Run = (body: Record<string, unknown>, path?: string) => Promise<boolean>;
type CardProps = { order: Order; data: Data };

function Card({
  title,
  icon,
  children,
  id,
  aside,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  id: string;
  aside?: ReactNode;
}) {
  return (
    <section className="oms-card" aria-labelledby={`oms-${id}`}>
      <header className="oms-card-head">
        <h2 id={`oms-${id}`}>
          {icon}
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Page heading for one order: the order number is the page title, replacing
 * the section title the shell shows for every other Operations view.
 */
export function OrderPageHeading({
  data,
  orderId,
  onBack,
}: {
  data: Data;
  orderId: string;
  onBack: () => void;
}) {
  const { t, formatDate } = useOps();
  const o = data.orders.find((o) => o.id === orderId);
  const placed = o && createdAt(o);
  return (
    <div className="oms-page-heading">
      <button type="button" className="oms-back" onClick={onBack}>
        <ArrowLeft aria-hidden />
        {t("Back to orders")}
      </button>
      <h1>{o ? orderReference(o) : t("Order not found")}</h1>
      {o && (
        <>
          <p className="oms-muted">
            {placed
              ? t("Created {{date}}", { date: formatDate(placed) })
              : t("Creation time not stored")}
            {o.publicOrderNumber && (
              <>
                {" · "}
                {t("Referencia interna")}{" "}
                <span className="oms-ref">{o.id}</span>
              </>
            )}
          </p>
          <div className="oms-badges">
            <PaymentBadge payment={paymentOf(data, o)} />
            <FulfilmentBadge order={o} />
          </div>
        </>
      )}
    </div>
  );
}

/** Dedicated page for one order, looked up by its immutable internal id. */
export function OrderDetailsPage({
  data,
  orderId,
  run,
  busy,
  openConversation,
  builder,
}: {
  data: Data;
  orderId: string;
  run: Run;
  busy: boolean;
  openConversation: (conversationId: string) => void;
  /** Existing order builder, shown only while an order is still a draft. */
  builder: (order: Order) => ReactNode;
}) {
  const { t } = useOps();
  const o = data.orders.find((o) => o.id === orderId);
  if (!o)
    return (
      <div className="oms oms-details">
        <div className="oms-card oms-empty" role="alert">
          <Receipt size={30} aria-hidden />
          <h2>{t("Order not found")}</h2>
          <p className="oms-muted">
            {t(
              "No order with this reference exists in this workspace. Check the link or return to the orders list.",
            )}
          </p>
          <p className="oms-ref">{orderId}</p>
        </div>
      </div>
    );
  const c = conversationOf(data, o);
  const p = paymentOf(data, o);
  const permissions = orderPermissions(data, o, c, p);
  const check = addressCheck(o);
  // Dispatch is the step an address problem affects; say so next to the button.
  const dispatchWarning =
    permissions.next?.to === "Out for Delivery" &&
    (check.incomplete || check.unverified);
  const act = (body: Record<string, unknown>, path?: string) => {
    if (!busy) void run(body, path);
  };
  const conversationButton = c && c.sourceNumberId !== "web" && (
    <button
      type="button"
      className="oms-button"
      onClick={() => openConversation(c.id)}
    >
      <ChatsCircle aria-hidden />
      {t("Abrir conversación")}
    </button>
  );
  return (
    <article
      className="oms oms-details"
      data-order={o.id}
      data-state={o.state}
      aria-label={`${t("Order")} ${orderReference(o)}`}
    >
      {(permissions.next || conversationButton) && (
        <div className="oms-action-bar">
          {dispatchWarning && (
            <p className="oms-notice oms-dispatch-warning" role="alert">
              <WarningCircle aria-hidden />
              <span>
                <strong>
                  {check.incomplete
                    ? t("Address incomplete")
                    : t("ADDRESS NOT VERIFIED")}
                </strong>{" "}
                · {t("Review address before dispatch")}
              </span>
            </p>
          )}
          <div className="oms-head-actions">
            <NextAction
              order={o}
              conversation={c}
              permissions={permissions}
              actorId={data.actor.id}
              busy={busy}
              act={act}
            />
            {conversationButton}
          </div>
        </div>
      )}

      <div className="oms-columns">
        <div className="oms-primary">
          <OrderFulfillmentCard
            order={o}
            data={data}
            permissions={permissions}
          />
          {isDraft(o) && (
            <Card id="builder" title={t("Order builder")}>
              <p className="oms-muted">
                {t(
                  "This order is still being built. Products, location and the payment request are managed here.",
                )}
              </p>
              {builder(o)}
            </Card>
          )}
          <OrderItemsCard order={o} data={data} />
          <OrderPaymentCard
            order={o}
            data={data}
            payment={p}
            permissions={permissions}
            busy={busy}
            act={act}
          />
          <OrderActivityTimeline order={o} data={data} />
        </div>
        <div className="oms-secondary">
          <OrderCustomerCard order={o} data={data} conversation={c} />
          <OrderDeliveryCard order={o} data={data} />
          <OrderNotificationsCard order={o} data={data} />
        </div>
      </div>
    </article>
  );
}

/** The one next step the state machine allows, or why none is offered. */
function NextAction({
  order: o,
  conversation: c,
  permissions,
  actorId,
  busy,
  act,
}: {
  order: Order;
  conversation?: Conversation;
  permissions: OrderPermissions;
  actorId: string;
  busy: boolean;
  act: (body: Record<string, unknown>, path?: string) => void;
}) {
  const { t } = useOps();
  const { next, owned, canTake } = permissions;
  if (!next) return null;
  if (owned)
    return (
      <button
        type="button"
        className="oms-button oms-primary-action"
        disabled={busy}
        onClick={() =>
          act({
            type: "transition",
            id: o.id,
            version: o.version,
            state: next.to,
          })
        }
      >
        {t(next.label)}
      </button>
    );
  if (canTake && c)
    return (
      <button
        type="button"
        className="oms-button oms-primary-action"
        disabled={busy}
        onClick={() =>
          act({
            type: "assign",
            id: c.id,
            version: c.version,
            agent: actorId,
          })
        }
      >
        {t("Tomar pedido")}
      </button>
    );
  return null;
}

export function OrderFulfillmentCard({
  order: o,
  permissions,
}: CardProps & { permissions: OrderPermissions }) {
  const { t, formatDate } = useOps();
  const { steps, current } = fulfilmentSteps(o);
  const group = fulfilmentGroup(o.state);
  const pickup = o.fulfillmentMethod === "pickup";
  const due = dueDate(o);
  const slot = dueSlot(o);
  const lastOperator = o.audit.findLast((a) => a.to)?.actor;
  return (
    <Card
      id="fulfillment"
      title={t("Fulfillment")}
      icon={pickup ? <Storefront aria-hidden /> : <Truck aria-hidden />}
      aside={<FulfilmentBadge order={o} />}
    >
      {group === "unpaid" && (
        <p className="oms-notice" role="status">
          <WarningCircle aria-hidden />
          {t(
            "Waiting for payment. This order is not in the kitchen queue and must not be prepared.",
          )}
        </p>
      )}
      {group === "to-confirm" && (
        <p className="oms-notice" role="status">
          {t("Se confirma automáticamente al conciliar el pago.")}
        </p>
      )}
      {group === "cancelled" && (
        <p className="oms-notice" role="status">
          {t(
            "This order was cancelled. Cancelling does not refund a payment; see the payment status.",
          )}
        </p>
      )}
      {group === "draft" && (
        <p className="oms-notice" role="status">
          {t("Draft order. It has not been sent for payment yet.")}
        </p>
      )}
      {!["unpaid", "cancelled", "draft"].includes(group) && (
        <ol className="oms-steps" aria-label={t("Fulfillment progress")}>
          {steps.map((s, i) => (
            <li
              key={s.state}
              data-status={
                current < 0
                  ? "todo"
                  : i < current
                    ? "done"
                    : i === current
                      ? "current"
                      : "todo"
              }
              aria-current={i === current ? "step" : undefined}
            >
              {current >= 0 && i <= current ? (
                <CheckCircle weight="fill" aria-hidden />
              ) : (
                <Circle aria-hidden />
              )}
              <span>{t(s.label)}</span>
            </li>
          ))}
        </ol>
      )}
      <dl className="oms-facts">
        <Field label={t("Method")}>
          {pickup ? t("Pickup · 3L Pastelerías") : t("Entrega")}
        </Field>
        <Field label={pickup ? t("Pickup date") : t("Delivery date")}>
          {due ? formatDate(due, false) : t("Sin fecha")}
          {slot ? ` · ${slot}` : ""}
        </Field>
        <Field label={t("Assigned to")}>
          {permissions.assignee ?? t("Sin asignar")}
        </Field>
        {lastOperator && (
          <Field label={t("Last status change by")}>{lastOperator}</Field>
        )}
      </dl>
      {permissions.next && !permissions.owned && !permissions.canTake && (
        <p className="oms-muted">
          {permissions.assignee
            ? t(
                "Assigned to {{name}}. Only the assigned operator can advance this order.",
                {
                  name: permissions.assignee,
                },
              )
            : t("Reabre la conversación para gestionar este pedido.")}
        </p>
      )}
      {permissions.next && permissions.canTake && (
        <p className="oms-muted">
          {t("Take this order to enable the next step: {{step}}.", {
            step: t(permissions.next.label),
          })}
        </p>
      )}
    </Card>
  );
}

export function OrderItemsCard({ order: o, data }: CardProps) {
  const { t } = useOps();
  const lines = orderLines(data, o);
  const missing = lines.some((l) => l.unitFils == null);
  return (
    <Card
      id="items"
      title={t("Items ordered")}
      icon={<Receipt aria-hidden />}
      aside={
        <span className="oms-muted">
          {t("{{count}} items", {
            count: lines.reduce((n, l) => n + l.quantity, 0),
          })}
        </span>
      }
    >
      {lines.length ? (
        <table className="oms-items">
          <thead>
            <tr>
              <th scope="col">{t("Producto")}</th>
              <th scope="col" className="oms-num">
                {t("Unit price")}
              </th>
              <th scope="col" className="oms-num">
                {t("Qty")}
              </th>
              <th scope="col" className="oms-num">
                {t("Line total")}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={lineKey(l)}>
                <th scope="row">
                  {/* Title stays the product; the review flag is a separate line. */}
                  <span lang="en" className="oms-item-name">
                    {l.product.name}
                  </span>
                  <small className="oms-ref">{l.productId}</small>
                  {preparationText(l) && <p lang="en">{preparationText(l)}</p>}
                  {l.product.reviewRequired && (
                    <small className="oms-item-review">
                      <Translate aria-hidden />
                      {TRANSLATION_REVIEW}
                    </small>
                  )}
                </th>
                <td className="oms-num" data-label={t("Unit price")}>
                  {aed(l.unitFils) ?? (
                    <span className="oms-muted">{t("Not stored")}</span>
                  )}
                </td>
                <td className="oms-num" data-label={t("Qty")}>
                  × {l.quantity}
                </td>
                <td className="oms-num" data-label={t("Line total")}>
                  {aed(l.lineFils) ?? (
                    <span className="oms-muted">{t("Not stored")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="oms-muted">{t("No products on this order yet.")}</p>
      )}
      {missing && (
        <p className="oms-notice" role="status">
          <WarningCircle aria-hidden />
          {t(
            "This order does not store a price for every item. Current catalog prices are not substituted.",
          )}
        </p>
      )}
    </Card>
  );
}

export function OrderPaymentCard({
  order: o,
  data,
  payment: p,
  permissions,
  busy,
  act,
}: CardProps & {
  payment?: Payment;
  permissions: OrderPermissions;
  busy: boolean;
  act: (body: Record<string, unknown>, path?: string) => void;
}) {
  const { t, formatDate } = useOps();
  const q = o.quote;
  const pickup = o.fulfillmentMethod === "pickup";
  const method = paymentMethod(p);
  const paidAt = p?.paidAt ?? o.paidAt;
  const jobs = p ? data.jobs.filter((j) => j.entityId === p.id) : [];
  return (
    <Card
      id="payment"
      title={t("Payment summary")}
      icon={<CreditCard aria-hidden />}
      aside={<PaymentBadge payment={p} />}
    >
      <dl className="oms-totals">
        <Field label={t("Subtotal")}>
          {q ? aed(q.subtotalFils) : t("Not stored")}
        </Field>
        {!pickup && q?.feeFils != null && (
          <Field label={t("Delivery fee")}>
            {q.feeFils === 0 ? t("Free") : aed(q.feeFils)}
          </Field>
        )}
        <div className="oms-total">
          <dt>{t("Total")}</dt>
          <dd>{aed(q?.totalFils) ?? t("Por confirmar")}</dd>
        </div>
      </dl>
      <dl className="oms-facts">
        <Field label={t("Payment method")}>
          {method ? t(method) : t("Not stored")}
        </Field>
        {p && (
          <Field label={t("Amount charged")}>
            {aed(p.amountFils)} {p.status === "paid" ? "" : `· ${t(p.status)}`}
          </Field>
        )}
        {paidAt && <Field label={t("Paid at")}>{formatDate(paidAt)}</Field>}
      </dl>
      {!p && (
        <p className="oms-muted">
          {t("No payment has been requested for this order.")}
        </p>
      )}
      {p && (
        <details className="oms-advanced">
          <summary>{t("Reconciliation details")}</summary>
          <dl className="oms-facts">
            <Field label={t("Provider")}>{p.provider ?? t("Not stored")}</Field>
            <Field label={t("Provider status")}>
              {p.providerRawStatus ?? t("Not stored")}
            </Field>
            <Field label={t("Transaction")}>
              <span className="oms-ref">
                {p.transactionId ?? t("Not stored")}
              </span>
            </Field>
            <Field label={t("Payment reference")}>
              <span className="oms-ref">{p.id}</span>
            </Field>
            <Field label={t("Last reconciliation")}>
              {p.lastReconciledAt
                ? formatDate(p.lastReconciledAt)
                : t("Pendiente")}
            </Field>
          </dl>
          {jobs
            .filter((j) => j.status === "unknown")
            .map((j) => (
              <p key={j.id} className="oms-notice" role="alert">
                <WarningCircle aria-hidden />
                {t("Operation needs review")}
                {t(". Usa Check Status para buscar el checkout existente.")}
              </p>
            ))}
          <div className="oms-actions">
            {permissions.canReconcile && (
              <button
                type="button"
                className="oms-button"
                disabled={busy}
                onClick={() => act({ paymentId: p.id }, "payments/reconcile")}
              >
                {t("Check Status · conciliar pago")}
              </button>
            )}
            {p.status === "pending" && permissions.owned && !isDraft(o) && (
              <button
                type="button"
                className="oms-button"
                disabled={busy}
                onClick={() =>
                  act({ type: "resendPayment", id: o.id, version: o.version })
                }
              >
                {t("Reenviar enlace")}
              </button>
            )}
            {permissions.owned &&
              jobs
                .filter((j) => j.status === "failed")
                .map((j) => (
                  <button
                    type="button"
                    key={j.id}
                    className="oms-button"
                    disabled={busy}
                    onClick={() => act({ type: "retryJob", id: j.id })}
                  >
                    {t("Reintentar creación del enlace")}
                  </button>
                ))}
          </div>
        </details>
      )}
    </Card>
  );
}

export function OrderCustomerCard({
  order: o,
  data,
  conversation: c,
}: CardProps & { conversation?: Conversation }) {
  const { t } = useOps();
  const who = customerName(data, o, c);
  const whatsapp = o.customerDetails?.whatsappNumber;
  const phone = c?.phone && c.phone !== whatsapp ? c.phone : undefined;
  const email = o.customerDetails?.email;
  const web = c?.sourceNumberId === "web";
  return (
    <Card id="customer" title={t("Cliente")} icon={<User aria-hidden />}>
      <p className="oms-customer-name">
        {who.name ?? (
          <span className="oms-muted">{t("Name not recorded")}</span>
        )}
      </p>
      {who.source === "conversation" && (
        <p className="oms-muted">{t("Name taken from the conversation")}</p>
      )}
      <ul className="oms-contact">
        {whatsapp && (
          <li>
            <WhatsappLogo aria-hidden />
            <span className="oms-sr">{t("WhatsApp:")}</span>
            <a
              href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {whatsapp}
            </a>
          </li>
        )}
        {phone && (
          <li>
            <Phone aria-hidden />
            <span className="oms-sr">{t("Phone")}</span>
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a>
          </li>
        )}
        {email && (
          <li>
            <EnvelopeSimple aria-hidden />
            <span className="oms-sr">{t("Email")}</span>
            <a href={`mailto:${email}`}>{email}</a>
          </li>
        )}
      </ul>
      {!whatsapp && !phone && !email && (
        <p className="oms-muted">{t("No contact details stored.")}</p>
      )}
      <dl className="oms-facts">
        <Field label={t("Channel")}>
          {c
            ? web
              ? t("Website checkout")
              : `WhatsApp · ${c.sourceNumberId.toUpperCase()}`
            : t("Not stored")}
        </Field>
      </dl>
    </Card>
  );
}

export function OrderDeliveryCard({ order: o }: CardProps) {
  const { t, formatDate } = useOps();
  const pickup = o.fulfillmentMethod === "pickup";
  const check = addressCheck(o);
  const stored = (v?: string | null) =>
    v?.trim() ? v : <span className="oms-muted">{t("Not stored")}</span>;
  return (
    <Card
      id="delivery"
      title={pickup ? t("Pickup") : t("Entrega")}
      icon={pickup ? <Storefront aria-hidden /> : <MapPin aria-hidden />}
    >
      {check.incomplete && (
        <p role="alert" className="oms-notice ops-address-review">
          <WarningCircle aria-hidden />
          <span>
            <strong>{t("Address incomplete")}</strong> ·{" "}
            {t("Review address before dispatch")}
          </span>
        </p>
      )}
      {check.unverified && (
        <p role="status" className="oms-notice ops-address-review">
          <WarningCircle aria-hidden />
          <span>
            <strong>{t("ADDRESS NOT VERIFIED")}</strong>
            {t("· Revisión manual de dirección requerida")}
          </span>
        </p>
      )}
      {pickup ? (
        <dl className="oms-facts oms-stack">
          <Field label={t("Pickup point")}>
            {t("Pastelerías 3L · Recoger en tienda")}
          </Field>
          <Field label={t("Pickup date")}>
            {o.pickup?.pickupDate
              ? formatDate(o.pickup.pickupDate, false)
              : t("Sin fecha")}
          </Field>
          <Field label={t("Hora")}>{stored(o.pickup?.preferredTime)}</Field>
        </dl>
      ) : (
        <dl className="oms-facts oms-stack">
          <Field label={t("Community")}>
            {o.quote?.zoneName ?? (
              <span className="oms-muted">{t("Ubicación pendiente")}</span>
            )}
          </Field>
          <Field label={t("Full address")}>{stored(o.address)}</Field>
          <Field label={t("Street / address")}>
            {stored(o.delivery?.address)}
          </Field>
          <Field label={t("Building / villa")}>
            {stored(o.delivery?.building)}
          </Field>
          <Field label={t("Apartment / unit")}>
            {stored(o.delivery?.unit)}
          </Field>
          <Field label={t("Delivery date")}>
            {o.delivery?.date
              ? formatDate(o.delivery.date, false)
              : t("Sin fecha")}
          </Field>
          <Field label={t("Time slot")}>{stored(o.delivery?.slot)}</Field>
          {o.location && (
            <Field label={t("GPS")}>
              {o.location.lat}, {o.location.lng}
            </Field>
          )}
        </dl>
      )}
      {o.customerDetails?.instructions && (
        <p className="oms-note">
          <strong>{t("Preparation instructions")}</strong>
          {o.customerDetails.instructions}
        </p>
      )}
      {o.delivery?.notes && (
        <p className="oms-note">
          <strong>{t("Delivery notes")}</strong>
          {o.delivery.notes}
        </p>
      )}
    </Card>
  );
}

export function OrderNotificationsCard({ order: o, data }: CardProps) {
  const { t } = useOps();
  const rows = orderNotifications(data, o);
  return (
    <Card
      id="notifications"
      title={t("Notificaciones")}
      icon={<EnvelopeSimple aria-hidden />}
    >
      {rows.length ? (
        <ul className="oms-notifications">
          {rows.map((n) => (
            <li key={n.id} data-status={n.status}>
              <span>
                <b>{t(n.channel)}</b>
                <small className="oms-muted">{t(n.subject)}</small>
              </span>
              <span className="oms-badge" data-tone={n.status}>
                {t(n.label)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="oms-muted">
          {t("No notifications recorded for this order.")}
        </p>
      )}
    </Card>
  );
}

export function OrderActivityTimeline({ order: o, data }: CardProps) {
  const { t, formatDate } = useOps();
  const entries = orderActivity(data, o);
  return (
    <Card id="activity" title={t("Order activity")}>
      {entries.length ? (
        <ol className="oms-timeline">
          {entries.map((e, i) => (
            <li key={i} data-kind={e.kind}>
              <p>
                {e.from && e.to ? `${t(e.from)} → ${t(e.to)}` : t(e.text)}
                {e.detail ? ` · ${t(e.detail)}` : ""}
              </p>
              <small className="oms-muted">
                {formatDate(e.at)} · {t("Dubai time")}
                {e.actor ? ` · ${e.actor}` : ""}
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="oms-muted">{t("No activity recorded.")}</p>
      )}
    </Card>
  );
}
