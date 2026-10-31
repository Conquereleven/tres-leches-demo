import { paidEmailLabel, windowEmailLabel } from "./customer-email-status";
import { acceptedLinePrice } from "../../shared/pack-pricing";
import type { Line } from "../../server/domain/model";
/**
 * Order management presentation rules. Pure functions over the workspace
 * snapshot: they decide what the Orders list and the order page show, never
 * what state an order or payment is in. Every action still goes through the
 * existing commands, and the server remains the authority on permissions.
 */
import type {
  Actor,
  Conversation,
  Order,
  OrderState,
  Payment,
} from "../../server/domain/model";
import { orderReference } from "../../shared/order-number";
import type { Workspace as Data } from "./api";
import {
  FULFILMENT_LABEL,
  NEXT_ACTION,
  dubaiDate,
  paymentBadge,
  type PaymentTone,
} from "./orders-board";
import { orderProductName, productSearchText } from "./product-names";

export const DRAFT_STATES: readonly OrderState[] = [
  "New",
  "Building",
  "Awaiting Location",
  "Minimum Check",
];
export const isDraft = (o: Pick<Order, "state">) =>
  DRAFT_STATES.includes(o.state);

export const conversationOf = (data: Data, o: Order) =>
  data.conversations.find((c) => c.id === o.conversationId);
export const paymentOf = (data: Data, o: Order) =>
  data.payments.find((p) => p.id === o.paymentId);

/** First recorded event; orders carry no separate creation timestamp. */
export const createdAt = (o: Pick<Order, "audit">) => o.audit[0]?.at;

const same = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The name the customer gave at checkout comes first. A conversation label is
 * used only when it is not a delivery area or a phone number: WhatsApp-built
 * orders can carry a zone ("JVC") there, which is not a person's name.
 */
export function customerName(
  data: Pick<Data, "zones">,
  o: Order,
  c?: Pick<Conversation, "customer" | "phone">,
): { name: string | null; source: "checkout" | "conversation" | "none" } {
  const explicit = [o.customerDetails?.firstName, o.customerDetails?.lastName]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(" ");
  if (explicit) return { name: explicit, source: "checkout" };
  const label = c?.customer?.trim();
  if (!label) return { name: null, source: "none" };
  const isArea =
    same(label, o.quote?.zoneName) ||
    data.zones.some(
      (z) => same(label, z.name) || z.aliases.some((a) => same(label, a)),
    );
  const isPhone = /^\+?[\d\s()-]{7,}$/.test(label) || same(label, c?.phone);
  return isArea || isPhone
    ? { name: null, source: "none" }
    : { name: label, source: "conversation" };
}

export type FulfilmentGroup =
  | "draft"
  | "unpaid"
  | "to-confirm"
  | "confirmed"
  | "preparing"
  | "ready"
  | "out"
  | "completed"
  | "cancelled";
export function fulfilmentGroup(state: OrderState): FulfilmentGroup {
  switch (state) {
    case "Awaiting Payment":
      return "unpaid";
    case "Paid":
      return "to-confirm";
    case "Confirmed":
      return "confirmed";
    case "Production":
      return "preparing";
    case "Ready":
      return "ready";
    case "Out for Delivery":
      return "out";
    case "Delivered":
      return "completed";
    case "Cancelled":
      return "cancelled";
    default:
      return "draft";
  }
}
export const FULFILMENT_FILTERS: [FulfilmentGroup | "any", string][] = [
  ["any", "All fulfillment"],
  ["unpaid", "Esperando pago"],
  ["to-confirm", "Por confirmar"],
  ["confirmed", "Confirmado"],
  ["preparing", "En preparación"],
  ["ready", "Listo"],
  ["out", "En camino"],
  ["completed", "Entregado"],
  ["cancelled", "Cancelado"],
  ["draft", "Draft"],
];
export const PAYMENT_FILTERS: [PaymentTone | "any", string][] = [
  ["any", "All payments"],
  ["paid", "Pagado"],
  ["pending", "Esperando pago"],
  ["review", "Pago en revisión"],
  ["issue", "Payment issue"],
  ["none", "Sin pago"],
];
/** Label shown for an order's fulfilment state; drafts keep their exact state. */
export const fulfilmentLabel = (
  o: Pick<Order, "state" | "fulfillmentMethod">,
) =>
  o.state === "Delivered" && o.fulfillmentMethod === "pickup"
    ? "Picked up"
    : (FULFILMENT_LABEL[o.state] ?? o.state);

