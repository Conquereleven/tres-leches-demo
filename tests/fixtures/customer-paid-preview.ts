import type { Order } from "../../server/domain/model";
import { PACK_SPECS } from "../../shared/pack-composition";
/** Synthetic accepted snapshots, never a catalog seed or a real order. */
export function paidPreview(pickup: boolean): Order {
  const spec = PACK_SPECS.find(
    (s) => s.packSkuId === "pan-de-muerto-filled-pack-12-individuales",
  )!;
  const line = (a: number, b: number, quantity: number) => {
    const composition = [
      { componentSkuId: spec.components[0]!.componentSkuId, units: a },
      { componentSkuId: spec.components[1]!.componentSkuId, units: b },
    ].filter((x) => x.units > 0);
    return {
      productId: spec.packSkuId,
      quantity,
      composition,
      packSnapshot: {
        version: 1 as const,
        revision: "catalog-v1-" + "a".repeat(64),
        capacity: 12,
        components: composition.map((c) => ({
          ...c,
          name: spec.components.find(
            (s) => s.componentSkuId === c.componentSkuId,
          )!.names.en,
        })),
      },
    };
  };
  return {
    id: "TL-SYNTHETIC-PAID",
    publicOrderNumber: 999,
    state: "Confirmed",
    fulfillmentMethod: pickup ? "pickup" : "delivery",
    customerDetails: {
      firstName: "Alex",
      lastName: "Fixture",
      email: "alex@example.invalid",
    },
    lines: [line(4, 8, 2), line(12, 0, 1)],
    catalogSnapshot: [
      {
        id: spec.packSkuId,
        name: "Pan de Muerto · Filled pack · 12 individual",
        priceFils: 23500,
      },
    ],
    ...(pickup
      ? {
          pickup: {
            pickupDate: "2026-10-28",
            preferredTime: "4:00 PM – 9:00 PM",
          },
        }
      : {
          delivery: {
            date: "2026-10-28",
            slot: "4:00 PM – 9:00 PM",
            zoneId: "jlt-cluster-c",
          },
        }),
  } as unknown as Order;
}
