import { fulfillmentSchedule } from "../../shared/fulfillment-schedule";
import { fulfillmentPending } from "../../shared/payment-fulfillment";
import { deliveryType, type DeliveryType } from "./delivery-type";
import { direction } from "./print-text";
import type { Order, State } from "../domain/model";
import { orderReference } from "../../shared/order-number";
import { completedAt, dueDay } from "../../shared/order-days";
import { PICKUP_LOCATION } from "../../shared/pickup-location";
import { tricolorSpec } from "../../shared/tricolor";
import { ticketSnapshot } from "../../src/commerce/ticket-snapshot";
import {
  TRANSLATION_REVIEW,
  operationalProductName,
} from "../../src/commerce/product-names";
import opsEnglish from "../../src/commerce/locales/en.json";
import {
  customerName,
  fulfilmentLabel,
  isActionable,
  itemCount,
} from "../../src/commerce/order-view";
import { approvedOperationsNames } from "../catalog/product-hub";
import {
  A4,
  BLUSH,
  Canvas,
  GOLD,
  INK,
  MUTED,
  mm,
  type Style,
} from "./print-canvas";

/**
 * TPL-18 Phase B operational documents, from the PRINT-01 reference
 * layouts: P1 Production & Packing (standard), P2 Production & Packing (event
 * / bulk) and P3 Delivery Note, plus an A5 two-up Delivery Note candidate.
 * Every fact comes from the stored order and its immutable snapshot; nothing
 * is derived, priced or sent. The order model has no kitchen ready-by time,
 * so Ready By stays explicitly Not provided, separately from the fulfilment slot.
 */
export type PrintKind = "packing-slip" | "production-bulk" | "delivery-note";
export type PrintLayout = "a4" | "a5" | "a5-two-up";
export const PRINT_LAYOUT_VERSION = "TPL-18 print v1";

type PrintLine = {
  quantity: number;
  sku: string;
  product: string;
  variant: string;
  reviewRequired: boolean;
  pack?: {
    capacity: number;
    revision: string;
    components: { units: number; name: string }[];
  };
  preparation?: string;
};
export type PrintOrder = {
  ref: string;
  internalRef?: string;
  method: "delivery" | "pickup";
  day: string | null;
  slot?: string;
  status: string;
  payment: string;
  hold?: string;
  itemsWarning?: string;
  completed?: string;
  recipient?: string;
  phone?: string;
  whatsapp?: string;
  address?: { lines: string[]; verified: boolean };
  deliveryNotes?: string;
  customerNotes?: string;
  /** Null when the stored snapshot is missing or inconsistent. */
  groups: { title: string; lines: PrintLine[] }[] | null;
  units: number;
};

// Documents are printed in English; state labels are stored as Spanish keys.
const english = (key: string) =>
  (opsEnglish as Record<string, string>)[key] ?? key;
const trimmed = (v?: string | null) => v?.trim() || undefined;
export const dubaiDateTime = (at: string | Date) =>
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
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** Maps one stored order to printable facts; reads, never writes. */
export function printOrder(
  state: State,
  o: Order,
  names = approvedOperationsNames(state),
): PrintOrder {
  const held = fulfillmentPending(o);
  const pickup = o.fulfillmentMethod === "pickup";
  const conversation = state.conversations.find(
    (c) => c.id === o.conversationId,
  );
  const payment = state.payments.find((p) => p.id === o.paymentId);
  const ref = orderReference(o);
  const done = completedAt(o);
  const lines = ticketSnapshot(o);
  let groups: PrintOrder["groups"] = null;
  if (lines) {
    groups = [];
    for (const l of lines) {
      const item = o.catalogSnapshot!.find((p) => p.id === l.productId)!;
      const name = operationalProductName(l.productId, l.name, names);
      const [product, ...variant] = name.name.split(" · ");
      const line: PrintLine = {
        quantity: l.quantity,
        sku: l.productId,
        product: product!,
        variant: variant.join(" · "),
        reviewRequired: name.reviewRequired,
      };
      if (tricolorSpec(l.productId) && !l.packSnapshot)
        line.preparation = "Color not recorded — preparation review required";
      if (tricolorSpec(l.productId) && l.packSnapshot)
        line.preparation =
          l.packSnapshot.components
            .map((c) => `${c.units} × ${c.name}`)
            .join(" · ") +
          ` · Total physical pieces: ${l.packSnapshot.capacity * l.quantity}`;
      else if (l.packSnapshot)
        line.pack = {
          capacity: l.packSnapshot.capacity,
          revision: l.packSnapshot.revision,
          components: l.packSnapshot.components.map((c) => ({
            units: c.units,
            name: c.name,
          })),
        };
      const title = trimmed(item.category) ?? "Other items";
      const group = groups.find((g) => g.title === title);
      if (group) group.lines.push(line);
      else groups.push({ title, lines: [line] });
    }
  }
  const d = o.delivery;
  const street =
    [d?.unit, d?.building].map(trimmed).filter(Boolean).join(" · ") ||
    undefined;
  // Conversation and legacy checkout orders store one full address line.
  const addressLines = d
    ? [
        street,
        trimmed(d.address) ?? trimmed(o.address),
        trimmed(o.quote?.zoneName ?? undefined),
      ]
    : [trimmed(o.address), trimmed(o.quote?.zoneName ?? undefined)];
  const phone = trimmed(conversation?.phone);
  const whatsapp = trimmed(o.customerDetails?.whatsappNumber);
  return {
    ref,
    internalRef: ref !== o.id ? o.id : undefined,
    method: pickup ? "pickup" : "delivery",
    day: held ? null : (dueDay(o) ?? null),
    slot: trimmed(fulfillmentSchedule(o).slot),
    status: english(fulfilmentLabel(o)),
    payment: payment?.status ?? "no payment",
    hold: held
      ? "FULFILLMENT REVIEW REQUIRED · do not prepare or dispatch"
      : isActionable(o)
        ? undefined
        : o.state === "Cancelled"
          ? "Cancelled · do not prepare or dispatch"
          : "Not paid or not confirmed · do not prepare or dispatch",
    itemsWarning: held
      ? "Items withheld: fulfillment review required. Do not prepare or dispatch."
      : undefined,
    completed: done
      ? `${pickup ? "Collected" : "Delivered"} ${dubaiDateTime(done)} (Dubai)`
      : o.state === "Delivered"
        ? "Completion time not recorded"
        : undefined,
    recipient: customerName(state, o, conversation).name ?? undefined,
    phone: pickup ? undefined : (phone ?? whatsapp),
    whatsapp:
      !pickup && phone && whatsapp && whatsapp !== phone ? whatsapp : undefined,
    address: pickup
      ? undefined
      : {
          lines: addressLines.filter((l): l is string => !!l),
          // Legacy address lines carry no verification evidence.
          verified: d?.addressVerification === "VERIFIED",
        },
    deliveryNotes: pickup ? undefined : trimmed(d?.notes),
    customerNotes: trimmed(o.customerDetails?.instructions),
    groups,
    units: itemCount(o),
  };
}

