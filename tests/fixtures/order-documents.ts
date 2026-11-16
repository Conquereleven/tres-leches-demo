/** Synthetic TPL-18 fixtures. Fictional orders only: no 3L customers, prices or providers. */
import { seed } from "../../server/db/store";
import type {
  Order,
  OrderState,
  Payment,
  State,
} from "../../server/domain/model";

export const TODAY = "2026-11-04";
export const TOMORROW = "2026-11-05";
export const PII = "PRIVATE_CUSTOMER_SENTINEL";
export const PROVIDER_REF = "fictional-provider-checkout-secret";

export function docOrder(
  id: string,
  over: Partial<Order> & { deliveredAt?: string } = {},
): Order {
  const { deliveredAt, ...rest } = over;
  const state: OrderState = rest.state ?? "Confirmed";
  const audit: Order["audit"] = [
    { at: "2026-11-01T08:00:00Z", actor: "fixture", action: "Created" },
  ];
  if (deliveredAt)
    audit.push({
      at: deliveredAt,
      actor: "fixture",
      action: "Out for Delivery → Delivered",
      from: "Out for Delivery",
      to: "Delivered",
    });
  return {
    id,
    conversationId: `conv-${id}`,
    state,
    version: 1,
    lines: [{ productId: "fixture-cake", quantity: 2 }],
    catalogSnapshot: [
      {
        id: "fixture-cake",
        name: "Fictional tres leches",
        category: "Fictional",
        priceFils: 4500,
      },
    ],
    paymentId: `pay-${id}`,
    fulfillmentMethod: "delivery",
    delivery: {
      zoneId: "fixture-zone",
      address: "1 Fictional Street",
      building: "Fixture Tower",
      date: TOMORROW,
      slot: "10:00–12:00",
      addressVerification: "VERIFIED",
    },
    quote: {
      zoneId: "fixture-zone",
      zoneName: "Fixture Area",
      minOrderAed: null,
      feeFils: 0,
      subtotalFils: 9000,
      totalFils: 9000,
      minimumMet: true,
      eligible: true,
      reason: "",
      zoneVersion: null,
    },
    customerDetails: {
      firstName: PII,
      lastName: "Fixture",
      email: "private-fixture@example.invalid",
      whatsappNumber: "+971500000000",
    },
    ...rest,
    audit: rest.audit ?? audit,
  };
}

export function docPayment(
  o: Order,
  status: Payment["status"] = "paid",
): Payment {
  return {
    id: o.paymentId!,
    orderId: o.id,
    amountFils: 9000,
    currency: "AED",
    status,
    provider: "paymennt",
    providerCheckoutId: PROVIDER_REF,
    createdAt: "2026-11-01T08:00:00Z",
    updatedAt: "2026-11-01T08:00:00Z",
    timeline: [],
  };
}

/** 60 bulk orders plus named edge cases around the Dubai day boundary. */
export function documentsState(): State {
  const s = seed();
  const add = (o: Order, status?: Payment["status"]) => {
    s.orders.push(o);
    s.payments.push(docPayment(o, status));
  };
  for (let i = 0; i < 60; i++)
    add(docOrder(`TL-BULK${String(i).padStart(3, "0")}`));
  // 00:30 Dubai on TODAY (20:30Z the previous UTC day): delivered today.
  add(
    docOrder("TL-JUSTAFTER", {
      state: "Delivered",
      deliveredAt: "2026-11-03T20:30:00Z",
    }),
  );
  // 23:59 Dubai yesterday: not today, even though UTC says 19:59 on Nov 3.
  add(
    docOrder("TL-JUSTBEFORE", {
      state: "Delivered",
      deliveredAt: "2026-11-03T19:59:00Z",
    }),
  );
  // Delivered with no transition evidence: unknown, never "today".
  add(docOrder("TL-NOEVIDENCE", { state: "Delivered" }));
  add(
    docOrder("TL-PICKEDUP", {
      state: "Delivered",
      fulfillmentMethod: "pickup",
      delivery: undefined,
      pickup: { pickupDate: TODAY, preferredTime: "15:00" },
      deliveredAt: "2026-11-04T11:00:00Z",
    }),
  );
  add(docOrder("TL-UNPAID", { state: "Awaiting Payment" }), "pending");
  add(docOrder("TL-CANCELLED", { state: "Cancelled" }), "cancelled");
  add(docOrder("TL-DRAFT", { state: "Building", paymentId: undefined }));
  s.payments = s.payments.filter((p) => p.orderId !== "TL-DRAFT");
  // Placed today but due later: placement date never puts it in tomorrow.
  add(
    docOrder("TL-LATER", {
      delivery: { ...docOrder("x").delivery!, date: "2026-11-09" },
    }),
  );
  add(
    docOrder("TL-INJECT", {
      customerDetails: { firstName: PII, instructions: '=HYPERLINK("x")' },
      quote: {
        ...docOrder("x").quote!,
        zoneName: '=cmd|"/c calc"!A1, "quoted"\nline',
      },
    }),
  );
  add(docOrder("TL-NOSNAPSHOT", { catalogSnapshot: undefined }));
  return s;
}
