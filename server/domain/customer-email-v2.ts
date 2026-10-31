/**
 * Customer email flow V2: exactly two automatic emails per newly paid order.
 *
 *   1. ORDER_PAID — "Order confirmed", queued in the authoritative paid
 *      transaction and sent as soon as possible.
 *   2. ORDER_SCHEDULED_WINDOW_STARTED — queued in the same transaction with
 *      `dueAt` = start of the accepted pickup/delivery window (Asia/Dubai),
 *      sent when that moment arrives. No kitchen or operator step is involved.
 *
 * Orders enrolled in V2 receive no OMS progress emails while V2 stays active
 * with the same epoch. Internal team emails are not affected.
 *
 * Off unless CUSTOMER_EMAIL_V2_ENABLED=true with a fresh activation epoch
 * (CUSTOMER_EMAIL_V2_SINCE). Only orders created, charged and paid after that
 * epoch are enrolled: no backfill, no replay.
 */
import { randomUUID } from "node:crypto";
import { acceptedLinePrice } from "../../shared/pack-pricing";
import { orderReference } from "../../shared/order-number";
import { PICKUP_LOCATION } from "../../shared/pickup-location";
import names from "../../src/commerce/ops-product-names.json";
import { approvedOperationsNames } from "../catalog/product-hub";
import { customerEmailItems } from "./customer-email-items";
import { customerName } from "./order-number";
import type { CustomerNotification, Order, Payment, State } from "./model";
import { acceptedSchedule, enrolmentKey } from "./customer-email-v2-policy";
export {
  CUSTOMER_EMAIL_V2_GRACE_MS,
  customerEmailV2Since,
  customerEmailV2Enrolled,
  windowStartsAt,
  acceptedSchedule,
  scheduledEmailBlocker,
} from "./customer-email-v2-policy";

const CONTACT = "For help, contact 3L: +971 58 594 3319.";