// ---------------------------------------------------------------- styles
const L = mm(13);
const R = A4.width - mm(13);
const W = R - L;
const TOP = mm(17);
const BOTTOM = A4.height - mm(15);
const LABEL: Style = {
  size: 7.4,
  weight: 600,
  color: MUTED,
  upper: true,
  spacing: 0.13,
};
const VALUE: Style = { size: 14, weight: 700, leading: 1.2 };
const H3: Style = { size: 11.5, weight: 700, leading: 1.25 };
const BODY: Style = { size: 11, weight: 600, leading: 1.35 };
const NONE = "None recorded";

const TITLES: Record<PrintKind, string> = {
  "packing-slip": "Production & Packing",
  "production-bulk": "Production & Packing",
  "delivery-note": "Delivery Note",
};
function subtitle(o: PrintOrder, kind: PrintKind) {
  if (kind === "delivery-note")
    return o.method === "pickup" ? "Pickup handover" : "Driver & handover copy";
  return kind === "production-bulk" ? "Event / bulk order" : "Standard order";
}
const slotLabel = (o: PrintOrder) =>
  o.method === "pickup" ? "Pickup time" : "Delivery slot";
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
function totals(o: PrintOrder) {
  const lines = o.groups?.flatMap((g) => g.lines) ?? [];
  return {
    lines: lines.length,
    units: o.units,
    packs: lines.filter((l) => l.pack).reduce((n, l) => n + l.quantity, 0),
    groups: o.groups?.length ?? 0,
  };
}

type Options = { actor: string; at: Date; sample?: boolean };

/** Vertical flow on A4 pages; a new page repeats the current table header. */
class Flow {
  y = TOP;
  continuation?: () => void;
  constructor(
    private readonly c: Canvas,
    private readonly onPage: () => void,
    readonly top = TOP,
    readonly bottom = BOTTOM,
  ) {}
  page() {
    this.c.addPage();
    this.onPage();
    this.y = this.top;
    this.continuation?.();
  }
  paragraph(
    x: number,
    width: number,
    value: string,
    style: Style,
    free = false,
  ) {
    for (const paragraph of value.split(/\r\n|\r|\n/)) {
      // Keep the paragraph's base direction on all its wrapped lines.
      const dir = free ? direction(paragraph) : "ltr";
      for (const line of this.c.lines(paragraph, style, width)) {
        this.fit(this.c.lineHeight(style));
        this.c.text(x, this.y, line, style, {
          dir,
          align: dir === "rtl" ? "right" : "left",
          width,
        });
        this.y += this.c.lineHeight(style);
      }
    }
  }
  /** Keeps a block of `height` together unless it is taller than a page. */
  fit(height: number) {
    if (this.y + height > this.bottom && this.y > this.top + mm(12))
      this.page();
  }
}

// ---------------------------------------------------------------- parts
function header(
  c: Canvas,
  f: Flow,
  o: PrintOrder,
  kind: PrintKind,
  opt: Options,
) {
  const top = f.y;
  c.wordmark(L, top, mm(11));
  c.text(L, top + mm(13.5), TITLES[kind], {
    size: 20,
    weight: 700,
    leading: 1.1,
  });
  c.text(L, top + mm(21.8), `Internal operations · ${subtitle(o, kind)}`, {
    ...LABEL,
    size: 7.6,
    spacing: 0.14,
  });
  const status = [
    `Status: ${o.status}`,
    `Payment: ${o.payment}`,
    o.completed,
  ].filter(Boolean);
  c.text(L, top + mm(25.6), status.join(" · "), {
    size: 7.6,
    weight: 600,
    color: MUTED,
  });
  const refStyle: Style = { size: 19, weight: 800, leading: 1.15 };
  const bw = Math.min(
    mm(75),
    Math.max(mm(46), c.width(o.ref, refStyle) + mm(8)),
  );
  if (c.width(o.ref, refStyle) > bw - mm(8)) refStyle.size = 11;
  const rows = [
    {
      h: mm(4),
      draw: (y: number) =>
        c.text(R - bw, y, "Order", LABEL, {
          align: "right",
          width: bw - mm(4),
        }),
    },
    {
      h: Math.max(mm(7.8), c.paragraphHeight(o.ref, refStyle, bw - mm(8))),
      draw: (y: number) =>
        c.paragraph(R - bw + mm(4), y, bw - mm(8), o.ref, refStyle),
    },
    ...(o.internalRef
      ? [
          {
            h: c.paragraphHeight(o.internalRef!, { size: 7.2 }, bw - mm(8)),
            draw: (y: number) =>
              c.paragraph(R - bw + mm(4), y, bw - mm(8), o.internalRef!, {
                size: 7.2,
                weight: 600,
                color: MUTED,
              }),
          },
        ]
      : []),
    ...(opt.sample
      ? [
          {
            h: mm(3.6),
            draw: (y: number) =>
              c.text(
                R - bw,
                y,
                "Synthetic sample",
                { size: 6.6, weight: 700, upper: true, spacing: 0.12 },
                { align: "right", width: bw - mm(4) },
              ),
          },
        ]
      : []),
  ];
  const bh = rows.reduce((n, r) => n + r.h, 0) + mm(5);
  c.rect(R - bw, top, bw, bh, {
    stroke: INK,
    fill: BLUSH,
    width: 1,
    radius: mm(2.5),
  });
  let y = top + mm(2.6);
  for (const r of rows) {
    r.draw(y);
    y += r.h;
  }
  f.y = Math.max(top + mm(30), top + bh + mm(3));
  c.rule(L, f.y, R, GOLD, 1.4);
  f.y += mm(0.5);
  if (o.hold) {
    const h = mm(9);
    f.y += mm(2.5);
    c.rect(L, f.y, W, h, { fill: INK, radius: mm(1.5) });
    c.text(
      L,
      f.y + mm(1.6),
      o.hold,
      { size: 11, weight: 800, color: "#FFFFFF", upper: true, spacing: 0.04 },
      { align: "center", width: W },
    );
    f.y += h;
  }
}

