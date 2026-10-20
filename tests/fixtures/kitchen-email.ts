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
    ["kitchen@example.invalid"],
  )[0]!;
}

/** One six-piece box + three single products; fictional mobile screenshot brief. */
export function compactKitchenEmailFixture() {
  const f = kitchenEmailFixture();
  const box = structuredClone(f.order.lines[1]!);
  box.quantity = 1;
  // Plain sugar/sesame is a historical accepted composition, not an approval change.
  const spec = PACK_SPECS.find((s) => s.packSkuId === box.productId)!;
  const sugar = spec.components.find(
    (c) =>
      c.componentSkuId.includes("azucar") &&
      !c.componentSkuId.includes("covering"),
  )!.componentSkuId;
  const sesame = spec.components.find((c) =>
    c.componentSkuId.includes("ajonjoli"),
  )!.componentSkuId;
  box.composition = [
    { componentSkuId: sugar, units: 4 },
    { componentSkuId: sesame, units: 2 },
  ];
  box.packSnapshot!.components = box.composition.map((c) => ({
    ...c,
    name: componentName(c.componentSkuId, "en"),
  }));
  f.order.lines = [
    box,
    { productId: "conchas-traditional-chocolate-individual-70-g", quantity: 1 },
    { productId: "pan-de-muerto-traditional-azucar-mini-40-g", quantity: 1 },
    { productId: "pan-de-muerto-traditional-ajonjoli-mini-40-g", quantity: 1 },
  ];
  f.order.catalogSnapshot = f.catalog.filter((p) =>
    f.order.lines.some((l) => l.productId === p.id),
  );
  const amount = f.order.lines.reduce(
    (sum, l) =>
      sum +
      f.order.catalogSnapshot!.find((p) => p.id === l.productId)!.priceFils *
        l.quantity,
    0,
  );
  f.order.quote!.subtotalFils = amount;
  f.order.quote!.totalFils = amount;
  f.payment.amountFils = amount;
  f.order.customerDetails!.instructions =
    "ALLERGY: peanuts. Call before preparation.";
  f.order.delivery!.notes = "Call reception; keep box level.";
  f.order.delivery!.addressVerification = "UNVERIFIED";
  f.order.customerDetails!.whatsappNumber = "+971500000000";
  f.state.conversations.push({
    id: f.order.conversationId,
    customer: "Alex Example",
    phone: "+971500000000",
    sourceNumberId: "fictional",
    sourcePhoneNumber: "+971500000001",
    assignedAgent: null,
    status: "open",
    unread: false,
    version: 1,
    messages: [],
    audit: [],
  });
  return f;
}

export function compactKitchenEmailPreview(
  kind:
    | "short"
    | "three"
    | "typical"
    | "pickup"
    | "long"
    | "review"
    | "large" = "typical",
) {
  const f =
    kind === "large" ? kitchenEmailFixture() : compactKitchenEmailFixture();
  if (kind === "short" || kind === "three") {
    // Reuse already accepted synthetic single lines; no screenshot-derived data.
    f.order.lines = f.order.lines
      .filter((line) => !line.packSnapshot)
      .slice(0, kind === "short" ? 1 : 3);
    f.order.catalogSnapshot = f.order.catalogSnapshot!.filter((product) =>
      f.order.lines.some((line) => line.productId === product.id),
    );
    const amount = f.order.lines.reduce(
      (total, line) =>
        total +
        f.order.catalogSnapshot!.find(
          (product) => product.id === line.productId,
        )!.priceFils *
          line.quantity,
      0,
    );
    f.order.quote!.subtotalFils = amount;
    f.order.quote!.totalFils = amount;
    f.payment.amountFils = amount;
  }
  if (kind === "long") {
    f.order.customerDetails!.instructions =
      "ALLERGY: peanuts & sesame.\n" +
      "Original instructions must remain complete. ".repeat(45) +
      "\nEND OF ORIGINAL ALLERGY INSTRUCTIONS";
    f.order.delivery!.notes =
      "Long delivery note: " +
      "FictionalAccessDetail".repeat(60) +
      "\nEND OF DELIVERY NOTES";
    f.order.delivery!.building = "LongFictionalBuilding".repeat(30);
  }
  if (kind === "review") delete f.order.lines[0]!.packSnapshot;
  if (kind === "pickup") {
    f.order.fulfillmentMethod = "pickup";
    f.order.pickup = {
      pickupDate: "2026-11-01",
      preferredTime: "4:00 PM – 9:00 PM",
    };
    delete f.order.delivery;
  }
  return recordPaidOperationsEmail(
    f.state,
    f.order,
    f.payment,
    ["kitchen@example.invalid"],
    "https://www.3ldubai.ae",
    ["kitchen@example.invalid"],
  )[0]!;
}
