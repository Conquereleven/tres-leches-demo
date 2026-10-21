/** Synthetic reporting ledger. No actual 3L orders, customers, prices or provider calls. */
import { seed } from "../../server/db/store";
import type { Order, Payment, State } from "../../server/domain/model";
export const REPORT_DAY = "2026-10-19";
export function reportingOrder(
  id: string,
  amountFils = 7000,
  paidAt = "2026-10-19T08:00:00Z",
): { order: Order; payment: Payment } {
  const order: Order = {
    id,
    conversationId: "fictional-private-conversation",
    state: "Confirmed",
    version: 1,
    lines: [{ productId: "fixture-box", quantity: 1 }],
    catalogSnapshot: [
      {
        id: "fixture-box",
        name: "Fictional assortment box",
        category: "Fictional bakery",
        priceFils: amountFils,
      },
    ],
    paymentId: `payment-${id}`,
    fulfillmentMethod: "pickup",
    paidAt,
    quote: {
      zoneId: null,
      zoneName: null,
      minOrderAed: null,
      feeFils: 0,
      subtotalFils: amountFils,
      totalFils: amountFils,
      minimumMet: true,
      eligible: true,
      reason: "",
      zoneVersion: null,
    },
    customerDetails: {
      firstName: "PRIVATE_CUSTOMER_SENTINEL",
      email: "private-fixture@example.invalid",
    },
    audit: [
      { at: "2026-10-18T10:00:00Z", actor: "fixture", action: "Created" },
    ],
  };
  const payment: Payment = {
    id: order.paymentId!,
    orderId: id,
    amountFils,
    currency: "AED",
    status: "paid",
    provider: "paymennt",
    providerCheckoutId: `fictional-checkout-${id}`,
    paidAt,
    lastReconciledAt: paidAt,
    createdAt: "2026-10-18T10:00:00Z",
    updatedAt: paidAt,
    timeline: [],
  };
  return { order, payment };
}
export function analyticsState(): State {
  const s = seed();
  for (let i = 0; i < 18; i++) {
    const at = new Date(Date.UTC(2026, 9, 19 - i, 10)).toISOString();
    const { order, payment } = reportingOrder(
      `fictional-${i}`,
      5000 + (i % 4) * 1700,
      at,
    );
    const names = [
      "Fictional vanilla cake",
      "Fictional mini bread",
      "Fictional assortment box",
      "Fictional chocolate jar",
    ];
    order.lines[0]!.productId = `fictional-sku-${i % 4}`;
    order.catalogSnapshot![0]!.id = order.lines[0]!.productId;
    order.catalogSnapshot![0]!.name = names[i % 4]!;
    order.state = (["Confirmed", "Production", "Ready", "Delivered"] as const)[
      i % 4
    ]!;
    order.fulfillmentMethod = i % 3 ? "delivery" : "pickup";
    s.orders.push(order);
    s.payments.push(payment);
  }
  return s;
}