type Cell = { label: string; value: string; wide?: boolean; ready?: boolean };
function metaStrip(c: Canvas, f: Flow, o: PrintOrder, cells: Cell[]) {
  const pad = mm(2.4);
  const top = f.y + pad;
  const widths = cells.map((cell, i) => (i === 0 ? mm(52) : 0));
  const rest = (W - widths[0]!) / (cells.length - 1);
  let x = L;
  let height = mm(11);
  cells.forEach((cell, i) => {
    const w = i === 0 ? widths[0]! : rest;
    if (cell.ready) {
      const bw = w - mm(4);
      const hint = c.lines(
        cell.value,
        { size: 6.8, weight: 500 },
        bw - mm(5.2),
      );
      const h = mm(11.6) + hint.length * mm(3);
      c.rect(x, top - mm(1), bw, h, {
        stroke: MUTED,
        width: 1,
        radius: mm(2),
        dash: 2,
      });
      c.text(x + mm(2.6), top, cell.label, LABEL);
      c.text(x + mm(2.6), top + mm(3.8), "Not provided", {
        size: 11.5,
        weight: 600,
        color: MUTED,
        leading: 1.2,
      });
      hint.forEach((line, j) =>
        c.text(x + mm(2.6), top + mm(9) + j * mm(3), line, {
          size: 6.8,
          color: MUTED,
        }),
      );
      height = Math.max(height, h - mm(1));
    } else {
      c.text(x, top, cell.label, LABEL);
      const lines = c.lines(cell.value, VALUE, w - mm(3));
      lines.forEach((line, j) =>
        c.text(x, top + mm(4.2) + j * c.lineHeight(VALUE), line, VALUE),
      );
      height = Math.max(height, mm(4.2) + lines.length * c.lineHeight(VALUE));
    }
    x += w;
  });
  f.y = top + height + pad;
  c.rule(L, f.y, R, MUTED, 0.6);
}

function chips(
  c: Canvas,
  x: number,
  y: number,
  list: string[],
  alignRight = false,
) {
  const s: Style = { size: 8.4, weight: 700, leading: 1.2 };
  const widths = list.map((t) => c.width(t, s) + mm(5.2));
  const total = widths.reduce((n, w) => n + w, 0) + mm(1.6) * (list.length - 1);
  let at = alignRight ? x - total : x;
  list.forEach((t, i) => {
    c.rect(at, y, widths[i]!, mm(5.4), {
      stroke: INK,
      width: 0.8,
      radius: mm(2.7),
    });
    c.text(at + mm(2.6), y + mm(0.6), t, s);
    at += widths[i]! + mm(1.6);
  });
  return total;
}
const chipList = (o: PrintOrder) => {
  const t = totals(o);
  if (!o.groups) return ["Items unavailable", `${t.units} ordered units`];
  const list = [plural(t.lines, "line"), plural(t.units, "unit")];
  if (t.packs) list.push(plural(t.packs, "pack box", "pack boxes"));
  if (t.groups > 1) list.push(plural(t.groups, "group"));
  return list;
};

/** A small boxed label followed by wrapped text; returns its height. */
function tagged(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  tag: string,
  text: string,
  style: Style,
  inverse = false,
  dry = false,
) {
  const ts: Style = {
    size: 6.8,
    weight: 800,
    upper: true,
    spacing: 0.1,
    color: inverse ? "#FFFFFF" : INK,
  };
  const tw = c.width(tag, ts) + mm(2.6);
  const h = Math.max(mm(4.6), c.paragraphHeight(text, style, w - tw - mm(2)));
  if (dry) return h;
  c.rect(
    x,
    y + mm(0.6),
    tw,
    mm(3.6),
    inverse
      ? { fill: INK, radius: mm(0.8) }
      : { stroke: INK, width: 0.7, radius: mm(0.8) },
  );
  c.text(x + mm(1.3), y + mm(0.85), tag, ts);
  c.paragraph(x + tw + mm(2), y, w - tw - mm(2), text, style);
  return h;
}

function itemBlock(
  c: Canvas,
  l: PrintLine,
  x: number,
  w: number,
  dense: boolean,
  dry: boolean,
  y = 0,
) {
  const prod: Style = { size: dense ? 10.6 : 12, weight: 700, leading: 1.2 };
  const variant: Style = {
    size: dense ? 8.8 : 9.6,
    weight: 600,
    color: INK,
    leading: 1.25,
  };
  let h = 0;
  const step = (height: number) => (h += height);
  step(
    dry
      ? c.paragraphHeight(l.product, prod, w)
      : c.paragraph(x, y + h, w, l.product, prod),
  );
  if (l.variant)
    step(
      dry
        ? c.paragraphHeight(l.variant, variant, w)
        : c.paragraph(x, y + h, w, l.variant, variant),
    );
  if (l.pack) {
    h += mm(1.4);
    const top = h;
    const head = `Each box · ${l.pack.capacity} pieces${l.quantity > 1 ? ` · ${l.quantity} boxes = ${l.quantity * l.pack.capacity} pieces` : ""}`;
    const hs: Style = { size: 8, weight: 700, leading: 1.3 };
    if (!dry) c.text(x + mm(3), y + h, head, hs);
    h += c.lineHeight(hs) + mm(0.4);
    const cs: Style = { size: 9.6, weight: 500, leading: 1.3 };
    const colW = (w - mm(3)) / 2 - mm(2.5);
    for (let i = 0; i < l.pack.components.length; i += 2) {
      const pair = l.pack.components.slice(i, i + 2);
      let rowH = 0;
      pair.forEach((comp, j) => {
        const cx = x + mm(3) + j * (colW + mm(5));
        const nameW = colW - mm(7);
        rowH = Math.max(rowH, c.paragraphHeight(comp.name, cs, nameW));
        if (!dry) {
          c.text(
            cx,
            y + h,
            String(comp.units),
            { ...cs, weight: 700 },
            { align: "right", width: mm(5) },
          );
          c.paragraph(cx + mm(7), y + h, nameW, comp.name, cs);
        }
      });
      h += rowH;
    }
    const rs: Style = { size: 6.6, color: MUTED, leading: 1.3 };
    if (!dry)
      c.text(x + mm(3), y + h + mm(0.3), `Snapshot ${l.pack.revision}`, rs);
    h += c.lineHeight(rs) + mm(0.5);
    if (!dry)
      c.pdf
        .save()
        .lineWidth(1.6)
        .moveTo(x + mm(0.6), y + top)
        .lineTo(x + mm(0.6), y + h)
        .stroke(GOLD)
        .restore();
  }
  const ts: Style = { size: 9.8, weight: 600, leading: 1.3 };
  if (l.preparation) {
    h += mm(1.1);
    h += tagged(c, x, y + h, w, "Preparation", l.preparation, ts, false, dry);
  }
  if (l.reviewRequired) {
    h += mm(1.1);
    h += tagged(
      c,
      x,
      y + h,
      w,
      "! Review",
      `${TRANSLATION_REVIEW} (${l.sku})`,
      ts,
      true,
      dry,
    );
  }
  return h;
}

