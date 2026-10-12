import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { workspace } from "../fixtures/ux-states";
for (const width of [390, 1440]) {
  test(`address, verification, instructions and pickup at ${width}px`, async ({
    page,
  }, info) => {
    const data = workspace();
    data.orders = [data.orders[0]!];
    const order = data.orders[0]!;
    const catalog = JSON.parse(
      readFileSync("data-imports/liza-current-menu.json", "utf8"),
    );
    const product = catalog.items.find(
      (p: { id: string }) => p.id === "conchas-traditional-chocolate-mini-40-g",
    );
    order.lines = [{ productId: product.id, quantity: 4 }];
    order.catalogSnapshot = [product];
    Object.assign(order.quote, {
      zoneName: "JVC",
      subtotalFils: 4400,
      totalFils: 4400,
    });
    data.payments = [{ ...data.payments[0]!, amountFils: 4400 }];
    const date = order.delivery!.date;
    const dateLabel = new Date(`${date}T12:00:00+04:00`).toLocaleDateString(
      "en-GB",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Dubai",
      },
    );
    Object.assign(order, {
      fulfillmentMethod: "delivery",
      address: "Unit 1121, Fixture Tower, Fixture Street",
      customerDetails: { instructions: "Call me on arrival" },
      delivery: {
        zoneId: "jvc",
        address: "Fixture Street",
        building: "Fixture Tower",
        unit: "1121",
        date,
        slot: "1:00 PM – 4:00 PM",
        addressVerification: "UNVERIFIED",
        notes: "Use reception entrance",
      },
    });
    const errors: string[] = [];
    const writes: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (r) => {
      if (r.request().method() !== "GET") writes.push(r.request().url());
      return r.fulfill({ json: data });
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/operations/orders");
    const card = page.locator(".ops-order-card");
    for (const v of [
      order.address!,
      "Fixture Tower",
      "1121",
      dateLabel,
      "1:00 PM – 4:00 PM",
      "Call me on arrival",
      "Use reception entrance",
      "ADDRESS NOT VERIFIED",
    ])
      await expect(card).toContainText(v);
    await expect(card).not.toContainText("Address incomplete");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const dir = "docs/operations/address-hotfix/screenshots";
    mkdirSync(dir, { recursive: true });
    await page.screenshot({
      path: `${dir}/${info.project.name}-address-${width}.png`,
      fullPage: true,
    });
    order.delivery!.addressVerification = "VERIFIED";
    await page.reload();
    await expect(card).not.toContainText("ADDRESS NOT VERIFIED");
    order.delivery!.address = "";
    order.delivery!.building = "";
    order.address = undefined;
    await page.reload();
    await expect(card).toContainText("Address incomplete");
    await expect(card).toContainText("Not stored");
    order.fulfillmentMethod = "pickup";
    order.pickup = {
      pickupDate: date,
      preferredTime: "1:00 PM – 4:00 PM",
    };
    await page.reload();
    await expect(card).toContainText("PICKUP");
    await expect(card).not.toContainText("Address incomplete");
    await expect(card).not.toContainText("ADDRESS NOT VERIFIED");
    await expect(card).not.toContainText("Full address");
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}
