import type { DeliveryZone } from "../../server/domain/model";

// Deliberately synthetic minimum, not a business policy or Production seed.
export const bluewatersFixture: DeliveryZone = {
  id: "fixture-bluewaters-island",
  name: "Bluewaters Island",
  aliases: ["Bluewaters", "Blue Waters", "Blue Waters Island"],
  minOrderAed: 137,
  deliveryFeeAed: 0,
  freeDelivery: true,
  active: true,
  priority: 10,
  version: 1,
};