function itemsTable(c: Canvas, f: Flow, o: PrintOrder, bulk: boolean) {
  const checks = bulk ? ["Prep", "Pack"] : ["Done"];
  const qtyW = mm(17);
  const chkW = mm(13);
  const itemX = L + qtyW;
  const itemW = W - qtyW - checks.length * chkW - mm(2);
  const head = () => {
    const y = f.y + mm(1.4);
    c.text(L, y, "Qty", { ...LABEL, size: 7.2, weight: 700 });
    c.text(itemX, y, "Product / variation", {
      ...LABEL,
      size: 7.2,
      weight: 700,
    });
    checks.forEach((k, i) =>
      c.text(
        R - (checks.length - i) * chkW,
        y,
        k,
        { ...LABEL, size: 7.2, weight: 700 },
        { align: "center", width: chkW },
      ),
    );
    f.y = y + mm(4.4);
    c.rule(L, f.y, R, INK, 1);
  };
  if (!o.groups) {
    f.fit(mm(14));
    f.y += mm(3);
    c.rect(L, f.y, W, mm(11), { stroke: INK, width: 1.2, radius: mm(2) });
    c.paragraph(
      L + mm(3),
      f.y + mm(1.5),
      W - mm(6),
      o.itemsWarning ??
        "Items unavailable: the stored order snapshot is missing or inconsistent. Review the order before preparing.",
      { size: 10, weight: 700, leading: 1.3 },
    );
    f.y += mm(11);
    return;
  }
  const showGroups = bulk;
  let open: string | undefined;
  f.fit(mm(30));
  head();
  // A group that continues on a new page is labelled again under the header.
  f.continuation = () => {
    head();
    if (!open || !showGroups) return;
    c.text(L, f.y + mm(1.6), `${open} (continued)`, {
      size: 8,
      weight: 800,
      upper: true,
      spacing: 0.14,
      color: MUTED,
    });
    f.y += mm(6);
    c.rule(L, f.y, R, MUTED, 0.5);
  };
  for (const g of o.groups) {
    open = undefined;
    const units = g.lines.reduce((n, l) => n + l.quantity, 0);
    const groupH = showGroups ? (bulk ? mm(9.5) : mm(6.5)) : 0;
    const groupHeading = () => {
      if (showGroups) {
        const y = f.y + (bulk ? mm(3) : mm(2));
        const gs: Style = bulk
          ? { size: 10.5, weight: 800, upper: true, spacing: 0.06 }
          : { size: 8, weight: 800, upper: true, spacing: 0.14, color: MUTED };
        c.text(L, y, g.title, gs);
        c.text(
          L,
          y + (bulk ? mm(0.6) : 0),
          `${plural(g.lines.length, "line")} · ${plural(units, "unit")}`,
          { size: 8, weight: 600, color: MUTED },
          { align: "right", width: W },
        );
        f.y += groupH;
        c.rule(L, f.y, R, bulk ? INK : MUTED, bulk ? 1 : 0.5);
      }
    };
    const rowH = (l: PrintLine) =>
      Math.max(mm(9), itemBlock(c, l, itemX, itemW, bulk, true) + mm(3.6));
    g.lines.forEach((l, i) => {
      const h = rowH(l);
      if (h > BOTTOM - TOP - mm(24)) {
        f.fit(mm(25) + (i === 0 ? groupH : 0));
        if (i === 0) groupHeading();
        open = g.title;
        f.paragraph(L, W, `${l.quantity} × ${l.product}`, {
          size: 12,
          weight: 700,
        });
        if (l.variant) f.paragraph(itemX, itemW, l.variant, BODY);
        if (l.pack) {
          f.paragraph(
            itemX,
            itemW,
            `Each box · ${l.pack.capacity} pieces · ${l.quantity} boxes = ${l.quantity * l.pack.capacity} pieces`,
            BODY,
          );
          for (const component of l.pack.components)
            f.paragraph(
              itemX,
              itemW,
              `${component.units} × ${component.name}`,
              BODY,
            );
          f.paragraph(itemX, itemW, `Snapshot ${l.pack.revision}`, {
            size: 7,
            color: MUTED,
          });
        }
        if (l.preparation) f.paragraph(itemX, itemW, l.preparation, BODY);
        if (l.reviewRequired)
          f.paragraph(itemX, itemW, `${TRANSLATION_REVIEW} (${l.sku})`, BODY);
        f.fit(mm(9));
        checks.forEach((k, j) => {
          c.checkbox(L + j * mm(32), f.y);
          c.text(L + mm(7) + j * mm(32), f.y, k, BODY);
        });
        f.y += mm(9);
        c.rule(L, f.y, R, MUTED, 0.5);
        return;
      }

      // A group heading always stays with its first row.
      f.fit(h + (i === 0 ? groupH : 0));
      if (i === 0) groupHeading();
      open = g.title;
      const y = f.y + mm(1.8);
      const qs: Style = { size: bulk ? 15 : 19, weight: 800, leading: 1 };
      const qw = c.text(L, y + mm(0.3), String(l.quantity), qs);
      c.text(L + qw + mm(0.6), y + mm(bulk ? 1.4 : 2.4), "×", {
        size: 8,
        weight: 600,
        leading: 1,
      });
      itemBlock(c, l, itemX, itemW, bulk, false, y);
      checks.forEach((_, j) =>
        c.checkbox(
          R - (checks.length - j) * chkW + (chkW - mm(bulk ? 5.4 : 6.2)) / 2,
          y,
          mm(bulk ? 5.4 : 6.2),
        ),
      );
      f.y += h;
      c.rule(L, f.y, R, MUTED, 0.5);
    });
  }
  f.continuation = undefined;
}

function notesBox(
  c: Canvas,
  f: Flow,
  title: string,
  text: string | undefined,
  extra?: { title: string; text?: string },
) {
  const inner = W - mm(8);
  const parts = [{ title, text }, ...(extra ? [extra] : [])];
  const heights = parts.map(
    (p) =>
      c.lineHeight(H3) + mm(1) + c.paragraphHeight(p.text ?? NONE, BODY, inner),
  );
  const h =
    heights.reduce((n, x) => n + x, 0) + mm(4.8) + (parts.length - 1) * mm(2);
  if (h > BOTTOM - TOP - mm(12)) {
    for (const part of parts) {
      f.fit(mm(14));
      f.y += mm(3);
      f.paragraph(L, W, part.title, H3);
      f.paragraph(L, W, part.text ?? NONE, BODY, true);
    }
    return;
  }
  f.fit(h + mm(3));
  f.y += mm(3);
  c.rect(L, f.y, W, h, { stroke: MUTED, width: 0.8, radius: mm(2) });
  let y = f.y + mm(2.4);
  parts.forEach((p) => {
    c.text(L + mm(4), y, p.title, H3);
    y += c.lineHeight(H3) + mm(1);
    y += c.paragraph(
      L + mm(4),
      y,
      inner,
      p.text ?? NONE,
      p.text ? BODY : { ...BODY, color: MUTED },
      true,
    );
    y += mm(2);
  });
  f.y += h;
}

function field(c: Canvas, x: number, y: number, w: number, label: string) {
  c.text(x, y + mm(3.6), label, {
    size: 6.8,
    weight: 700,
    color: MUTED,
    upper: true,
    spacing: 0.1,
  });
  c.rule(x, y + mm(7), x + w, INK, 0.7);
}

