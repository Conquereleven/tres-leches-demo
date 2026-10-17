import {
  liveLinePrice,
  packPricingPolicy,
  acceptedPackPricesCurrent,
} from "./pack-pricing";
import {
  commerceLineSchema,
  distinctLines,
  lineKey,
} from "../../shared/pack-composition";
import {
  validatePackLines,
  packBuilderEnabled,
  publishedPackRules,
} from "./packs";
import { deliveryStreet, deliveryBuilding } from "./delivery-address-input";
import { frozenCheckout } from "./frozen-checkout";
import {
  availableSku,
  RETIRED_SKUS,
  MAX_ITEM_QUANTITY,
  validWindow,
  leadHours,
  DELIVERY_WINDOWS,
} from "../../shared/commerce-policy";
import products from "../../shared/storefront-products.json";
import { formatOrderNumber } from "../../shared/order-number";
import { normalizeWhatsAppNumber } from "../../shared/contact";
import { authoritativeAddress } from "./website-address";
/** Public entry into the existing catalog/quote/command/outbox/payment domain. */
import { z } from "zod";
import {
  billingInputSchema,
  toPaymenntBillingAddress,
  type OrderBilling,
} from "./billing";
import type { CommerceService } from "./service";
import {
  requireThat,
  type Actor,
  type DeliveryDetails,
  type Order,
} from "./model";
import { quoteOrder } from "./zones";
import { transition } from "./workflow";
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
export function configuredSlots(_env = process.env): string[] {
  return DELIVERY_WINDOWS.map((w) => w.label);
}

const lines = z
  .array(commerceLineSchema)
  .min(1)
  .max(20)
  .refine(distinctLines, "Duplicate composition or maximum quantity exceeded");

/** Legacy single-product quote shape, kept for existing clients. */
export const webQuoteSchema = z
  .object({
    productId: z.string().min(1).max(100),
    quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY),
    zoneId: z.string().min(1).max(100),
  })
  .strict();
export const cartQuoteSchema = z
  .object({
    lines,
    zoneId: z.string().min(1).max(100).optional(),
    fulfillmentMethod: z.enum(["delivery", "pickup"]).optional(),
  })
  .refine(
    (v) => (v.fulfillmentMethod === "pickup" ? !v.zoneId : !!v.zoneId),
    "Choose a delivery zone or pickup",
  )
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
    fulfillmentMethod: z.literal("delivery").optional(),
    delivery: z
      .object({
        zoneId: z.string().min(1).max(100),
        address: deliveryStreet,
        building: deliveryBuilding,
        addressRef: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        unit: z.string().trim().max(40).optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        slot: z.string().trim().min(1).max(60),
        notes: z.string().trim().max(500).optional(),
      })
      .strict(),
    customer: z
      .object({
        // Website checkout sends first and last name separately. The single
        // `name` remains accepted for clients built before that.
        name: z.string().trim().min(2).max(100).optional(),
        firstName: z.string().trim().min(1).max(60).optional(),
        lastName: z.string().trim().min(1).max(60).optional(),
        phone: uaeMobile,
        whatsappNumber: z
          .string()
          .max(40)
          .transform((v, ctx) => {
            const normalized = normalizeWhatsAppNumber(v);
            if (!normalized)
              ctx.addIssue({
                code: "custom",
                message:
                  "Use an international WhatsApp number including + country code",
              });
            return normalized ?? z.NEVER;
          })
          .optional(),
        // Required: Paymennt's token payment needs it for the receipt.
        email: z.email().max(254),
        instructions: z.string().trim().max(500).optional(),
      })
      .strict()
      .refine(
        (c) =>
          (c.firstName && c.lastName) ||
          (!c.firstName && !c.lastName && c.name),
        "Enter your first and last name",
      ),
    billing: billingInputSchema,
  })
  .strict();
const pickupCheckoutSchema = cartCheckoutSchema
  .omit({ delivery: true })
  .extend({
    fulfillmentMethod: z.literal("pickup"),
    pickup: z
      .object({
        pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        preferredTime: z.string().trim().min(1).max(60),
      })
      .strict(),
  })
  .strict();
export type CartCheckoutInput = z.infer<typeof cartCheckoutSchema>;