const money = (fils: number) => `AED ${(fils / 100).toFixed(2)}`;
const validMoney = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const day = (date: string) =>
  new Date(`${date}T12:00:00+04:00`).toLocaleDateString("en-GB", {
    timeZone: "Asia/Dubai",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

type Line = {
  name: string;
  quantity: number | null;
  lineTotalFils?: number;
  components: { name: string; units: number }[];
  boxCapacity?: number;
  contentsUnavailable: boolean;
};

/** Accepted items with reviewed English names; never the current catalog. */
function lines(s: State, order: Order): Line[] {
  const approved = approvedOperationsNames(s);
  const dictionary = names as Record<string, { source: string; en: string }>;
  const items = customerEmailItems(order);
  return order.lines.map((line, i) => {
    const item = items[i]!;
    const matches =
      order.catalogSnapshot?.filter((p) => p.id === line.productId) ?? [];
    const product = matches.length === 1 ? matches[0] : undefined;
    const english = (
      Object.hasOwn(dictionary, line.productId)
        ? [dictionary[line.productId]!]
        : []
    )
      .concat(approved[line.productId] ?? [])
      .find((v) => product?.name === v.source || product?.name === v.en)?.en;
    const unit =
      product && validMoney(product.priceFils)
        ? acceptedLinePrice(line, product.priceFils)
        : null;
    const total =
      unit !== null &&
      unit !== undefined &&
      item.quantity !== null &&
      Number.isSafeInteger(unit * item.quantity)
        ? unit * item.quantity
        : undefined;
    return {
      name: english ?? item.name,
      quantity: item.quantity,
      ...(total !== undefined ? { lineTotalFils: total } : {}),
      components: item.components,
      ...(item.boxCapacity !== undefined
        ? { boxCapacity: item.boxCapacity }
        : {}),
      contentsUnavailable: item.contentsUnavailable,
    };
  });
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

type Rendered = { subject: string; body: string; html: string };

/**
 * Customer version of the approved internal order email: wordmark header,
 * serif title, Product/Qty/Price panel, gold rules and a schedule block.
 * No internal id, kitchen warnings, admin links or payment identifiers.
 */
export function renderCustomerEmailV2(
  kind: "confirmed" | "window",
  input: {
    reference: string;
    first: string;
    method: "delivery" | "pickup";
    date: string;
    slot: string;
    zoneName?: string;
    lines: Line[];
    subtotalFils?: number;
    feeFils?: number;
    paidFils?: number;
  },
): Rendered {
  const pickup = input.method === "pickup";
  const when = [input.date && day(input.date), input.slot]
    .filter(Boolean)
    .join(" · ");
  const reconciles =
    validMoney(input.paidFils) &&
    input.lines.every((l) => l.lineTotalFils !== undefined) &&
    validMoney(input.subtotalFils) &&
    validMoney(input.feeFils) &&
    input.lines.reduce((n, l) => n + l.lineTotalFils!, 0) ===
      input.subtotalFils &&
    input.subtotalFils + input.feeFils === input.paidFils;
  const copy =
    kind === "confirmed"
      ? {
          subject: `Your 3L order ${input.reference} is confirmed`,
          title: `Order Confirmed: ${input.reference}`,
          kicker: `PAID · ${pickup ? "Pickup" : "Delivery"}${input.date ? ` · ${day(input.date)}` : ""}`,
          intro: `Hi ${input.first}, your payment is verified and your order is confirmed.`,
          next: pickup
            ? "We'll email you again when your pickup window starts."
            : "We'll email you again when your delivery window starts.",
        }
      : pickup
        ? {
            subject: `Your 3L order ${input.reference} is ready for pickup`,
            title: "Ready for pickup",
            kicker: `ORDER ${input.reference} · PICKUP`,
            intro: `Hi ${input.first}, your pickup window has started. Your order is ready for collection during ${input.slot}.`,
            next: "We look forward to seeing you.",
          }
        : {
            subject: `Your 3L delivery window has started · ${input.reference}`,
            title: "Your delivery window has started",
            kicker: `ORDER ${input.reference} · DELIVERY`,
            intro: `Hi ${input.first}, your scheduled delivery window (${input.slot}) has started. Please be available to receive your order during this time.`,
            next: "Thank you for choosing 3L.",
          };
  const place = pickup
    ? [PICKUP_LOCATION.name, ...PICKUP_LOCATION.lines]
    : input.zoneName
      ? [input.zoneName]
      : [];

  const text = [
    copy.intro,
    "",
    `Order ${input.reference}`,
    `${pickup ? "Pickup" : "Delivery"}: ${when || "Not stored"}`,
    ...(place.length
      ? [`${pickup ? "Pickup location" : "Area"}: ${place.join(", ")}`]
      : []),
    "",
    "ORDER SUMMARY",
  ];
  for (const l of input.lines) {
    text.push(
      `- ${l.quantity ?? "Quantity unavailable"} × ${l.name}${l.lineTotalFils !== undefined && reconciles ? ` · ${money(l.lineTotalFils)}` : ""}`,
    );
    if (l.boxCapacity !== undefined) {
      text.push(
        `  Each box (${l.boxCapacity} pieces):`,
        ...l.components.map((c) => `    - ${c.units} × ${c.name}`),
      );
    } else if (l.contentsUnavailable)
      text.push("  Box composition unavailable in this email.");
    else if (l.components.length === 1)
      text.push(`  Selection: ${l.components[0]!.name}`);
  }
  if (reconciles)
    text.push(
      "",
      `Subtotal: ${money(input.subtotalFils!)}`,
      `${pickup ? "Fulfillment" : "Delivery"} fee: ${money(input.feeFils!)}`,
    );
  if (validMoney(input.paidFils)) {
    if (!reconciles) text.push("");
    text.push(`Total paid: ${money(input.paidFils)}`);
  }
  text.push("", copy.next, CONTACT, "", PICKUP_LOCATION.name);

  const label =
    "font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.4;letter-spacing:1.8px;text-transform:uppercase;color:#715633;";
  const rows = input.lines
    .map((l) => {
      const contents =
        l.boxCapacity !== undefined
          ? `<p style="${label}margin:4px 0 2px;">Each box · ${l.boxCapacity} pieces</p><ul style="padding-left:18px;margin:0;">${l.components.map((c) => `<li>${c.units} × ${escapeHtml(c.name)}</li>`).join("")}</ul>`
          : l.contentsUnavailable
            ? `<p style="margin:3px 0 0;">Box composition unavailable in this email.</p>`
            : l.components.length === 1
              ? `<p style="margin:3px 0 0;">Selection: ${escapeHtml(l.components[0]!.name)}</p>`
              : "";
      return `<tr><th scope="row" style="text-align:left;vertical-align:top;padding:9px;font-weight:normal;border-bottom:1px solid #dbcbb3;overflow-wrap:anywhere;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.2;">${escapeHtml(l.name)}</span><div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#5A565F;">${contents}</div></th><td style="vertical-align:top;text-align:center;padding:10px 2px;font-size:17px;border-bottom:1px solid #dbcbb3;">${l.quantity ?? "–"}</td><td style="vertical-align:top;text-align:right;padding:10px 9px;font-size:16px;white-space:nowrap;border-bottom:1px solid #dbcbb3;">${reconciles && l.lineTotalFils !== undefined ? money(l.lineTotalFils) : "&nbsp;"}</td></tr>`;
    })
    .join("");
  const totals = [
    ...(reconciles
      ? [
          ["Subtotal", money(input.subtotalFils!)],
          [pickup ? "Fulfillment fee" : "Delivery fee", money(input.feeFils!)],
        ]
      : []),
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="${label}padding:3px 0;">${k}</td><td style="text-align:right;font-size:15px;">${v}</td></tr>`,
    )
    .join("");
  const paid = validMoney(input.paidFils)
    ? `<tr><td style="padding:8px 9px;border-top:1px solid #A28D5B;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="${label}font-size:11px;">Total paid</td><td style="text-align:right;font-family:Georgia,'Times New Roman',serif;font-size:23px;color:#715633;">${money(input.paidFils)}</td></tr></table></td></tr>`
    : "";
  const html = `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="format-detection" content="telephone=no"><title>${escapeHtml(copy.subject)}</title></head><body style="margin:0;padding:0;background:#fffcf8;color:#27242D;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.4;"><div role="main" lang="en" dir="ltr"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;table-layout:fixed;text-align:left;overflow-wrap:anywhere;">
<tr><td data-email-brand style="text-align:center;background:#F6DFE0;padding:12px 12px 10px;color:#715633;"><p style="font-size:26px;line-height:1.15;letter-spacing:5px;margin:0;">3L PASTELERÍAS</p><table role="presentation" width="44%" align="center" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1px solid #A28D5B;height:5px;font-size:1px;line-height:1px;">&nbsp;</td></tr></table><p style="font:10px Arial,Helvetica,sans-serif;letter-spacing:4px;margin:5px 0 0;">MEXICO CITY SINCE 1982</p></td></tr>
<tr><td style="text-align:center;padding:14px 14px 6px;"><h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:normal;line-height:1.15;margin:0 0 6px;">${escapeHtml(copy.title)}</h1><p style="${label}margin:0;">${escapeHtml(copy.kicker)}</p></td></tr>
<tr><td style="padding:6px 14px 10px;font-size:16px;">${escapeHtml(copy.intro)}</td></tr>
<tr><td style="padding:0 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-radius:11px;background:#F6DFE0;"><tr><td style="padding:9px 10px;width:50%;vertical-align:top;"><p style="${label}margin:0 0 3px;">${pickup ? "Pickup" : "Delivery"} window</p><p data-email-when style="margin:0;font-size:15px;">${escapeHtml(when || "Not stored")}</p></td><td style="padding:9px 10px;border-left:1px solid #dbcbb3;vertical-align:top;"><p style="${label}margin:0 0 3px;">${pickup ? "Pickup location" : "Area"}</p><p style="margin:0;font-size:14px;">${place.map(escapeHtml).join("<br>") || "&nbsp;"}</p></td></tr></table></td></tr>
<tr><td style="padding:10px 12px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border:1px solid #e5d9c9;border-radius:12px;border-spacing:0;"><tr><td><table aria-label="Your order" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-spacing:0;"><colgroup><col><col style="width:30px;"><col style="width:108px;"></colgroup><thead><tr style="background:#F6DFE0;"><th scope="col" style="text-align:left;padding:10px 9px;border-radius:11px 0 0 0;${label}">Product</th><th scope="col" style="text-align:center;padding:10px 2px;${label}">Qty</th><th scope="col" style="text-align:right;padding:10px 9px;border-radius:0 11px 0 0;${label}">Price</th></tr></thead><tbody>${rows}</tbody></table></td></tr>
${totals ? `<tr><td style="padding:8px 9px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${totals}</table></td></tr>` : ""}${paid}</table></td></tr>
<tr><td style="padding:14px 14px 4px;font-size:15px;">${escapeHtml(copy.next)}</td></tr>
<tr><td style="padding:0 14px 18px;font:13px Arial,Helvetica,sans-serif;color:#5A565F;">${escapeHtml(CONTACT)}<br><span style="color:#715633;">${escapeHtml(PICKUP_LOCATION.name)}</span></td></tr>
</table></td></tr></table></div></body></html>`;
  return { subject: copy.subject, body: text.join("\n"), html };
}

/**
 * Call only inside the authoritative paid+confirmed transaction. Records the
 * confirmation and the scheduled window email together, or nothing.
 */
export function recordCustomerEmailV2(
  s: State,
  order: Order,
  payment: Payment,
  since?: string,
): CustomerNotification[] {
  const cutoff = since ? Date.parse(since) : NaN;
  const created = order.audit[0]?.at;
  if (
    !Number.isFinite(cutoff) ||
    order.state !== "Confirmed" ||
    order.paymentId !== payment.id ||
    payment.orderId !== order.id ||
    payment.status !== "paid" ||
    !payment.paidAt ||
    order.paidAt !== payment.paidAt ||
    !order.publicOrderNumber ||
    !created ||
    ![created, payment.createdAt, payment.paidAt].every(
      (at) => Number.isFinite(Date.parse(at)) && Date.parse(at) >= cutoff,
    ) ||
    s.events[enrolmentKey(order.id)]
  )
    return [];
  const now = new Date().toISOString();
  s.events[enrolmentKey(order.id)] = since!;
  const recipient = order.customerDetails?.email;
  if (!recipient) {
    s.audit.push({
      at: now,
      actor: "system",
      action: `Customer email V2 ${order.id}: no customer email address; nothing queued`,
    });
    return [];
  }
  const conversation = s.conversations.find(
    (c) => c.id === order.conversationId,
  );
  const zone = s.zones.find(
    (z) => z.id === (order.delivery?.zoneId ?? order.manualZoneId),
  );
  const schedule = acceptedSchedule(order);
  const input = {
    reference: orderReference(order),
    first:
      order.customerDetails?.firstName ||
      customerName(order, conversation?.customer).split(/\s+/)[0] ||
      "there",
    method: schedule.method,
    date: schedule.date,
    slot: schedule.slot,
    zoneName: zone?.name ?? order.quote?.zoneName ?? undefined,
    lines: lines(s, order),
    subtotalFils: order.quote?.subtotalFils,
    feeFils: order.quote?.feeFils ?? undefined,
    paidFils: payment.amountFils,
  };
  const base = {
    channel: "email" as const,
    orderId: order.id,
    publicOrderNumber: order.publicOrderNumber,
    recipient,
    flow: "v2" as const,
    activationSince: since!,
    attemptCount: 0,
    createdAt: now,
  };
  const rows: CustomerNotification[] = [];
  const confirmedKey = `customer-event:ORDER_PAID:${order.id}`;
  if (!s.events[confirmedKey]) {
    const row: CustomerNotification = {
      id: randomUUID(),
      event: "ORDER_PAID",
      ...base,
      ...renderCustomerEmailV2("confirmed", input),
      status: "pending",
    };
    s.events[confirmedKey] = row.id;
    rows.push(row);
  }
  const windowKey = `customer-event:ORDER_SCHEDULED_WINDOW_STARTED:${order.id}`;
  if (!s.events[windowKey]) {
    const row: CustomerNotification = {
      id: randomUUID(),
      event: "ORDER_SCHEDULED_WINDOW_STARTED",
      ...base,
      ...renderCustomerEmailV2("window", input),
      schedule: {
        method: schedule.method,
        date: schedule.date,
        slot: schedule.slot,
      },
      ...(schedule.dueAt
        ? { dueAt: schedule.dueAt, status: "pending" as const }
        : {
            // An operational exception, visible in Operations; never guessed.
            status: "failed" as const,
            lastError: "Invalid or missing schedule; not scheduled",
          }),
    };
    s.events[windowKey] = row.id;
    rows.push(row);
  }
  s.customerNotifications ??= [];
  s.customerNotifications.push(...rows);
  s.audit.push({
    at: now,
    actor: "system",
    action: `Customer email V2 ${order.id}: confirmation queued; window email ${schedule.dueAt ? `scheduled for ${schedule.dueAt}` : "not scheduled (invalid or missing schedule)"}`,
  });
  return rows;
}