function signoff(c: Canvas, f: Flow, o: PrintOrder, bulk: boolean) {
  const h = mm(25);
  f.fit(h + mm(3));
  f.y += mm(3);
  c.rule(L, f.y, R, GOLD, 1.4);
  c.text(L, f.y + mm(2), "Sign-off · initials and time for each step", LABEL);
  const steps = ["Prepared", "Packed", "Quality checked", "Ready"];
  const fr = [1, 1, 1.25, 1];
  const unit = (W - mm(12)) / fr.reduce((n, x) => n + x, 0);
  let x = L;
  const sy = f.y + mm(7);
  steps.forEach((s, i) => {
    const w = unit * fr[i]!;
    c.checkbox(x, sy);
    const lw = c.text(x + mm(6.8), sy + mm(0.5), s, { size: 9.6, weight: 700 });
    c.rule(x + mm(8.5) + lw, sy + mm(5), x + w, INK, 0.7);
    x += w + mm(4);
  });
  const fy = f.y + mm(14);
  if (bulk) {
    const labelStyle: Style = { size: 9.5, weight: 600 };
    const totalStyle: Style = { size: 9.5, weight: 700 };
    const total = `of ${o.units}`;
    const lw = c.width("Units counted", labelStyle);
    const cw = lw + mm(21) + c.width(total, totalStyle);
    const ux = R - cw;
    const fw = (W - cw - mm(16)) / 2;
    field(c, L, fy, fw, "Responsible");
    field(c, L + fw + mm(8), fy, fw, "Verified by");
    c.text(ux, fy + mm(3), "Units counted", labelStyle);
    c.rule(ux + lw + mm(1.5), fy + mm(7), ux + lw + mm(19.5), INK, 0.7);
    c.text(ux + lw + mm(21), fy + mm(3), total, totalStyle);
  } else {
    const fw = (W - mm(8)) / 2 - mm(8);
    field(c, L, fy, fw, "Responsible");
    field(c, L + fw + mm(8), fy, fw, "Verified by");
  }
  f.y += h;
}

function recipientRow(c: Canvas, f: Flow, o: PrintOrder) {
  const y = f.y + mm(2.2);
  c.text(L, y, "Prepare for", LABEL);
  const vs: Style = { size: 12.5, weight: 700, leading: 1.2 };
  f.y = y + mm(3.8);
  const name = o.recipient ?? "Name not recorded";
  const short = c.width(name, vs) < W * 0.45;
  if (!short) {
    f.paragraph(L, W, name, vs, true);
    f.y += mm(2);
    chips(c, L, f.y, chipList(o));
    f.y += mm(8);
    return;
  }
  c.text(L, f.y, name, vs, { dir: direction(name) });
  c.text(L, y, "Recount before sign-off", LABEL, { align: "right", width: W });
  chips(c, R, f.y, chipList(o), true);
  f.y = y + mm(10.5);
}

function bulkHero(c: Canvas, f: Flow, o: PrintOrder) {
  const top = f.y + mm(4);
  const boxW = mm(56);
  const leftW = W - boxW - mm(6);
  c.text(L, top, "Order for", LABEL);
  const ns: Style = { size: 24, weight: 800, leading: 1.08 };
  const nh = c.paragraph(
    L,
    top + mm(4),
    leftW,
    o.recipient ?? "Name not recorded",
    o.recipient ? ns : { ...ns, color: MUTED },
  );
  c.text(
    L,
    top + mm(5) + nh,
    `${o.method === "pickup" ? `Pickup at ${PICKUP_LOCATION.name}` : "Delivery"} · large-order layout`,
    { size: 10, weight: 600, color: MUTED },
  );
  const boxH = Math.max(mm(26), nh + mm(12));
  c.rect(R - boxW, top - mm(0.5), boxW, boxH, {
    stroke: INK,
    width: 2.6,
    radius: mm(2),
  });
  c.text(R - boxW, top + mm(3), "Ready by", LABEL, {
    align: "center",
    width: boxW,
  });
  const slot = "Not provided";
  const ss: Style = { size: 18, weight: 800, leading: 1.1, color: MUTED };
  c.text(R - boxW, top + mm(8), slot, ss, { align: "center", width: boxW });
  c.text(
    R - boxW,
    top + boxH - mm(6.5),
    "Not in order source",
    { size: 6.8, color: MUTED },
    { align: "center", width: boxW },
  );
  f.y = top + boxH + mm(3);
  c.rule(L, f.y, R, MUTED, 0.6);
}

function summary(c: Canvas, f: Flow, o: PrintOrder) {
  f.fit(mm(16));
  const y = f.y + mm(3);
  const lw = c.text(L, y + mm(0.6), "Items to prepare", {
    size: 9.5,
    weight: 700,
  });
  chips(c, L + lw + mm(3), y, chipList(o));
  c.text(
    L,
    y + mm(1.1),
    "Recount against this total before sign-off",
    { size: 7.4, color: MUTED },
    { align: "right", width: W },
  );
  f.y = y + mm(7);
}

function readyHint(o: PrintOrder) {
  return `No kitchen time in the order\nDue: ${slotLabel(o).toLowerCase()} ${o.slot ?? "not recorded"}`;
}

function production(
  c: Canvas,
  f: Flow,
  o: PrintOrder,
  kind: PrintKind,
  opt: Options,
) {
  const bulk = kind === "production-bulk";
  header(c, f, o, kind, opt);
  const date: Cell = {
    label: "Fulfilment date",
    value: o.day ? longDay(o.day) : "Not recorded",
  };
  const method: Cell = {
    label: "Method",
    value: o.method === "pickup" ? "Pickup" : "Delivery",
  };
  const slot: Cell = { label: slotLabel(o), value: o.slot ?? "Not recorded" };
  if (bulk) {
    bulkHero(c, f, o);
    metaStrip(c, f, o, [
      date,
      method,
      {
        label: slotLabel(o),
        value: o.slot ?? "Not recorded",
      },
    ]);
    notesBox(c, f, "Notes · read before starting", o.customerNotes);
    summary(c, f, o);
    itemsTable(c, f, o, true);
  } else {
    metaStrip(c, f, o, [
      date,
      { label: "Ready by", value: readyHint(o), ready: true },
      method,
      slot,
    ]);
    recipientRow(c, f, o);
    itemsTable(c, f, o, false);
    notesBox(c, f, "Special instructions", o.customerNotes);
  }
  signoff(c, f, o, bulk);
}

