import { validateCatalog } from "../../server/domain/catalog";
import { readFileSync } from "node:fs";
import { PACK_SPECS, componentName } from "../../shared/pack-composition";
import { seed } from "../../server/db/store";
import type { Line, Order, Payment } from "../../server/domain/model";
import { recordPaidOperationsEmail } from "../../server/domain/operations-email";

/** Fictitious accepted order only. Never contacts a provider or reads a database. */
export function kitchenEmailFixture() {
  const state = seed();
  const catalog = validateCatalog(
    JSON.parse(readFileSync("data-imports/liza-current-menu.json", "utf8")),
  );
  const traditional = PACK_SPECS.find(
    (s) => s.family === "traditional" && s.size === "mini" && s.capacity === 6,
  )!;
  const filled = PACK_SPECS.find(
    (s) =>
      s.family === "filled" && s.size === "individuales" && s.capacity === 12,
  )!;
  const sugar = traditional.components.find(
    (c) =>
      /azucar/.test(c.componentSkuId) && !/covering/.test(c.componentSkuId),
  )!;
  const covering = traditional.components.find((c) =>
    /covering/.test(c.componentSkuId),
  )!;
  const sesame = traditional.components.find((c) =>
    /ajonjoli/.test(c.componentSkuId),
  )!;
  const packLine = (
    spec: typeof traditional,
    quantity: number,
    entries: [string, number][],
  ): Line => ({
    productId: spec.packSkuId,
    quantity,
    composition: entries.map(([componentSkuId, units]) => ({
      componentSkuId,
      units,
    })),
    packSnapshot: {
      version: 1,
      revision: `catalog-v1-${"a".repeat(64)}`,
      capacity: spec.capacity,
      components: entries.map(([componentSkuId, units]) => ({
        componentSkuId,
        units,
        name: componentName(componentSkuId, "en"),
      })),
    },
  });
  const lines: Line[] = [
    { productId: "conchas-traditional-chocolate-individual-70-g", quantity: 2 },
    packLine(traditional, 2, [
      [sugar.componentSkuId, 4],
      [covering.componentSkuId, 2],
    ]),
    packLine(traditional, 1, [[sesame.componentSkuId, 6]]),
    packLine(filled, 1, [
      [filled.components[0]!.componentSkuId, 8],
      [filled.components[4]!.componentSkuId, 4],
    ]),
  ];
  const catalogSnapshot = catalog.filter((p: { id: string }) =>
    lines.some((l) => l.productId === p.id),
  );
  const amount = lines.reduce(
    (sum, line) =>
      sum +
      catalogSnapshot.find((p: { id: string }) => p.id === line.productId)!
        .priceFils *
        line.quantity,
    0,
  );
  const order: Order = {
    id: "TL-FICTIONAL-EMAIL",
    publicOrderNumber: 42,
    conversationId: "fictional-conversation",
    state: "Confirmed",
    version: 1,
    lines,
    catalogSnapshot,
    quote: {
      zoneId: "fictional-zone",
      zoneName: "Fictional Community",
      minOrderAed: 30,
      feeFils: 0,
      subtotalFils: amount,
      totalFils: amount,
      minimumMet: true,
      eligible: true,
      reason: "Fixture",
      zoneVersion: 1,
    },
    fulfillmentMethod: "delivery",
    address: "Fictional Street, Example Tower, Unit 404",
    delivery: {
      zoneId: "fictional-zone",
      address: "Fictional Street",
      building: "Example Tower",
      unit: "404",
      date: "2026-11-01",
      slot: "4:00 PM – 9:00 PM",
      addressVerification: "UNVERIFIED",
      notes: "Call reception. Keep boxes level.",
    },
    customerDetails: {
      firstName: "Alex",
      lastName: "Example",
      email: "customer@example.invalid",
      instructions:
        "ALLERGY: peanuts — please contact me before preparation.\nKeep the two mixed boxes separate. Gracias — شكراً.",
    },
    paidAt: "2026-10-16T12:00:00Z",
    audit: [],
  };
  const payment: Payment = {
    id: "fictional-payment",
    orderId: order.id,
    amountFils: amount,
    currency: "AED",
    status: "paid",
    paidAt: order.paidAt,
    createdAt: order.paidAt!,
    updatedAt: order.paidAt!,
    timeline: [],
  };
  return { state, order, payment, catalog };
}
export function kitchenEmailPreview() {
  const { state, order, payment } = kitchenEmailFixture();
  return recordPaidOperationsEmail(
    state,
    order,
    payment,
    ["kitchen@example.invalid"],
    "https://www.3ldubai.ae",
  )[0]!;
}
