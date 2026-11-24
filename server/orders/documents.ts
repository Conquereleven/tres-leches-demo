import { fulfillmentSchedule } from "../../shared/fulfillment-schedule";
import { fulfillmentPending } from "../../shared/payment-fulfillment";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  DomainError,
  type Actor,
  type Order,
  type State,
} from "../domain/model";
import { safeLog } from "../observability";
import { MAX_ZIP_ENTRIES, ZipLimitError, ZipWriter } from "./zip";
import {
  documentsFor,
  dubaiDateTime,
  renderDocuments,
  type PrintKind,
  type PrintLayout,
} from "./print-documents";
import { orderReference } from "../../shared/order-number";
import { completedAt, dueDay } from "../../shared/order-days";
import { isDraft, itemCount } from "../../src/commerce/order-view";

/**
 * TPL-18 operational order documents: one-row-per-order CSV and print-ready
 * P1/P2 production & packing and P3 delivery notes (print-documents.ts). Read-only: no order, payment, notification or
 * print job is created. Never an invoice, tax invoice or payment receipt.
 */
export const MAX_DOCUMENT_ORDERS = 500;
export const DOCUMENT_ROLES: readonly Actor["role"][] = ["admin", "manager"];
/** packing-slip: P1 Production & Packing; production-bulk: P2; delivery-note: P3. */
export type DocumentKind = PrintKind;
const KINDS = ["delivery-note", "packing-slip", "production-bulk"] as const;

const selection = z
  .object({
    ids: z
      .array(z.string().min(1).max(120))
      .min(1)
      .max(MAX_DOCUMENT_ORDERS)
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate orders"),
    format: z.enum(["csv", "pdf", "zip"]),
    kind: z.enum(KINDS).default("delivery-note"),
    /** A5 two-up is a candidate layout, for delivery notes only. */
    layout: z.enum(["a4", "a5", "a5-two-up"]).default("a4"),
  })
  .strict()
  .refine((s) => s.layout === "a4" || s.kind === "delivery-note");

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
      fulfillmentPending(o) ? "FULFILLMENT REVIEW REQUIRED" : o.state,
      payment?.status ?? "no payment",
      o.fulfillmentMethod ?? "delivery",
      fulfillmentPending(o) ? "" : (dueDay(o) ?? ""),
      fulfillmentSchedule(o).slot ?? "",
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

const LABELS: Record<DocumentKind, string> = {
  "delivery-note": "Delivery notes",
  "packing-slip": "Production & packing",
  "production-bulk": "Production & packing (event / bulk)",
};

/** PDF bytes plus the printed text in logical order (for verification). */
export function orderDocuments(
  state: State,
  orders: Order[],
  kind: DocumentKind,
  actor: Actor,
  at = new Date(),
  layout: PrintLayout = "a4",
  sample = false,
) {
  return renderDocuments(documentsFor(state, orders), kind, {
    actor: actor.id,
    at,
    title: `3L ${LABELS[kind]}`,
    label: LABELS[kind],
    layout,
    sample,
  });
}

export function ordersPdf(
  state: State,
  orders: Order[],
  kind: DocumentKind,
  actor: Actor,
  at = new Date(),
  layout: PrintLayout = "a4",
) {
  return orderDocuments(state, orders, kind, actor, at, layout).pdf;
}

const fileSafe = (v: string) => v.replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 60);

/**
 * One single-order PDF per selected order, in selection order. The numeric
 * prefix keeps names unique and sorted even if two references sanitise alike.
 */
export function ordersZip(
  state: State,
  orders: Order[],
  kind: DocumentKind,
  actor: Actor,
  at = new Date(),
  layout: PrintLayout = "a4",
) {
  // One PDF at a time: only compressed bytes are kept, and generation stops
  // as soon as the archive budget is exceeded.
  if (orders.length > MAX_ZIP_ENTRIES)
    throw new DomainError(
      413,
      "Selection too large for one ZIP; select fewer orders",
    );
  const zip = new ZipWriter(at);
  try {
    orders.forEach((o, i) =>
      zip.add(
        `${String(i + 1).padStart(3, "0")}-${kind}-${fileSafe(orderReference(o)).replace(/^-+|-+$/g, "") || "order"}.pdf`,
        ordersPdf(state, [o], kind, actor, at, layout),
      ),
    );
  } catch (error) {
    if (error instanceof ZipLimitError)
      throw new DomainError(
        413,
        "Selection too large for one ZIP; select fewer orders",
      );
    throw error;
  }
  return zip.finish();
}

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
 * POST /api/orders/documents {ids, format, kind, layout} and
 * GET /api/orders/:id/document?kind=…&layout=… . Admin and manager only.
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
    const query = new URL(req.url!, "http://internal").searchParams;
    const kind = KINDS.find((k) => k === query.get("kind"));
    if (!kind)
      throw new DomainError(
        400,
        "Choose delivery-note, packing-slip or production-bulk",
      );
    const layout = query.get("layout") ?? "a4";
    if (
      layout !== "a4" &&
      (!["a5", "a5-two-up"].includes(layout) || kind !== "delivery-note")
    )
      throw new DomainError(400, "A5 layouts are for delivery notes only");
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
      ordersPdf(state, [order], kind, actor, stamp, layout as PrintLayout),
      "application/pdf",
      `3l-${kind}-${fileSafe(orderReference(order))}-${day}${layout === "a4" ? "" : `-${layout}-candidate`}.pdf`,
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
  const { ids, format, kind, layout } = parsed.data;
  const byId = new Map(state.orders.map((o) => [o.id, o]));
  const orders = ids.map((id) => byId.get(id));
  const missing = orders.filter((o) => !o).length;
  if (missing)
    throw new DomainError(
      404,
      `${missing} selected order${missing === 1 ? " was" : "s were"} not found; refresh and select again`,
    );
  safeLog("orders.document", {
    kind: format === "csv" ? "csv" : format === "zip" ? `zip:${kind}` : kind,
    count: ids.length,
  });
  if (format === "csv")
    send(
      res,
      ordersCsv(state, orders as Order[]),
      "text/csv; charset=utf-8",
      `3l-orders-${day}-${ids.length}.csv`,
    );
  else if (format === "zip")
    send(
      res,
      ordersZip(
        state,
        orders as Order[],
        kind,
        actor,
        stamp,
        layout as PrintLayout,
      ),
      "application/zip",
      `3l-${kind}s-${day}-${ids.length}${layout === "a4" ? "" : `-${layout}-candidate`}.zip`,
    );
  else
    send(
      res,
      ordersPdf(
        state,
        orders as Order[],
        kind,
        actor,
        stamp,
        layout as PrintLayout,
      ),
      "application/pdf",
      `3l-${kind}s-${day}-${ids.length}${layout === "a4" ? "" : `-${layout}-candidate`}.pdf`,
    );
  return true;
}