/** P3-only measured typography; approved production helpers above are unchanged. */
function deliveryHeader(
  c: Canvas,
  f: Flow,
  o: PrintOrder,
  opt: Options,
  t: DeliveryType,
) {
  const top = f.y;
  const bw = Math.min(
    mm(75),
    Math.max(
      mm(46),
      c.width(o.ref, { size: 19, weight: 800 }) + mm(8),
      opt.sample ? c.width("Synthetic sample", t.label) + mm(10) : 0,
    ),
  );
  const leftW = W - bw - mm(5);
  c.wordmark(L, top, mm(11));
  let y = top + mm(13.5);
  y += c.paragraph(L, y, leftW, "Delivery Note", {
    size: 20,
    weight: 700,
    leading: 1.1,
  });
  y += mm(1);
  y += c.paragraph(
    L,
    y,
    leftW,
    `Internal operations · ${subtitle(o, "delivery-note")}`,
    t.label,
  );
  const ref: Style = {
    size:
      c.width(o.ref, { size: 19, weight: 800 }) <= bw - mm(8)
        ? 19
        : t.body.size,
    weight: 800,
    leading: 1.15,
  };
  const rows = [
    { text: "Order", style: t.label },
    { text: o.ref, style: ref },
    ...(o.internalRef ? [{ text: o.internalRef, style: t.small }] : []),
    ...(opt.sample ? [{ text: "Synthetic sample", style: t.label }] : []),
  ];
  const bh = rows.reduce(
    (n, r) => n + c.paragraphHeight(r.text, r.style, bw - mm(8)) + mm(0.5),
    mm(5),
  );
  c.rect(R - bw, top, bw, bh, {
    stroke: INK,
    fill: BLUSH,
    width: 1,
    radius: mm(2.5),
  });
  let by = top + mm(2.5);
  for (const row of rows) {
    by +=
      c.paragraph(R - bw + mm(4), by, bw - mm(8), row.text, row.style) +
      mm(0.5);
  }
  f.y = Math.max(y, top + bh) + mm(2);
  const status = [`Status: ${o.status}`, `Payment: ${o.payment}`, o.completed]
    .filter(Boolean)
    .join(" · ");
  f.paragraph(L, W, status, t.small);
  f.y += mm(1);
  c.rule(L, f.y, R, GOLD, 1.4);
  if (o.hold) {
    const style: Style = {
      ...t.body,
      weight: 800,
      color: "#FFFFFF",
      upper: true,
    };
    const h = c.paragraphHeight(o.hold, style, W - mm(8)) + mm(4);
    f.fit(h + mm(3));
    f.y += mm(2);
    c.rect(L, f.y, W, h, { fill: INK, radius: mm(1.5) });
    c.paragraph(L + mm(4), f.y + mm(2), W - mm(8), o.hold, style);
    f.y += h;
  }
}

function deliveryMeta(c: Canvas, f: Flow, cells: Cell[], t: DeliveryType) {
  const widths = [mm(52), (W - mm(52)) / 3, (W - mm(52)) / 3, (W - mm(52)) / 3];
  const labelH = Math.max(
    ...cells.map((cell, i) =>
      c.paragraphHeight(cell.label, t.label, widths[i]! - mm(3)),
    ),
  );
  const valueH = Math.max(
    ...cells.map((cell, i) =>
      c.paragraphHeight(cell.value, t.value, widths[i]! - mm(3)),
    ),
  );
  f.fit(labelH + valueH + mm(6));
  f.y += mm(2);
  let x = L;
  cells.forEach((cell, i) => {
    c.paragraph(x, f.y, widths[i]! - mm(3), cell.label, t.label);
    c.paragraph(
      x,
      f.y + labelH + mm(1),
      widths[i]! - mm(3),
      cell.value,
      t.value,
    );
    x += widths[i]!;
  });
  f.y += labelH + valueH + mm(3);
  c.rule(L, f.y, R, MUTED, 0.6);
}

function deliveryTagged(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  tag: string,
  text: string,
  style: Style,
  t: DeliveryType,
  dry = false,
) {
  const ts: Style = { ...t.label, weight: 800, color: "#FFFFFF" };
  const tw = c.width(tag, ts) + mm(3);
  const th = c.lineHeight(ts) + mm(1);
  const h = Math.max(th, c.paragraphHeight(text, style, w - tw - mm(2)));
  if (!dry) {
    c.rect(x, y, tw, th, { fill: INK, radius: mm(0.8) });
    c.text(x + mm(1.5), y + mm(0.5), tag, ts);
    c.paragraph(x + tw + mm(2), y, w - tw - mm(2), text, style);
  }
  return h;
}

const deliveryRunning = (o: PrintOrder) => [
  `3L Pastelerías · Delivery Note · ${subtitle(o, "delivery-note")}`,
  `${o.ref} · ${o.day ? longDay(o.day) : "Date not recorded"} · ${slotLabel(o)} ${o.slot ?? "not recorded"}`,
];
function deliveryFrame(
  c: Canvas,
  orders: PrintOrder[],
  t: DeliveryType,
  generated: string,
  notice: string,
) {
  const headH = Math.max(
    ...orders.map((o) =>
      deliveryRunning(o).reduce(
        (n, text) => n + c.paragraphHeight(text, t.small, W),
        0,
      ),
    ),
    0,
  );
  const footH =
    c.paragraphHeight(generated, t.footer, W) +
    mm(1) +
    c.paragraphHeight(notice, t.footer, W - mm(36));
  const footerY = A4.height - mm(6) - footH;
  return {
    top: Math.max(TOP, mm(5) + headH + mm(4)),
    bottom: Math.min(BOTTOM, footerY - mm(4)),
    footerY,
  };
}