export const dueDate = (o: Pick<Order, "pickup" | "delivery">) =>
  o.pickup?.pickupDate ?? o.delivery?.date;
export const dueSlot = (o: Pick<Order, "pickup" | "delivery">) =>
  o.pickup?.preferredTime ?? o.delivery?.slot;

export type ListQuery = {
  q: string;
  payment: PaymentTone | "any";
  fulfilment: FulfilmentGroup | "any";
  method: "any" | "delivery" | "pickup";
  /** Inclusive YYYY-MM-DD bounds in Asia/Dubai. */
  placedFrom: string;
  placedTo: string;
  dueFrom: string;
  dueTo: string;
  page: number;
};
export const EMPTY_QUERY: ListQuery = {
  q: "",
  payment: "any",
  fulfilment: "any",
  method: "any",
  placedFrom: "",
  placedTo: "",
  dueFrom: "",
  dueTo: "",
  page: 1,
};
const KEYS = {
  q: "q",
  payment: "payment",
  fulfilment: "status",
  method: "method",
  placedFrom: "placedFrom",
  placedTo: "placedTo",
  dueFrom: "dueFrom",
  dueTo: "dueTo",
} as const;
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Filters live in the URL so Back, refresh and shared links keep them. */
export function parseListQuery(search: string): ListQuery {
  const p = new URLSearchParams(search);
  const pick = <T extends string>(
    key: string,
    allowed: readonly (readonly [T, string])[],
  ): T | "any" => {
    const v = p.get(key);
    return allowed.some(([id]) => id === v) ? (v as T) : "any";
  };
  const date = (key: string) => {
    const v = p.get(key) ?? "";
    return isDate(v) ? v : "";
  };
  const method = p.get(KEYS.method);
  const page = Number(p.get("page"));
  return {
    q: (p.get(KEYS.q) ?? "").slice(0, 120),
    payment: pick(KEYS.payment, PAYMENT_FILTERS),
    fulfilment: pick(KEYS.fulfilment, FULFILMENT_FILTERS),
    method: method === "delivery" || method === "pickup" ? method : "any",
    placedFrom: date(KEYS.placedFrom),
    placedTo: date(KEYS.placedTo),
    dueFrom: date(KEYS.dueFrom),
    dueTo: date(KEYS.dueTo),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}
export function serializeListQuery(query: ListQuery): string {
  const p = new URLSearchParams();
  for (const [field, key] of Object.entries(KEYS) as [
    keyof typeof KEYS,
    string,
  ][]) {
    const v = query[field];
    if (v && v !== "any") p.set(key, v);
  }
  if (query.page > 1) p.set("page", String(query.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}
export const activeFilterCount = (q: ListQuery) =>
  (Object.keys(KEYS) as (keyof typeof KEYS)[]).filter(
    (k) => k !== "q" && q[k] && q[k] !== "any",
  ).length;

const digits = (v: string) => v.replace(/\D/g, "");
/** Everything staff may search an order by; identifiers and contact details. */
export function orderSearchText(data: Data, o: Order) {
  const c = conversationOf(data, o);
  return [
    orderReference(o),
    o.publicOrderNumber ? String(o.publicOrderNumber) : "",
    o.id,
    customerName(data, o, c).name,
    c?.customer,
    c?.phone,
    o.customerDetails?.whatsappNumber,
    o.customerDetails?.email,
    o.quote?.zoneName,
    ...o.lines.map((l) =>
      productSearchText(
        orderProductName(o, l.productId, data.catalog),
        l.productId,
      ),
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
export function matchesQuery(data: Data, o: Order, query: ListQuery) {
  const needle = query.q.trim().toLowerCase();
  if (needle) {
    const text = orderSearchText(data, o);
    const number = digits(needle);
    // "+971 50 123" should find "+97150123…" as well as a literal match.
    if (
      !text.includes(needle) &&
      !(number.length >= 4 && digits(text).includes(number))
    )
      return false;
  }
  if (
    query.payment !== "any" &&
    paymentBadge(paymentOf(data, o)).tone !== query.payment
  )
    return false;
  if (
    query.fulfilment !== "any" &&
    fulfilmentGroup(o.state) !== query.fulfilment
  )
    return false;
  if (
    query.method !== "any" &&
    (o.fulfillmentMethod ?? "delivery") !== query.method
  )
    return false;
  if (query.placedFrom || query.placedTo) {
    const at = createdAt(o);
    const day = at ? dubaiDate(at) : "";
    if (!day) return false;
    if (query.placedFrom && day < query.placedFrom) return false;
    if (query.placedTo && day > query.placedTo) return false;
  }
  if (query.dueFrom || query.dueTo) {
    const day = dueDate(o);
    if (!day) return false;
    if (query.dueFrom && day < query.dueFrom) return false;
    if (query.dueTo && day > query.dueTo) return false;
  }
  return true;
}
/** Newest first; orders with no recorded activity keep their stored order. */
export const byNewest = (a: Order, b: Order) =>
  (createdAt(b) ?? "").localeCompare(createdAt(a) ?? "");

export const PAGE_SIZE = 25;
export function listOrders(data: Data, query: ListQuery) {
  const matching = data.orders
    .filter((o) => matchesQuery(data, o, query))
    .sort(byNewest);
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(query.page, pages);
  return {
    total: matching.length,
    pages,
    page,
    rows: matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  };
}

export type LineView = Line & {
  productId: string;
  quantity: number;
  product: ReturnType<typeof orderProductName>;
  /** Stored unit price; null when the order does not record one. */
  unitFils: number | null;
  lineFils: number | null;
};
/**
 * Prices come from the order's own snapshot. Only a draft that has no snapshot
 * yet is priced from the current catalog, which is what its quote uses too. A
 * missing or ambiguous price stays unknown: never zero, never today's price.
 */
export function orderLines(data: Pick<Data, "catalog">, o: Order): LineView[] {
  const source = o.catalogSnapshot ?? (isDraft(o) ? data.catalog : []);
  return o.lines.map((l) => {
    const matches = source.filter((p) => p.id === l.productId);
    const price = matches.length === 1 ? matches[0]!.priceFils : undefined;
    const unitFils =
      Number.isSafeInteger(price) && price! >= 0
        ? acceptedLinePrice(l, price!)
        : null;
    return {
      ...l,
      productId: l.productId,
      quantity: l.quantity,
      product: orderProductName(o, l.productId, data.catalog),
      unitFils,
      lineFils: unitFils == null ? null : unitFils * l.quantity,
    };
  });
}
export const itemCount = (o: Pick<Order, "lines">) =>
  o.lines.reduce((n, l) => n + l.quantity, 0);

export function paymentMethod(p?: Pick<Payment, "provider" | "checkoutFlow">) {
  if (!p) return null;
  if (p.provider === "mock") return "Test provider";
  if (p.provider === "paymennt")
    return p.checkoutFlow === "web"
      ? "Card · Paymennt (website checkout)"
      : "Card · Paymennt";
  return null;
}

export type AddressCheck = {
  /** Delivery only: street or building missing. */
  incomplete: boolean;
  /** Delivery only: no server-side verification evidence. */
  unverified: boolean;
};
/** Same rules as the address hotfix; pickup orders need no delivery address. */
export function addressCheck(
  o: Pick<Order, "fulfillmentMethod" | "delivery">,
): AddressCheck {
  if (o.fulfillmentMethod === "pickup")
    return { incomplete: false, unverified: false };
  return {
    incomplete: !o.delivery?.address?.trim() || !o.delivery?.building?.trim(),
    unverified: o.delivery?.addressVerification !== "VERIFIED",
  };
}

export type OrderPermissions = {
  /** Conversation is assigned to this operator and open. */
  owned: boolean;
  /** Operator may assign the conversation to themselves. */
  canTake: boolean;
  assignee: string | null;
  /** Next fulfilment step allowed by the state machine, if any. */
  next: { to: OrderState; label: string } | null;
  canReconcile: boolean;
};
/**
 * Mirrors the rules the board already applied before offering a button. The
 * server enforces them again on every command.
 */
export function orderPermissions(
  data: Pick<Data, "actor" | "agents">,
  o: Order,
  c?: Conversation,
  p?: Payment,
): OrderPermissions {
  const actor: Actor = data.actor;
  const elevated = ["admin", "manager"].includes(actor.role);
  const owned = !!c && c.assignedAgent === actor.id && c.status === "open";
  const next =
    o.fulfillmentMethod === "pickup" && o.state === "Ready"
      ? { to: "Delivered" as const, label: "Confirmar recogida" }
      : (NEXT_ACTION[o.state] ?? null);
  return {
    owned,
    canTake:
      !!c && !owned && c.status === "open" && (!c.assignedAgent || elevated),
    assignee: data.agents.find((a) => a.id === c?.assignedAgent)?.name ?? null,
    next,
    canReconcile: p?.provider === "paymennt" && (owned || elevated),
  };
}

/** Steps shown on the order page; pickup has no "out for delivery" stage. */
export function fulfilmentSteps(o: Pick<Order, "state" | "fulfillmentMethod">) {
  const pickup = o.fulfillmentMethod === "pickup";
  const steps: { state: OrderState; label: string }[] = [
    { state: "Confirmed", label: "Confirmado" },
    { state: "Production", label: "Preparando" },
    { state: "Ready", label: pickup ? "Ready for pickup" : "Listo" },
    ...(pickup
      ? []
      : [{ state: "Out for Delivery" as const, label: "En camino" }]),
    { state: "Delivered", label: pickup ? "Picked up" : "Entregado" },
  ];
  return { steps, current: steps.findIndex((s) => s.state === o.state) };
}

export type ActivityEntry = {
  at: string;
  kind: "order" | "payment" | "notification";
  /** Translatable text, or a state change when `from`/`to` are present. */
  text: string;
  from?: OrderState;
  to?: OrderState;
  actor?: string;
  detail?: string;
};
const CUSTOMER_EVENT: Record<string, string> = {
  ORDER_PAID: "Payment confirmation",
  ORDER_PRODUCTION_STARTED: "En producción",
  ORDER_READY_FOR_PICKUP: "Listo para pickup",
  ORDER_OUT_FOR_DELIVERY: "En camino",
  ORDER_SCHEDULED_WINDOW_STARTED: "Inicio de ventana programada",
};
/**
 * One chronological record from what is stored: order audit, payment
 * timeline and notification outboxes. A notification is listed as sent only
 * when its row carries a provider-confirmed `sentAt`.
 */
export function orderActivity(data: Data, o: Order): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const a of o.audit)
    entries.push({
      at: a.at,
      kind: "order",
      text: a.action === "created" ? "Order created" : a.action,
      from: a.from,
      to: a.to,
      actor: a.actor,
    });
  for (const a of paymentOf(data, o)?.timeline ?? [])
    entries.push({
      at: a.at,
      kind: "payment",
      text: a.action,
      actor: a.actor,
    });
  for (const n of (data.operationsNotifications ?? []).filter(
    (n) => n.orderId === o.id,
  )) {
    entries.push({
      at: n.createdAt,
      kind: "notification",
      text: "Internal WhatsApp alert recorded",
      detail: n.recipient.name,
    });
    if (n.acceptedAt)
      entries.push({
        at: n.acceptedAt,
        kind: "notification",
        text: "WhatsApp API accepted",
        detail: n.recipient.name,
      });
    if (n.sentAt)
      entries.push({
        at: n.sentAt,
        kind: "notification",
        text: "Internal WhatsApp alert sent",
        detail: n.recipient.name,
      });
  }
  for (const n of (data.operationsEmailNotifications ?? []).filter(
    (n) => n.orderId === o.id,
  )) {
    entries.push({
      at: n.createdAt,
      kind: "notification",
      text: "Internal paid-order email recorded",
    });
    if (n.status === "sent" && n.sentAt)
      entries.push({
        at: n.sentAt,
        kind: "notification",
        text: "Internal paid-order email sent",
      });
  }
  for (const n of (data.customerNotifications ?? []).filter(
    (n) => n.orderId === o.id,
  )) {
    entries.push({
      at: n.createdAt,
      kind: "notification",
      text: "Customer email recorded",
      detail: CUSTOMER_EVENT[n.event] ?? n.event,
    });
    if (n.status === "sent" && n.sentAt)
      entries.push({
        at: n.sentAt,
        kind: "notification",
        text:
          n.event === "ORDER_PAID"
            ? "Email provider accepted — delivery unverified"
            : "Customer email sent",
        detail: CUSTOMER_EVENT[n.event] ?? n.event,
      });
  }
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.at.localeCompare(b.e.at) || a.i - b.i)
    .map(({ e }) => e);
}

export type NotificationRow = {
  id: string;
  channel: "Internal WhatsApp" | "Internal email" | "Customer email";
  subject: string;
  status:
    | "accepted"
    | "sent"
    | "delivered"
    | "read"
    | "suppressed"
    | "failed"
    | "sending"
    | "pending"
    | "disabled"
    | "expired";
  label: string;
  lastAttemptAt?: string;
  providerMessageId?: string;
};
/** What was recorded for the order and what actually happened to it. */
export function orderNotifications(data: Data, o: Order): NotificationRow[] {
  const rows: NotificationRow[] = [];
  for (const n of (data.operationsNotifications ?? []).filter(
    (n) => n.orderId === o.id,
  )) {
    const labels: Record<string, string> = {
      accepted: "WhatsApp API accepted",
      sent: "Enviado",
      delivered: "Entregado",
      read: "WhatsApp receipt read",
      suppressed: "WhatsApp alert not eligible",
      failed: "Falló · revisar",
      sending: "WhatsApp sending requires review",
    };
    const status: NotificationRow["status"] =
      n.status !== "pending-whatsapp-delivery"
        ? n.status
        : data.operationsOutboundEnabled
          ? "pending"
          : "disabled";
    rows.push({
      id: n.id,
      channel: "Internal WhatsApp",
      subject: n.recipient.name,
      status,
      label:
        labels[status] ??
        (status === "pending"
          ? "Pendiente"
          : "Pendiente · envío de WhatsApp desactivado"),
    });
  }
  const email = (
    n: { status: string; lastError?: string },
    provider: string | null | undefined,
  ): Pick<NotificationRow, "status" | "label"> =>
    n.status === "sent"
      ? { status: "sent", label: "Enviado" }
      : n.status === "failed"
        ? n.lastError?.startsWith("Expired")
          ? { status: "expired", label: "No enviado · caducó" }
          : { status: "failed", label: "Falló · revisar" }
        : n.status === "sending"
          ? { status: "sending", label: "Enviando" }
          : provider
            ? { status: "pending", label: "Pendiente" }
            : {
                status: "disabled",
                label: "Pendiente · proveedor de email no configurado",
              };
  for (const n of (data.operationsEmailNotifications ?? []).filter(
    (n) => n.orderId === o.id,
  ))
    rows.push({
      id: n.id,
      channel: "Internal email",
      subject: "New paid order",
      ...email(n, data.operationsEmailProvider),
    });
  for (const n of (data.customerNotifications ?? []).filter(
    (n) => n.orderId === o.id,
  ))
    rows.push({
      id: n.id,
      channel: "Customer email",
      subject: CUSTOMER_EVENT[n.event] ?? n.event,
      ...email(n, data.customerEmailProvider),
      ...(n.event === "ORDER_PAID" ||
      n.event === "ORDER_SCHEDULED_WINDOW_STARTED"
        ? {
            label:
              n.event === "ORDER_PAID"
                ? paidEmailLabel(n)
                : windowEmailLabel(n),
            status:
              n.deliveryOutcome === "accepted"
                ? ("accepted" as const)
                : n.status,
            lastAttemptAt: n.lastAttemptAt,
            providerMessageId: n.providerMessageId,
          }
        : {}),
    });
  return rows;
}

/** `/operations/orders/:orderId`; the internal id is the only lookup key. */
export const orderPath = (id: string) =>
  `/operations/orders/${encodeURIComponent(id)}`;
export function parseOperationsPath(pathname: string, search = "") {
  const [, , view = "overview", rest] = pathname.split("/");
  let orderId = "";
  if (view === "orders") {
    try {
      orderId = rest
        ? decodeURIComponent(rest)
        : (new URLSearchParams(search).get("order") ?? "");
    } catch {
      orderId = rest ?? "";
    }
  }
  return {
    view: view || "overview",
    orderId,
    /** Old `?order=` links are rewritten to the dedicated page. */
    legacy: view === "orders" && !rest && !!orderId,
  };
}
