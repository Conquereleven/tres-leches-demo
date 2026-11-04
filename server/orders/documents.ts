import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  DomainError,
  type Actor,
  type Order,
  type State,
} from "../domain/model";
import { safeLog } from "../observability";
import { PdfDocument } from "./pdf";
import { orderReference } from "../../shared/order-number";
import { completedAt, dueDay } from "../../shared/order-days";
import { PICKUP_LOCATION } from "../../shared/pickup-location";
import { preparationText } from "../../shared/pack-composition";
import { ticketSnapshot } from "../../src/commerce/ticket-snapshot";
import { operationalProductName } from "../../src/commerce/product-names";
import opsEnglish from "../../src/commerce/locales/en.json";
import {
  customerName,
  fulfilmentLabel,
  isActionable,
  isDraft,
  itemCount,
} from "../../src/commerce/order-view";

/**
 * TPL-18 operational order documents: one-row-per-order CSV and print-ready
 * delivery notes / packing slips. Read-only: no order, payment, notification or
 * print job is created. Never an invoice, tax invoice or payment receipt.
 */
export const MAX_DOCUMENT_ORDERS = 500;
export const DOCUMENT_ROLES: readonly Actor["role"][] = ["admin", "manager"];
export type DocumentKind = "delivery-note" | "packing-slip";

const selection = z
  .object({
    ids: z
      .array(z.string().min(1).max(120))
      .min(1)
      .max(MAX_DOCUMENT_ORDERS)
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate orders"),
    format: z.enum(["csv", "pdf"]),
    kind: z.enum(["delivery-note", "packing-slip"]).default("delivery-note"),
  })
  .strict();

const dubaiDateTime = (at: string | Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(typeof at === "string" ? new Date(at) : at)
    .replace(", ", " ");
const longDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** Quoted cell; leading formula characters are neutralised for spreadsheets. */
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}

export const CSV_COLUMNS = [
  "order_reference",
  "internal_order_id",
  "placed_at_dubai",
  "order_state",
  "payment_status",
  "fulfillment_method",
  "due_date",
  "due_slot",
  "delivery_zone",
  "item_count",
  "total_aed",
  "total_source",
  "completed_at_dubai",
] as const;

/**
 * One row per order, without personal data: no names, phones, emails,
 * addresses, notes or provider references. A total is printed only when the
 * order stores a final quote; drafts and missing totals stay blank, never zero.
 */