function deliveryNote(
  c: Canvas,
  f: Flow,
  o: PrintOrder,
  opt: Options,
  t: DeliveryType,
) {
  const { label: LABEL, heading: H3, body: BODY } = t;
  deliveryHeader(c, f, o, opt, t);
  deliveryMeta(
    c,
    f,
    [
      {
        label: "Fulfilment date",
        value: o.day ? longDay(o.day) : "Not recorded",
      },
      { label: "Method", value: o.method === "pickup" ? "Pickup" : "Delivery" },
      { label: slotLabel(o), value: o.slot ?? "Not recorded" },
      { label: "Packages", value: "____" },
    ],
    t,
  );
  // Destination: who and where on the left, instructions on the right.
  const destination =
    o.method === "pickup"
      ? [
          PICKUP_LOCATION.name,
          `Collected by: ${o.recipient ?? "Name not recorded"}`,
        ]
      : [
          o.recipient ?? "Name not recorded",
          o.phone ?? "Phone not recorded",
          ...(o.whatsapp ? [`WhatsApp: ${o.whatsapp}`] : []),
          ...(o.address?.lines.length
            ? o.address.lines
            : ["Address not recorded"]),
          o.address?.verified
            ? "Address verified in order record"
            : "Address NOT verified · confirm with the customer",
        ];
  const noteParts = [
    ...(o.method === "pickup"
      ? []
      : [{ title: "Delivery instructions", text: o.deliveryNotes }]),
    { title: "Customer notes", text: o.customerNotes },
  ];
  const top = f.y + mm(4);
  const leftW = W * 0.535 - mm(3.5);
  const boxX = L + leftW + mm(7);
  const boxW = R - boxX;
  // Use the identical styles, widths and spacing for measurement and drawing.
  // A BODY approximation misses the larger recipient and address line heights.
  const destinationBlock = (dry: boolean) => {
    const paragraph = (...args: Parameters<Canvas["paragraph"]>) =>
      dry ? c.paragraphHeight(args[3], args[4], args[2]) : c.paragraph(...args);
    let y = top;
    const pickup = o.method === "pickup";
    if (!dry) c.text(L, y, pickup ? "Pickup at" : "Deliver to", LABEL);
    y += c.lineHeight(LABEL) + mm(1);
    const ns = t.recipient;
    if (pickup) {
      y += paragraph(L, y, leftW, PICKUP_LOCATION.name, ns);
      y +=
        paragraph(
          L,
          y + mm(1),
          leftW,
          "Pickup order · no delivery address",
          t.body,
        ) + mm(1);
      y +=
        paragraph(
          L,
          y + mm(1),
          leftW,
          `Collected by: ${o.recipient ?? "Name not recorded"}`,
          t.body,
        ) + mm(1);
    } else {
      y += paragraph(
        L,
        y,
        leftW,
        o.recipient ?? "Name not recorded",
        o.recipient ? ns : ns,
      );
      const ps = t.phone;
      y +=
        paragraph(
          L,
          y + mm(0.6),
          leftW,
          o.phone ?? "Phone not recorded",
          o.phone ? ps : ps,
        ) + mm(0.6);
      if (o.whatsapp)
        y += paragraph(L, y, leftW, `WhatsApp: ${o.whatsapp}`, t.body);
      y += mm(2);
      const as = t.address;
      const lines = o.address?.lines.length
        ? o.address.lines
        : ["Address not recorded"];
      for (const line of lines)
        y += paragraph(L, y, leftW, line, o.address?.lines.length ? as : as);
      if (o.address?.lines.length)
        y +=
          paragraph(
            L,
            y + mm(1.6),
            leftW,
            o.address.verified
              ? "Address verified in order record"
              : "Address NOT verified · confirm with the customer",
            t.small,
          ) + mm(1.6);
    }
    const parts = pickup
      ? [{ title: "Customer notes", text: o.customerNotes }]
      : [
          { title: "Delivery instructions", text: o.deliveryNotes },
          { title: "Customer notes", text: o.customerNotes },
        ];
    let by = top - mm(1) + mm(3);
    for (const p of parts) {
      if (!dry) c.text(boxX + mm(4), by, p.title, H3);
      by += c.lineHeight(H3) + mm(1);
      by +=
        paragraph(
          boxX + mm(4),
          by,
          boxW - mm(8),
          p.text ?? NONE,
          p.text ? BODY : BODY,
          true,
        ) + mm(2);
    }
    const boxH = Math.max(by - top + mm(1), y - top + mm(1));
    return { y, boxH };
  };
  const measured = destinationBlock(true);
  if (top - mm(1) + measured.boxH + mm(30) > f.bottom) {
    f.y += mm(4);
    f.paragraph(L, W, o.method === "pickup" ? "Pickup at" : "Deliver to", H3);
    for (const line of destination) f.paragraph(L, W, line, BODY, true);
    for (const part of noteParts) {
      f.fit(mm(14));
      f.y += mm(3);
      f.paragraph(L, W, part.title, H3);
      f.paragraph(L, W, part.text ?? NONE, BODY, true);
    }
    deliveryPackages(c, f, t);
    contents(c, f, o, t);
    handover(c, f, o, t);
    return;
  }
  const { y, boxH } = destinationBlock(false);
  c.rect(boxX, top - mm(1), boxW, boxH, {
    stroke: MUTED,
    width: 0.8,
    radius: mm(2),
  });
  f.y = Math.max(y, top - mm(1) + boxH) + mm(4);
  c.rule(L, f.y, R, MUTED, 0.6);
  deliveryPackages(c, f, t);
  contents(c, f, o, t);
  handover(c, f, o, t);
}

/** Handwritten package count remains present even when destination text reflows. */
function deliveryPackages(c: Canvas, f: Flow, t: DeliveryType) {
  const H3 = t.heading;
  f.fit(mm(24));
  // Packages are counted at dispatch: the order stores no package list.
  f.y += mm(4);
  const pw = c.text(L, f.y, "Packages", H3);
  const hintH = c.paragraph(
    L + pw + mm(2),
    f.y,
    W - pw - mm(2),
    "not stored in the order · count and label at dispatch",
    t.small,
  );
  f.y += Math.max(c.lineHeight(H3), hintH) + mm(2);
  c.checkbox(L, f.y);
  const bw = c.text(L + mm(8), f.y + mm(0.4), "Bags / boxes:", {
    ...t.body,
    weight: 700,
  });
  c.rule(L + mm(10) + bw, f.y + mm(5), L + mm(10) + bw + mm(24), INK, 0.7);
  f.y += mm(8);
}

function contents(c: Canvas, f: Flow, o: PrintOrder, t: DeliveryType) {
  const { label: LABEL, heading: H3 } = t;
  f.fit(mm(20));
  f.y += mm(3);
  const hw = c.text(L, f.y, "Contents", H3);
  const hintH = c.paragraph(
    L + hw + mm(2),
    f.y,
    W - hw - mm(2),
    `${plural(o.units, "unit")} · no prices on this document`,
    t.small,
  );
  f.y += Math.max(c.lineHeight(H3), hintH) + mm(2);
  const head = () => {
    c.text(L, f.y, "Qty", LABEL);
    c.text(L + mm(17), f.y, "Item", LABEL);
    f.y += c.lineHeight(LABEL) + mm(1);
    c.rule(L, f.y, R, INK, 1);
  };
  head();
  if (!o.groups) {
    f.y += mm(2);
    f.y += c.paragraph(
      L,
      f.y,
      W,
      o.itemsWarning ??
        "Items unavailable: the stored order snapshot is missing or inconsistent. Review the order before preparing.",
      t.item,
    );
    return;
  }
  f.continuation = head;
  const ps = t.item;
  const vs = t.detail;
  const iw = W - mm(17);
  for (const l of o.groups.flatMap((g) => g.lines)) {
    const detail = [
      l.variant,
      ...(l.pack
        ? [
            `Each box · ${l.pack.capacity} pieces · ${l.quantity} boxes = ${l.quantity * l.pack.capacity} pieces`,
            ...l.pack.components.map((comp) => `${comp.units} × ${comp.name}`),
          ]
        : []),
      l.preparation,
    ]
      .filter(Boolean)
      .join("\n");
    const fullH = c.paragraphHeight(
      `${l.quantity} × ${l.product}\n${detail}`,
      ps,
      iw,
    );
    if (fullH > f.bottom - f.top - mm(20)) {
      f.paragraph(L, W, `${l.quantity} × ${l.product}`, ps);
      f.paragraph(L + mm(17), iw, detail, vs);
      if (l.reviewRequired)
        f.paragraph(L + mm(17), iw, `${TRANSLATION_REVIEW} (${l.sku})`, vs);
      f.y += mm(3);
      c.rule(L, f.y, R, MUTED, 0.5);
      continue;
    }
    const h =
      c.paragraphHeight(l.product, ps, iw) +
      (detail ? c.paragraphHeight(detail, vs, iw) : 0) +
      (l.reviewRequired
        ? deliveryTagged(
            c,
            0,
            0,
            iw,
            "! Review",
            `${TRANSLATION_REVIEW} (${l.sku})`,
            vs,
            t,
            true,
          ) + mm(0.6)
        : 0) +
      mm(3);
    f.fit(h);
    const y = f.y + mm(1.5);
    const qw = c.text(L, y, String(l.quantity), t.quantity);
    c.text(L + qw + mm(0.6), y + mm(0.6), "×", t.small);
    let ty = y + c.paragraph(L + mm(17), y, iw, l.product, ps);
    if (detail) ty += c.paragraph(L + mm(17), ty, iw, detail, vs);
    if (l.reviewRequired)
      deliveryTagged(
        c,
        L + mm(17),
        ty + mm(0.6),
        iw,
        "! Review",
        `${TRANSLATION_REVIEW} (${l.sku})`,
        vs,
        t,
      );
    f.y += h;
    c.rule(L, f.y, R, MUTED, 0.5);
  }
  f.continuation = undefined;
}

