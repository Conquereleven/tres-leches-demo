import test from "node:test";
import assert from "node:assert/strict";
import {
  nextDayClosed,
  earliestProductionDate,
  earliestFulfillmentDate,
  validWindow,
  leadHours,
} from "../../shared/commerce-policy";
import { normalizeCheckout } from "../../server/domain/web-checkout";
for (const [time, closed, earliest] of [
  ["20:59:00", false, "2026-10-07"],
  ["21:00:00", false, "2026-10-07"],
  ["21:00:59", false, "2026-10-07"],
  ["21:01:00", true, "2026-10-08"],
] as const)
  test(`Dubai cutoff ${time}`, () => {
    const now = new Date(`2026-10-06T${time}+04:00`);
    assert.equal(nextDayClosed(now), closed);
    assert.equal(earliestProductionDate(now), earliest);
    assert.equal(validWindow("2026-10-07", "4:00 PM – 9:00 PM", now), !closed);
  });
test("calendar rollover and host timezone independence", () => {
  const previous = process.env.TZ;
  try {
    for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = tz;
      assert.equal(
        earliestProductionDate(new Date("2026-12-31T17:01:00Z")),
        "2027-01-02",
      );
      assert.equal(
        earliestProductionDate(new Date("2026-12-31T17:00:00Z")),
        "2027-01-01",
      );
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test("24-hour items select later valid date, keeping 12-hour windows", () => {
  const now = new Date("2026-10-06T21:00:00+04:00");
  assert.equal(earliestFulfillmentDate(now, 12), "2026-10-07");
  assert.equal(
    earliestFulfillmentDate(now, leadHours(["rosca-de-reyes-6-personas"])),
    "2026-10-08",
  );
  assert.equal(
    earliestFulfillmentDate(new Date("2026-10-06T10:00:00+04:00"), 24),
    "2026-10-07",
  );
  assert.equal(validWindow("2026-10-07", "8:00 AM – 1:00 PM", now, 12), false);
});
for (const method of ["delivery", "pickup"] as const)
  test(`server rejects stale next-day ${method} after cutoff`, (t) => {
    t.mock.timers.enable({
      apis: ["Date"],
      now: new Date("2026-10-06T21:01:00+04:00"),
    });
    const raw = {
      lines: [{ productId: "conchas-filled-pistache-mini", quantity: 3 }],
      fulfillmentMethod: method,
      customer: {
        name: "Cutoff fixture",
        phone: "0500000000",
        email: "cutoff@example.invalid",
      },
      billing: {
        sameAsDelivery: false,
        name: "Cutoff fixture",
        address1: "Fixture address",
        city: "Dubai",
        country: "AE",
      },
      ...(method === "pickup"
        ? {
            pickup: {
              pickupDate: "2026-10-07",
              preferredTime: "4:00 PM – 9:00 PM",
            },
          }
        : {
            delivery: {
              zoneId: "jlt-cluster-c",
              address: "Fixture address",
              building: "Fixture tower",
              date: "2026-10-07",
              slot: "4:00 PM – 9:00 PM",
            },
          }),
    };
    assert.throws(() => normalizeCheckout(raw), /9 PM Dubai cutoff/);
    if ("pickup" in raw) raw.pickup.pickupDate = "2026-10-08";
    if ("delivery" in raw) raw.delivery.date = "2026-10-08";
    assert.equal(normalizeCheckout(raw).fulfillmentMethod, method);
  });
