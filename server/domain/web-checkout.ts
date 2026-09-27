/** Public entry into the existing catalog/quote/command/outbox/payment domain. */
import { z } from "zod";
import type { CommerceService } from "./service";
import {
  requireThat,
  type Actor,
  type DeliveryDetails,
  type Order,
} from "./model";
import { quoteOrder } from "./zones";
import { createHash, randomUUID } from "node:crypto";
export const WEB_ACTOR: Actor = { id: "web-checkout", role: "operator" };
export const WEB_SOURCE = "web";

/**
 * UAE mobile numbers in any common written form (0501234567, 501234567,
 * +971 50 123 4567, 00971501234567) normalised to E.164 (+971501234567).
 */
export function normalizeUaeMobile(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, "");
  const m = /^(?:\+971|00971|971|0)?(5\d{8})$/.exec(digits);
  return m ? `+971${m[1]}` : null;
}
const uaeMobile = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeUaeMobile(v);
    if (!n) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid UAE mobile number",
      });
      return z.NEVER;
    }
    return n;
  });

/** Today's date in Dubai as YYYY-MM-DD; delivery dates are local to Dubai. */
export function dubaiToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** How far ahead a customer may book. A booking window, not a lead time. */
export const MAX_BOOKING_DAYS = 60;

/**
 * Delivery slots come from configuration only. None is confirmed yet, so the
 * list is empty by default and the customer states a preferred time window
 * instead — slot labels are never invented here.
 */
export function configuredSlots(env = process.env): string[] {
  try {
    return z
      .array(z.string().trim().min(1).max(60))
      .max(24)
      .parse(JSON.parse(env.DELIVERY_SLOTS_JSON ?? "[]"));
  } catch {
    return [];
  }
}

const line = z
  .object({
    productId: z.string().min(1).max(100),
    quantity: z.number().int().min(1).max(20),
  })
  .strict();
const lines = z
  .array(line)
  .min(1)
  .max(20)
  .refine(
    (ls) => new Set(ls.map((l) => l.productId)).size === ls.length,
    "Each product may appear once",
  );

/** Legacy single-product quote shape, kept for existing clients. */
export const webQuoteSchema = z
  .object({
    productId: z.string().min(1).max(100),
    quantity: z.number().int().min(1).max(20),
    zoneId: z.string().min(1).max(100),
  })
  .strict();
export const cartQuoteSchema = z
  .object({ lines, zoneId: z.string().min(1).max(100) })
  .strict();

/** Legacy single-product checkout shape, kept for existing clients. */
export const webCheckoutSchema = webQuoteSchema
  .extend({
    customer: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{7,16}$/),
    address: z.string().trim().min(5).max(500),
  })
  .strict();

/**
 * Full website checkout. Amount, price, fee, currency and status are absent by
 * design: `.strict()` rejects them, and the server prices every line from the
 * approved catalog and the chosen zone.
 */
export const cartCheckoutSchema = z
  .object({
    lines,
    delivery: z
      .object({
        zoneId: z.string().min(1).max(100),
        address: z.string().trim().min(5).max(300),
        building: z.string().trim().min(1).max(120),
        unit: z.string().trim().max(40).optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        slot: z.string().trim().min(1).max(60),
        notes: z.string().trim().max(500).optional(),
      })
      .strict(),
    customer: z
      .object({
        name: z.string().trim().min(2).max(100),
        phone: uaeMobile,
        // Required: Paymennt's token payment needs it for the receipt.
        email: z.email().max(254),
        instructions: z.string().trim().max(500).optional(),
      })
      .strict(),
  })
  .strict();
export type CartCheckoutInput = z.infer<typeof cartCheckoutSchema>;