export function ordersCsv(state: State, orders: Order[]) {
  const rows = orders.map((o) => {
    const payment = state.payments.find((p) => p.id === o.paymentId);
    const placed = o.audit[0]?.at;
    const done = completedAt(o);
    const fils = o.quote?.totalFils;
    const total =
      !isDraft(o) && typeof fils === "number" && Number.isSafeInteger(fils)
        ? (fils / 100).toFixed(2)
        : "";
    return [
      orderReference(o),
      o.id,
      placed ? dubaiDateTime(placed) : "",
      o.state,
      payment?.status ?? "no payment",
      o.fulfillmentMethod ?? "delivery",
      dueDay(o) ?? "",
      o.pickup?.preferredTime ?? o.delivery?.slot ?? "",
      o.fulfillmentMethod === "pickup" ? "" : (o.quote?.zoneName ?? ""),
      itemCount(o),
      total,
      isDraft(o)
        ? "not final (draft)"
        : total
          ? "stored order quote"
          : "unknown",
      done ? dubaiDateTime(done) : "",
    ];
  });
  // BOM so spreadsheet apps read UTF-8; CRLF per RFC 4180.
  return (
    "﻿" +
    [CSV_COLUMNS, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

// Documents are printed in English; state labels are stored as Spanish keys.
const english = (key: string) =>
  (opsEnglish as Record<string, string>)[key] ?? key;

const TITLES: Record<DocumentKind, string> = {
  "delivery-note": "DELIVERY NOTE",
  "packing-slip": "PACKING SLIP",
};
const documentTitle = (o: Order, kind: DocumentKind) =>
  kind === "delivery-note" && o.fulfillmentMethod === "pickup"
    ? "PICKUP ORDER SHEET"
    : TITLES[kind];

/** One order, starting on a new page. Only stored order facts are printed. */
function writeOrder(
  pdf: PdfDocument,
  state: State,
  o: Order,
  kind: DocumentKind,
) {
  pdf.newPage();
  const pickup = o.fulfillmentMethod === "pickup";
  const conversation = state.conversations.find(
    (c) => c.id === o.conversationId,
  );
  const payment = state.payments.find((p) => p.id === o.paymentId);
  pdf.text("3L Pastelerías", { size: 16, bold: true });
  pdf.text(documentTitle(o, kind), { size: 12, bold: true });
  pdf.text("Operational document · not an invoice, tax invoice or receipt", {
    size: 8,
  });
  pdf.rule();
  const ref = orderReference(o);
  pdf.text(`Order ${ref}`, { size: 14, bold: true });
  if (ref !== o.id) pdf.text(`Internal reference: ${o.id}`, { size: 8 });
  pdf.text(
    `Status: ${english(fulfilmentLabel(o))} · Payment: ${payment?.status ?? "no payment"}`,
  );
  if (!isActionable(o))
    pdf.text(
      o.state === "Cancelled"
        ? "CANCELLED · do not prepare or dispatch"
        : "NOT PAID OR NOT CONFIRMED · do not prepare or dispatch",
      { bold: true },
    );
  const day = dueDay(o);
  const slot = o.pickup?.preferredTime ?? o.delivery?.slot;
  pdf.text(
    `${pickup ? `Pickup at ${PICKUP_LOCATION.name}` : "Delivery"} · ${day ? longDay(day) : "Date not recorded"}${slot ? ` · ${slot}` : ""}`,
    { bold: true },
  );
  const done = completedAt(o);
  if (done)
    pdf.text(
      `${pickup ? "Collected" : "Delivered"}: ${dubaiDateTime(done)} (Dubai)`,
    );
  else if (o.state === "Delivered") pdf.text("Completion time not recorded");
  pdf.gap();
  const who = customerName(state, o, conversation).name;
  pdf.text(`Customer: ${who ?? "Name not recorded"}`, { bold: true });
  // Address and phone only where a courier needs them.
  if (kind === "delivery-note" && !pickup) {
    const d = o.delivery;
    const address = [d?.unit, d?.building, d?.address]
      .map((v) => v?.trim())
      .filter(Boolean)
      .join(", ");
    pdf.text(`Address: ${address || "Address not recorded"}`);
    pdf.text(`Area: ${o.quote?.zoneName ?? "Area not recorded"}`);
    if (d && d.addressVerification !== "VERIFIED")
      pdf.text("Address not verified · confirm with the customer", { size: 8 });
    const phone = conversation?.phone?.trim();
    const whatsapp = o.customerDetails?.whatsappNumber?.trim();
    pdf.text(`Phone: ${phone || whatsapp || "Phone not recorded"}`);
    if (phone && whatsapp && whatsapp !== phone)
      pdf.text(`WhatsApp: ${whatsapp}`);
  }
  pdf.rule();
  pdf.text("Items", { size: 12, bold: true });
  const lines = ticketSnapshot(o);
  if (!lines)
    pdf.text(
      "Items unavailable: the stored order snapshot is missing or inconsistent. Review the order before preparing.",
      { bold: true },
    );
  else {
    for (const l of lines) {
      const name = operationalProductName(l.productId, l.name).name;
      pdf.text(`${l.quantity} × ${name}`, { bold: true });
      const prep = preparationText(l);
      if (prep) pdf.text(prep, { indent: 18, size: 9 });
    }
    pdf.gap(4);
    pdf.text(`Total pieces: ${itemCount(o)}`);
  }
  const notes = [
    ["Customer notes", o.customerDetails?.instructions],
    [
      "Delivery notes",
      kind === "delivery-note" ? o.delivery?.notes : undefined,
    ],
  ] as const;
  if (notes.some(([, v]) => v?.trim())) {
    pdf.rule();
    for (const [label, value] of notes)
      if (value?.trim()) pdf.text(`${label}: ${value.trim()}`);
  }
  if (pdf.takeLossy())
    pdf.text(
      "Some characters cannot be printed in this PDF. Check the order page for the exact text.",
      { size: 8, bold: true },
    );
  if (kind === "delivery-note" && !pickup) {
    pdf.gap(24);
    pdf.text(
      "Received by (name and signature): ______________________________",
    );
    pdf.gap(6);
    pdf.text("Date and time: ______________________");
  }
}

export function ordersPdf(
  state: State,
  orders: Order[],
  kind: DocumentKind,
  actor: Actor,
  at = new Date(),
) {
  const label = kind === "delivery-note" ? "Delivery notes" : "Packing slips";
  const pdf = new PdfDocument(`3L ${label}`);
  for (const o of orders) writeOrder(pdf, state, o, kind);
  const generated = dubaiDateTime(at);
  return pdf.toBuffer(
    (page, pages) =>
      `${label} · ${orders.length} order${orders.length === 1 ? "" : "s"} · Generated ${generated} Dubai by ${actor.id} · Page ${page} of ${pages}`,
  );
}

const fileSafe = (v: string) => v.replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 60);

function send(
  res: ServerResponse,
  body: string | Buffer,
  type: string,
  filename: string,
) {
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
  });
  res.end(body);
}