type Normalized = {
  lines: Order["lines"];
  zoneId?: string;
  fulfillmentMethod?: "delivery" | "pickup";
  pickup?: Order["pickup"];
  name: string;
  phone: string;
  address: string;
  delivery?: DeliveryDetails;
  details?: Order["customerDetails"];
  billing?: OrderBilling;
};
/** Kept apart in storage; joined only for display and the provider's address name. */
const identity = (c: {
  name?: string;
  firstName?: string;
  lastName?: string;
}) =>
  c.firstName && c.lastName
    ? {
        name: `${c.firstName} ${c.lastName}`,
        names: { firstName: c.firstName, lastName: c.lastName },
      }
    : { name: c.name!, names: {} };
export function normalizeCheckout(raw: unknown, env = process.env): Normalized {
  const pickup = pickupCheckoutSchema.safeParse(raw);
  if (pickup.success) {
    const data = pickup.data;
    const today = dubaiToday();
    requireThat(
      data.pickup.pickupDate > today &&
        data.pickup.pickupDate <= addDays(today, MAX_BOOKING_DAYS) &&
        new Date(`${data.pickup.pickupDate}T00:00:00Z`)
          .toISOString()
          .slice(0, 10) === data.pickup.pickupDate,
      "Choose a valid pickup date from tomorrow onwards",
      422,
    );
    const slots = configuredSlots(env);
    requireThat(
      slots.includes(data.pickup.preferredTime) &&
        validWindow(
          data.pickup.pickupDate,
          data.pickup.preferredTime,
          new Date(),
          leadHours(data.lines.map((l) => l.productId)),
        ),
      "Choose a pickup date and time that respect the 9 PM Dubai cutoff and advance notice",
      422,
    );
    requireThat(
      !data.billing.sameAsDelivery,
      "Pickup requires a separate billing address",
      422,
    );
    const who = identity(data.customer);
    return {
      lines: data.lines,
      fulfillmentMethod: "pickup",
      pickup: data.pickup,
      name: who.name,
      phone: data.customer.phone,
      address: "",
      details: {
        ...who.names,
        email: data.customer.email,
        ...(data.customer.whatsappNumber
          ? { whatsappNumber: data.customer.whatsappNumber }
          : {}),
        instructions: data.customer.instructions,
      },
      billing: toPaymenntBillingAddress({
        billing: data.billing,
        name: who.name,
        delivery: undefined,
      }),
    };
  }
  if (
    raw &&
    typeof raw === "object" &&
    "fulfillmentMethod" in raw &&
    raw.fulfillmentMethod === "pickup"
  )
    throw pickup.error;
  const cart = cartCheckoutSchema.safeParse(raw);
  if (cart.success) {
    const { delivery, customer } = cart.data;
    const today = dubaiToday();
    requireThat(
      delivery.date > today &&
        delivery.date <= addDays(today, MAX_BOOKING_DAYS),
      "Choose a delivery date from tomorrow onwards",
      422,
    );
    const slots = configuredSlots(env);
    requireThat(
      slots.includes(delivery.slot) &&
        validWindow(
          delivery.date,
          delivery.slot,
          new Date(),
          leadHours(cart.data.lines.map((l) => l.productId)),
        ),
      "Choose a delivery date and time that respect the 9 PM Dubai cutoff and advance notice",
      422,
    );
    const fullAddress = [
      delivery.unit && `Unit ${delivery.unit}`,
      delivery.building,
      delivery.address,
    ]
      .filter(Boolean)
      .join(", ");
    const who = identity(customer);
    return {
      lines: cart.data.lines,
      ...(cart.data.fulfillmentMethod
        ? { fulfillmentMethod: cart.data.fulfillmentMethod }
        : {}),
      zoneId: delivery.zoneId,
      name: who.name,
      phone: customer.phone,
      address: fullAddress,
      delivery: { ...delivery },
      details: {
        ...who.names,
        email: customer.email,
        instructions: customer.instructions,
        ...(customer.whatsappNumber
          ? { whatsappNumber: customer.whatsappNumber }
          : {}),
      },
      // Resolved and validated now, so an order can never exist with a billing
      // address Paymennt would reject.
      billing: toPaymenntBillingAddress({
        billing: cart.data.billing,
        name: who.name,
        delivery,
      }),
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

/** SKU ids encode the approved size/flavour; prices are always read from the catalog. */
export function canonicalCartHash(
  service: CommerceService,
  raw: unknown,
  fulfillment?: unknown,
) {
  const cart = cartQuoteSchema.parse(raw);
  const quote = quoteWebCheckout(service, cart);
  requireThat(quote.eligible, quote.reason, 422);
  const catalog = service.store.read().catalog ?? [];
  const priced = cart.lines
    .map((line) => {
      const product = catalog.find((p) => p.id === line.productId);
      requireThat(product?.active, "Product unavailable", 422);
      return {
        sku: line.productId,
        ...(line.color ? { color: line.color } : {}),
        ...(line.composition ? { composition: line.composition } : {}),
        quantity: line.quantity,
        unitPriceFils: liveLinePrice(line, catalog),
      };
    })
    .sort((a, b) =>
      lineKey({
        productId: a.sku,
        color: a.color,
        composition: "composition" in a ? a.composition : undefined,
      }).localeCompare(
        lineKey({
          productId: b.sku,
          color: b.color,
          composition: "composition" in b ? b.composition : undefined,
        }),
      ),
    );
  return digest(
    JSON.stringify({
      lines: priced,
      fulfillment: fulfillment ?? null,
      fulfillmentMethod: cart.fulfillmentMethod ?? "delivery",
      zoneId: cart.zoneId ?? null,
      subtotalFils: quote.subtotalFils,
      feeFils: quote.feeFils,
      totalFils: quote.totalFils,
    }),
  );
}

/** Validate before resuming, atomically retiring only the local payable association. */
export function resumeWebCheckout(service: CommerceService, raw: unknown) {
  const { key, checkout } = z
    .object({ key: z.uuid(), checkout: z.unknown() })
    .strict()
    .parse(raw);
  return service.store.transaction(() => {
    const input = normalizeCheckout(checkout);
    if (input.delivery) {
      const zone = authoritativeAddress(service, input.delivery);
      input.zoneId = zone.id;
      input.delivery.zoneId = zone.id;
      input.delivery.addressVerification =
        service.deliveryAddressMode === "legacy" ? "UNVERIFIED" : "VERIFIED";
    }
    const snapshot = service.store.read();
    const record = snapshot.webCheckouts?.[digest(key)];
    const order = snapshot.orders.find((o) => o.id === record?.orderId);
    const payment = snapshot.payments.find((p) => p.id === order?.paymentId);
    if (record) {
      requireThat(order && payment, "Checkout not found", 409);
      const frozen = frozenCheckout(order, payment);
      if (payment.status !== "paid") validatePackLines(snapshot, input.lines);
      // Recover a missing pre-release hash only from validated frozen records.
      if (!record.cartHash) {
        record.cartHash = digest(
          JSON.stringify({
            lines: frozen.items
              .map((i) => ({
                sku: i.sku,
                ...(i.color ? { color: i.color } : {}),
                ...(i.composition ? { composition: i.composition } : {}),
                quantity: i.quantity,
                unitPriceFils: i.unitPriceFils,
              }))
              .sort((a, b) =>
                lineKey({
                  productId: a.sku,
                  color: a.color,
                  composition: "composition" in a ? a.composition : undefined,
                }).localeCompare(
                  lineKey({
                    productId: b.sku,
                    color: b.color,
                    composition: "composition" in b ? b.composition : undefined,
                  }),
                ),
              ),
            fulfillment: {
              delivery: order.delivery ?? null,
              pickup: order.pickup ?? null,
            },
            fulfillmentMethod: order.fulfillmentMethod ?? "delivery",
            zoneId:
              order.fulfillmentMethod === "pickup"
                ? null
                : (order.manualZoneId ?? order.delivery?.zoneId ?? null),
            subtotalFils: frozen.subtotalFils,
            feeFils: frozen.feeFils,
            totalFils: frozen.totalFils,
          }),
        );
        service.store.write((s) => {
          s.webCheckouts![digest(key)]!.cartHash = record.cartHash;
        });
      }
      const intent = (
        lines: Order["lines"],
        method: string | undefined,
        zoneId: string | undefined,
        delivery: unknown,
        pickup: unknown,
      ) =>
        JSON.stringify({
          lines: lines
            .map(
              ({ packSnapshot: _snapshot, priceSnapshot: _price, ...l }) => l,
            )
            .sort((a, b) => lineKey(a).localeCompare(lineKey(b))),
          method: method ?? "delivery",
          zoneId: zoneId ?? null,
          delivery: delivery ?? null,
          pickup: pickup ?? null,
        });
      const same =
        intent(
          input.lines,
          input.fulfillmentMethod,
          input.zoneId,
          input.delivery,
          input.pickup,
        ) ===
        intent(
          order.lines,
          order.fulfillmentMethod,
          order.manualZoneId ?? order.delivery?.zoneId,
          order.delivery,
          order.pickup,
        );
      if (
        !record.supersededAt &&
        same &&
        !["failed", "cancelled", "expired"].includes(payment.status)
      )
        return {
          key,
          cartHash: record.cartHash,
          changed: false,
          status: readWebCheckoutStatus(service, key),
        };
    }
    const cartHash = canonicalCartHash(
      service,
      {
        lines: input.lines,
        ...(input.fulfillmentMethod === "pickup"
          ? { fulfillmentMethod: "pickup" }
          : { zoneId: input.zoneId }),
      },
      { delivery: input.delivery ?? null, pickup: input.pickup ?? null },
    );
    if (!record) return { key: randomUUID(), cartHash, changed: false };
    requireThat(order && payment, "Checkout not found", 409);
    requireThat(
      record.cartHash || payment.status !== "paid",
      "The previous paid order must be reviewed before updating checkout.",
      409,
    );
    requireThat(
      !["authorized", "pending_confirmation"].includes(payment.status) &&
        payment.directAttempt !== "unknown" &&
        payment.directAttempt !== "submitted" &&
        !snapshot.jobs.some(
          (j) =>
            j.kind === "payment" &&
            j.entityId === payment.id &&
            ["processing", "unknown"].includes(j.status),
        ),
      "The previous payment must be verified before updating checkout.",
      409,
    );
    let nextKey = record.replacements?.[cartHash];
    service.store.write((s) => {
      const previous = s.webCheckouts![digest(key)]!;
      previous.replacements ??= {};
      nextKey ??= randomUUID();
      previous.replacements[cartHash] = nextKey!;
      if (payment.status !== "paid" && !previous.supersededAt) {
        const at = new Date().toISOString();
        previous.supersededAt = at;
        const p = s.payments.find((p) => p.id === payment.id)!;
        p.supersededAt = at;
        p.timeline.push({
          at,
          actor: WEB_ACTOR.id,
          action:
            "Checkout superseded after cart change; financial status preserved",
        });
        s.orders
          .find((o) => o.id === order.id)!
          .audit.push({
            at,
            actor: WEB_ACTOR.id,
            action: "Website checkout superseded after cart change",
          });
        s.jobs = s.jobs.filter(
          (j) =>
            !(
              j.kind === "payment" &&
              j.entityId === payment.id &&
              j.status === "pending"
            ),
        );
      }
    });
    return { key: nextKey!, cartHash, changed: true };
  });
}

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
  validatePackLines(s, input.lines);
  requireThat(
    !input.lines.some((l) => RETIRED_SKUS.has(l.productId)),
    "Product unavailable",
    422,
  );
  requireThat(
    input.lines.every((l) => availableSku(l.productId)),
    "This product is outside its ordering season",
    422,
  );
  const method =
    "fulfillmentMethod" in input ? input.fulfillmentMethod : undefined;
  const zone = s.zones.find((z) => z.id === input.zoneId && z.active);
  requireThat(
    method === "pickup" || zone,
    "Delivery zone is not supported",
    400,
  );
  const quote = quoteOrder(
    s.zones,
    input.lines,
    undefined,
    undefined,
    service.geo,
    zone?.id,
    s.catalog ?? [],
    method,
  );
  // Opaque comparison token only: catalog/quote remain the sole price authority.
  const quoteRevision = digest(
    JSON.stringify({
      ...(packBuilderEnabled()
        ? { packEligibility: publishedPackRules(s) }
        : {}),
      packPricing: packPricingPolicy(s.catalog ?? []),
      lines: [...input.lines]
        .sort((a, b) => lineKey(a).localeCompare(lineKey(b)))
        .map((l) => ({
          ...l,
          product: s.catalog?.find((p) => p.id === l.productId),
        })),
      quote,
    }),
  );
  return { ...quote, quoteRevision };
}

export type WebCheckoutSummary = {
  items: {
    productId: string;
    color?: Order["lines"][number]["color"];
    composition?: Order["lines"][number]["composition"];
    packSnapshot?: Order["lines"][number]["packSnapshot"];
    name: string;
    quantity: number;
    lineFils: number;
  }[];
  subtotalFils: number;
  feeFils: number;
  fulfillmentMethod?: "delivery" | "pickup";
  pickup?: Order["pickup"];
  delivery?: DeliveryDetails & { zoneName?: string };
  customerName?: string;
  /** As the customer typed it; absent for orders captured with a single name. */
  customerFirstName?: string;
};
export type WebCheckoutResult = {
  cartHash?: string;
  superseded?: boolean;
  /** Internal reference; kept for support and for clients built before #001. */
  orderId: string;
  /** "#001" once the order is paid; null before then and for older orders. */
  orderNumber: string | null;
  status: Order["state"];
  paymentStatus: string;
  paymentFlow?: "web";
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
  let frozen: ReturnType<typeof frozenCheckout> | undefined;
  try {
    frozen = frozenCheckout(order, payment);
    if (
      !["paid", "partially_refunded", "refunded", "chargeback"].includes(
        payment.status,
      )
    )
      requireThat(
        acceptedPackPricesCurrent(s, order),
        "Premium pricing changed; review required",
        409,
      );
  } catch {
    frozen = undefined;
    /* Legacy financial status remains readable; no invented line prices. */
  }
  return {
    cartHash: record?.cartHash,
    superseded: !!record?.supersededAt,
    orderId: order.id,
    orderNumber: order.publicOrderNumber
      ? formatOrderNumber(order.publicOrderNumber)
      : null,
    status: order.state,
    paymentStatus: payment.status,
    ...(payment.checkoutFlow === "web" ? { paymentFlow: "web" as const } : {}),
    amountFils: payment.amountFils,
    currency: payment.currency,
    actionRequired:
      record?.supersededAt ||
      (payment.status === "paid" &&
        order.state === "Awaiting Payment" &&
        !acceptedPackPricesCurrent(s, order)) ||
      (!frozen && payment.status !== "paid")
        ? "review_payment"
        : payment.checkoutFlow === "web" &&
            !payment.url &&
            !["paid", "failed", "cancelled", "expired"].includes(payment.status)
          ? "review_payment"
          : payment.directAttempt === "unknown" ||
              (payment.directAttempt === "submitted" &&
                Date.now() - Date.parse(payment.updatedAt) > 30000)
            ? "review_payment"
            : payment.directAttempt === "ready"
              ? "complete_payment"
              : null,
    url:
      frozen && !record?.supersededAt && payment.status === "pending"
        ? (payment.url ?? null)
        : null,
    summary: frozen
      ? {
          items: frozen.items.map((i) => ({
            productId: i.sku,
            ...(i.color ? { color: i.color } : {}),
            ...(i.packSnapshot ? { packSnapshot: i.packSnapshot } : {}),
            ...(i.composition
              ? { composition: i.composition, packSnapshot: i.packSnapshot }
              : {}),
            name: i.name,
            quantity: i.quantity,
            lineFils: i.unitPriceFils * i.quantity,
          })),
          subtotalFils: frozen.subtotalFils,
          feeFils: frozen.feeFils,
          fulfillmentMethod: order.fulfillmentMethod ?? "delivery",
          pickup: order.pickup,
          delivery:
            order.fulfillmentMethod !== "pickup" && order.delivery
              ? {
                  ...order.delivery,
                  zoneName: order.quote?.zoneName ?? undefined,
                }
              : undefined,
          customerName: s.conversations.find(
            (c) => c.id === order.conversationId,
          )?.customer,
          customerFirstName: order.customerDetails?.firstName,
        }
      : undefined,
  };
}

/** Reservation, all domain commands and outbox entry commit together before any network request. */
export async function createWebCheckout(
  service: CommerceService,
  raw: unknown,
  key: string,
  embedded: boolean | "web" = false,
  origin?: string,
  expectedQuoteRevision?: string,
): Promise<WebCheckoutResult> {
  if (embedded === "web") {
    const url = new URL(origin ?? "");
    requireThat(
      url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)),
      "Invalid checkout origin",
      503,
    );
  }
  const input = normalizeCheckout(raw),
    receiptKey = digest(keySchema.parse(key));
  // Direct card payments need the full checkout: delivery details and a
  // confirmed billing address. The legacy single-product shape cannot pay.
  requireThat(
    !embedded || ((input.delivery || input.pickup) && input.billing),
    "Please complete your delivery and billing details.",
    422,
  );
  if (input.delivery) {
    const zone = authoritativeAddress(service, input.delivery);
    input.zoneId = zone.id;
    input.delivery.zoneId = zone.id;
    input.delivery.addressVerification =
      service.deliveryAddressMode === "legacy" ? "UNVERIFIED" : "VERIFIED";
  }
  const inputHash = digest(JSON.stringify(input));
  service.store.transaction(() => {
    const snapshot = service.store.read();
    const previous = snapshot.webCheckouts?.[receiptKey];
    if (previous) {
      requireThat(
        !previous.supersededAt,
        "Cart changed; checkout key already used with different details",
        409,
      );
      requireThat(
        previous.inputHash === inputHash,
        "Checkout key already used with different details",
        409,
      );
      const order = snapshot.orders.find((o) => o.id === previous.orderId);
      const payment = snapshot.payments.find((p) => p.id === order?.paymentId);
      requireThat(order && payment, "Checkout not found", 409);
      frozenCheckout(order, payment);
      return;
    }
    const cartHash = canonicalCartHash(
      service,
      {
        lines: input.lines,
        ...(input.fulfillmentMethod === "pickup"
          ? { fulfillmentMethod: "pickup" }
          : { zoneId: input.zoneId }),
      },
      { delivery: input.delivery ?? null, pickup: input.pickup ?? null },
    );
    const quote = quoteWebCheckout(service, {
      lines: input.lines,
      ...(input.fulfillmentMethod === "pickup"
        ? { fulfillmentMethod: "pickup" }
        : { zoneId: input.zoneId }),
    });
    if (expectedQuoteRevision !== undefined) {
      requireThat(
        /^[a-f0-9]{64}$/.test(expectedQuoteRevision) &&
          expectedQuoteRevision === quote.quoteRevision,
        "Your cart price or availability changed. Please return to delivery and review the updated total.",
        409,
      );
    }
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
    if (input.fulfillmentMethod !== "pickup")
      order = command("manualZone", order, {
        zoneId: input.zoneId,
        reason:
          "Customer selected delivery zone; address retained for fulfillment",
      });
    if (input.delivery || input.pickup)
      service.store.write((s) => {
        const o = s.orders.find((o) => o.id === order.id)!;
        o.fulfillmentMethod = input.fulfillmentMethod ?? "delivery";
        o.pickup = input.pickup;
        if (input.pickup) {
          o.address = undefined;
          o.manualZoneId = undefined;
          transition(o, "Minimum Check", WEB_ACTOR.id);
          order = { id: o.id, version: o.version };
        } else o.address = input.address;
        o.delivery = input.delivery;
        o.customerDetails = input.details;
        o.storefrontProducts = Object.fromEntries(
          input.lines.flatMap((line) => {
            const product = products.find((p) =>
              p.optionIds.includes(line.productId),
            );
            return product ? [[line.productId, product.id]] : [];
          }),
        );
        o.billing = input.billing;
      });
    order = command("requestPayment", order);
    if (embedded === "web")
      service.store.write((s) => {
        const payment = s.payments.find((p) => p.orderId === order.id)!;
        payment.checkoutFlow = "web";
        payment.webReturnUrl = new URL("/checkout/return", origin).href;
      });
    if (embedded === true)
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
        cartHash,
        inputHash,
        orderId: order.id,
        createdAt: new Date().toISOString(),
      };
    });
  });
  // Concurrent calls share the same durable payment job; unknown sends are not retried blindly.
  if (embedded !== true) await service.drain();
  return readWebCheckoutStatus(service, key);
}