type Normalized = {
  lines: { productId: string; quantity: number }[];
  zoneId: string;
  name: string;
  phone: string;
  address: string;
  delivery?: DeliveryDetails;
  details?: Order["customerDetails"];
};
export function normalizeCheckout(raw: unknown, env = process.env): Normalized {
  const cart = cartCheckoutSchema.safeParse(raw);
  if (cart.success) {
    const { delivery, customer } = cart.data;
    const today = dubaiToday();
    requireThat(
      delivery.date >= today &&
        delivery.date <= addDays(today, MAX_BOOKING_DAYS),
      "Choose a delivery date from today onwards",
      422,
    );
    const slots = configuredSlots(env);
    requireThat(
      !slots.length || slots.includes(delivery.slot),
      "Choose one of the available delivery times",
      422,
    );
    const fullAddress = [
      delivery.unit && `Unit ${delivery.unit}`,
      delivery.building,
      delivery.address,
    ]
      .filter(Boolean)
      .join(", ");
    return {
      lines: cart.data.lines,
      zoneId: delivery.zoneId,
      name: customer.name,
      phone: customer.phone,
      address: fullAddress,
      delivery: { ...delivery },
      details: { email: customer.email, instructions: customer.instructions },
    };
  }
  // Fall back to the legacy shape only when the body is not attempting the
  // cart shape, so cart validation errors are reported as such.
  if (raw && typeof raw === "object" && "lines" in raw) throw cart.error;
  const legacy = webCheckoutSchema.parse(raw);
  return {
    lines: [{ productId: legacy.productId, quantity: legacy.quantity }],
    zoneId: legacy.zoneId,
    name: legacy.customer,
    phone: legacy.phone,
    address: legacy.address,
  };
}

const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const keySchema = z.uuid();

/** Server-side quote for a cart. The browser never supplies a price. */
export function quoteWebCheckout(service: CommerceService, raw: unknown) {
  const cart = cartQuoteSchema.safeParse(raw);
  const input = cart.success
    ? cart.data
    : (() => {
        if (raw && typeof raw === "object" && "lines" in raw) throw cart.error;
        const legacy = webQuoteSchema.parse(raw);
        return {
          lines: [{ productId: legacy.productId, quantity: legacy.quantity }],
          zoneId: legacy.zoneId,
        };
      })();
  const s = service.store.read();
  const zone = s.zones.find((z) => z.id === input.zoneId && z.active);
  requireThat(zone, "Delivery zone is not supported", 400);
  return quoteOrder(
    s.zones,
    input.lines,
    undefined,
    undefined,
    service.geo,
    zone.id,
    s.catalog ?? [],
  );
}

export type WebCheckoutSummary = {
  items: {
    productId: string;
    name: string;
    quantity: number;
    lineFils: number;
  }[];
  subtotalFils: number;
  feeFils: number;
  delivery?: DeliveryDetails & { zoneName?: string };
  customerName?: string;
};
export type WebCheckoutResult = {
  orderId: string;
  status: Order["state"];
  paymentStatus: string;
  amountFils: number;
  currency: string;
  url: string | null;
  actionRequired: "review_payment" | "complete_payment" | null;
  /** The customer's own order, returned only to the capability holder. */
  summary?: WebCheckoutSummary;
};