function handover(c: Canvas, f: Flow, o: PrintOrder, t: DeliveryType) {
  const column = (W - mm(6)) / 2;
  const checkText = ["All packages handed over", "Sealed and undamaged"];
  const checksH = Math.max(
    mm(5.2),
    ...checkText.map((text) =>
      c.paragraphHeight(text, t.body, column - mm(7.5)),
    ),
  );
  const labels = [
    "Handed over by",
    o.method === "pickup"
      ? "Collected by (print name)"
      : "Received by (print name)",
    "Signature",
    "Time",
  ];
  const fr = [1, 1.2, 1.2, 0.6];
  const unit = (W - mm(24)) / fr.reduce((n, x) => n + x, 0);
  const fieldsH = Math.max(
    ...labels.map((text, i) => c.paragraphHeight(text, t.label, unit * fr[i]!)),
  );
  const headingH = c.lineHeight(t.heading);
  const h = mm(3) + headingH + mm(3) + checksH + mm(4) + fieldsH + mm(5);
  f.fit(h);
  f.y += mm(3);
  c.rule(L, f.y, R, GOLD, 1.4);
  f.y += mm(2);
  c.text(L, f.y, "Handover confirmation", t.heading);
  f.y += headingH + mm(2);
  checkText.forEach((text, i) => {
    const x = L + i * (column + mm(6));
    c.checkbox(x, f.y);
    c.paragraph(x + mm(7.5), f.y, column - mm(7.5), text, t.body);
  });
  f.y += checksH + mm(4);
  let x = L;
  labels.forEach((label, i) => {
    const w = unit * fr[i]!;
    c.paragraph(x, f.y, w, label, t.label);
    c.rule(x, f.y + fieldsH + mm(2), x + w, INK, 0.7);
    x += w + mm(8);
  });
  f.y += fieldsH + mm(4);
}

// ---------------------------------------------------------------- render
export function renderDocuments(
  orders: PrintOrder[],
  kind: PrintKind,
  opt: Options & { title: string; label: string; layout?: PrintLayout },
) {
  const c = new Canvas(
    opt.title,
    opt.at,
    kind === "delivery-note" ? opt.layout : "a4",
  );
  // Which order (and which of its pages) each physical page belongs to.
  const pages: { order: number }[] = [];
  let current = 0;
  const generated = `Generated ${dubaiDateTime(opt.at)} Dubai by ${opt.actor} · ${PRINT_LAYOUT_VERSION}${opt.layout && opt.layout !== "a4" ? ` · ${opt.layout} candidate` : ""}`;
  const notice = opt.sample
    ? "SYNTHETIC · NOT A REAL ORDER"
    : "Not an invoice, tax invoice or receipt";
  const type = kind === "delivery-note" ? deliveryType(opt.layout) : undefined;
  const frame = type
    ? deliveryFrame(c, orders, type, generated, notice)
    : undefined;
  const flow = new Flow(
    c,
    () => pages.push({ order: current }),
    frame?.top,
    frame?.bottom,
  );
  const markers: number[] = [];
  orders.forEach((o, i) => {
    current = i;
    const before = c.markers;
    flow.page();
    if (kind === "delivery-note") deliveryNote(c, flow, o, opt, type!);
    else production(c, flow, o, kind, opt);
    if (c.markers > before) {
      const ms: Style = type
        ? { ...type.small, weight: 700 }
        : { size: 8, weight: 700, leading: 1.3 };
      flow.fit(mm(10));
      flow.y += mm(3);
      flow.y += c.paragraph(
        L,
        flow.y,
        W,
        "Some text is in a script this PDF cannot print yet; it is marked above. The exact text is on the order page.",
        ms,
      );
    }
    markers.push(c.markers - before);
  });
  // Running header and footer on every page, numbered per order.
  const small: Style = { size: 7, weight: 500, color: "#333333" };
  pages.forEach((p, index) => {
    c.switchToPage(index);
    const of = pages.filter((x) => x.order === p.order);
    const n = of.indexOf(p) + 1;
    const o = orders[p.order]!;
    if (type && frame) {
      let hy = mm(5);
      for (const text of deliveryRunning(o))
        hy += c.paragraph(L, hy, W, text, type.small);
      let fy = frame.footerY;
      fy += c.paragraph(L, fy, W, generated, type.footer) + mm(1);
      c.paragraph(L, fy, W - mm(36), notice, { ...type.footer, weight: 700 });
      c.text(L, fy, `Page ${n} of ${of.length}`, type.footer, {
        align: "right",
        width: W,
      });
      return;
    }
    const slot = `${slotLabel(o)} ${o.slot ?? "not recorded"}`;
    c.text(
      L,
      mm(7),
      `3L Pastelerías · ${TITLES[kind]} · ${subtitle(o, kind)}`,
      { ...small, weight: 600 },
    );
    c.text(
      L,
      mm(7),
      `${o.ref} · ${o.day ? longDay(o.day) : "Date not recorded"} · ${slot}`,
      { ...small, weight: 600 },
      { align: "right", width: W },
    );
    const fy = A4.height - mm(9);
    const page = `Page ${n} of ${of.length}`;
    c.text(L, fy - mm(3.5), generated, { ...small, size: 6.5 });
    const left = 0;
    const strong: Style = { ...small, weight: 700 };
    const room = R - c.width(page, small) - mm(4) - (L + left + mm(4));
    c.text(L + left + mm(4), fy, notice, strong, {
      align: "center",
      width: room,
    });
    c.text(L, fy, page, small, { align: "right", width: W });
  });
  const count = c.pageCount;
  return {
    pdf: c.finish(),
    trace: c.trace,
    pages: count,
    logicalPages: pages.length,
    markers,
  };
}

export function documentsFor(state: State, orders: Order[]) {
  const names = approvedOperationsNames(state);
  return orders.map((o) => printOrder(state, o, names));
}