/**
 * POST /api/orders/documents {ids, format, kind} and
 * GET /api/orders/:id/document?kind=… . Admin and manager only.
 */
export async function serveOrderDocuments(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  read: () => State,
  actor: Actor,
  body: () => Promise<unknown>,
): Promise<boolean> {
  const single = /^\/api\/orders\/([^/]+)\/document$/.exec(path);
  if (path !== "/api/orders/documents" && !single) return false;
  if (!DOCUMENT_ROLES.includes(actor.role))
    throw new DomainError(
      403,
      "Order documents require admin or manager access",
    );
  const state = read();
  const stamp = new Date();
  const day = dubaiDateTime(stamp).slice(0, 10);
  if (single) {
    if (req.method !== "GET") throw new DomainError(405, "Method not allowed");
    const kind = new URL(req.url!, "http://internal").searchParams.get("kind");
    if (kind !== "delivery-note" && kind !== "packing-slip")
      throw new DomainError(400, "Choose delivery-note or packing-slip");
    let id: string;
    try {
      id = decodeURIComponent(single[1]!);
    } catch {
      throw new DomainError(400, "Invalid order");
    }
    const order = state.orders.find((o) => o.id === id);
    if (!order) throw new DomainError(404, "Order not found");
    safeLog("orders.document", { kind, count: 1 });
    send(
      res,
      ordersPdf(state, [order], kind, actor, stamp),
      "application/pdf",
      `3l-${kind}-${fileSafe(orderReference(order))}-${day}.pdf`,
    );
    return true;
  }
  if (req.method !== "POST") throw new DomainError(405, "Method not allowed");
  const parsed = selection.safeParse(await body());
  if (!parsed.success)
    throw new DomainError(
      400,
      `Select between 1 and ${MAX_DOCUMENT_ORDERS} different orders`,
    );
  const { ids, format, kind } = parsed.data;
  const byId = new Map(state.orders.map((o) => [o.id, o]));
  const orders = ids.map((id) => byId.get(id));
  const missing = orders.filter((o) => !o).length;
  if (missing)
    throw new DomainError(
      404,
      `${missing} selected order${missing === 1 ? " was" : "s were"} not found; refresh and select again`,
    );
  safeLog("orders.document", {
    kind: format === "csv" ? "csv" : kind,
    count: ids.length,
  });
  if (format === "csv")
    send(
      res,
      ordersCsv(state, orders as Order[]),
      "text/csv; charset=utf-8",
      `3l-orders-${day}-${ids.length}.csv`,
    );
  else
    send(
      res,
      ordersPdf(state, orders as Order[], kind, actor, stamp),
      "application/pdf",
      `3l-${kind}s-${day}-${ids.length}.pdf`,
    );
  return true;
}