/** The unguessable UUID capability is kept in the browser session, never a phone-based lookup. */
export function readWebCheckoutStatus(
  service: CommerceService,
  key: string,
): WebCheckoutResult {
  const s = service.store.read(),
    record = s.webCheckouts?.[digest(keySchema.parse(key))];
  const order = s.orders.find((o) => o.id === record?.orderId);
  const payment = s.payments.find((p) => p.id === order?.paymentId);
  requireThat(order && payment, "Checkout not found", 404);
  const catalog = order.catalogSnapshot ?? s.catalog ?? [];
  const zone = s.zones.find(
    (z) => z.id === (order.delivery?.zoneId ?? order.manualZoneId),
  );
  return {
    orderId: order.id,
    status: order.state,
    paymentStatus: payment.status,
    amountFils: payment.amountFils,
    currency: payment.currency,
    actionRequired:
      payment.directAttempt === "unknown" ||
      (payment.directAttempt === "submitted" &&
        Date.now() - Date.parse(payment.updatedAt) > 30000)
        ? "review_payment"
        : payment.directAttempt === "ready"
          ? "complete_payment"
          : null,
    url: payment.status === "pending" ? (payment.url ?? null) : null,
    summary: {
      items: order.lines.map((l) => {
        const p = catalog.find((c) => c.id === l.productId);
        return {
          productId: l.productId,
          name: p?.name ?? l.productId,
          quantity: l.quantity,
          lineFils: (p?.priceFils ?? 0) * l.quantity,
        };
      }),
      subtotalFils: order.quote?.subtotalFils ?? 0,
      feeFils: order.quote?.feeFils ?? 0,
      delivery: order.delivery
        ? { ...order.delivery, zoneName: zone?.name }
        : undefined,
      customerName: s.conversations.find((c) => c.id === order.conversationId)
        ?.customer,
    },
  };
}

/** Reservation, all domain commands and outbox entry commit together before any network request. */
export async function createWebCheckout(
  service: CommerceService,
  raw: unknown,
  key: string,
  embedded = false,
): Promise<WebCheckoutResult> {
  const input = normalizeCheckout(raw),
    receiptKey = digest(keySchema.parse(key));
  const inputHash = digest(JSON.stringify(input));
  service.store.transaction(() => {
    const previous = service.store.read().webCheckouts?.[receiptKey];
    if (previous) {
      requireThat(
        previous.inputHash === inputHash,
        "Checkout key already used with different details",
        409,
      );
      return;
    }
    const quote = quoteWebCheckout(service, {
      lines: input.lines,
      zoneId: input.zoneId,
    });
    requireThat(quote.eligible, quote.reason, 422);
    // A checkout owns its own conversation: knowing a phone cannot seize an
    // existing order. It is not unread — an unpaid website order is not
    // actionable for the team until ORDER_PAID.
    const conversationId = randomUUID();
    service.store.write((s) =>
      s.conversations.push({
        id: conversationId,
        customer: input.name,
        phone: input.phone,
        sourceNumberId: WEB_SOURCE,
        sourcePhoneNumber: WEB_SOURCE,
        assignedAgent: WEB_ACTOR.id,
        status: "open",
        unread: false,
        version: 0,
        messages: [],
        address: input.address,
        audit: [],
      }),
    );
    type Step = { id: string; version: number };
    const command = (
      type: string,
      current: Step,
      extra: Record<string, unknown> = {},
    ) =>
      service.command(
        { type, ...current, ...extra },
        `${key}-${type}`,
        WEB_ACTOR,
      ) as Step;
    let order = command("createOrder", { id: conversationId, version: 0 });
    order = command("editOrder", order, { lines: input.lines });
    order = command("manualZone", order, {
      zoneId: input.zoneId,
      reason:
        "Customer selected delivery zone; address retained for fulfillment",
    });
    if (input.delivery)
      service.store.write((s) => {
        const o = s.orders.find((o) => o.id === order.id)!;
        o.address = input.address;
        o.delivery = input.delivery;
        o.customerDetails = input.details;
      });
    order = command("requestPayment", order);
    if (embedded)
      service.store.write((s) => {
        const payment = s.payments.find((p) => p.orderId === order.id)!;
        payment.directAttempt = "ready";
        // Reuse the existing payment record; no hosted-link job can race token submission.
        s.jobs = s.jobs.filter(
          (j) => !(j.kind === "payment" && j.entityId === payment.id),
        );
      });
    service.store.write((s) => {
      s.webCheckouts ??= {};
      s.webCheckouts[receiptKey] = {
        inputHash,
        orderId: order.id,
        createdAt: new Date().toISOString(),
      };
    });
  });
  // Concurrent calls share the same durable payment job; unknown sends are not retried blindly.
  if (!embedded) await service.drain();
  return readWebCheckoutStatus(service, key);
}
