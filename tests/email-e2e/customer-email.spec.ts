import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { renderCustomerEmail } from "../../server/domain/customer-notifications";
import type { CustomerEvent, Order } from "../../server/domain/model";

function order(pickup: boolean, firstName = "Alex"): Order {
  return {
    id: "TL-SYNTHETIC",
    publicOrderNumber: 42,
    fulfillmentMethod: pickup ? "pickup" : "delivery",
    customerDetails: { firstName, lastName: "Example", email: "fictional@example.invalid" },
    lines: [{ productId: "test-product", quantity: 3 }],
    catalogSnapshot: [{ id: "test-product", name: "Mini chocolate conchas", priceFils: 1800 }],
    ...(pickup
      ? { pickup: { pickupDate: "2026-10-21", preferredTime: "4:00 PM – 9:00 PM" } }
      : { delivery: { date: "2026-10-21", slot: "4:00 PM – 9:00 PM" } }),
  } as unknown as Order;
}

const cases: Array<{ event: CustomerEvent; pickup: boolean; heading: string }> = [
  { event: "ORDER_PRODUCTION_STARTED", pickup: false, heading: "We're preparing your order." },
  { event: "ORDER_READY_FOR_PICKUP", pickup: true, heading: "Your order is ready!" },
  { event: "ORDER_OUT_FOR_DELIVERY", pickup: false, heading: "Your order is on its way." },
];

for (const width of [320, 390, 1024]) {
  for (const sample of cases) {
    test(`customer email ${sample.event} ${width}px: responsive and accessible with no external calls`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      const attempted: string[] = [];
      await page.route("**/*", (route) => {
        attempted.push(route.request().url());
        return route.abort();
      });
      const email = renderCustomerEmail(sample.event, order(sample.pickup), {
        zoneName: "JLT Cluster C",
      });
      await page.setContent(email.html);
      await expect(page.getByRole("heading", { name: sample.heading })).toBeVisible();
      await expect(page.getByText("#042", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Your order" })).toBeVisible();
      await expect(page.getByText("3 × Mini chocolate conchas")).toBeVisible();
      await expect(page.getByText("Hi Alex,")).toBeVisible();
      if (sample.event === "ORDER_READY_FOR_PICKUP") {
        await expect(page.getByText("Retail Shop C6/A")).toBeVisible();
      }
      if (sample.event === "ORDER_OUT_FOR_DELIVERY") {
        await expect(page.getByText("JLT Cluster C")).toBeVisible();
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const a11y = await new AxeBuilder({ page }).analyze();
      expect(a11y.violations).toEqual([]);
      expect(attempted).toEqual([]);
    });
  }
}

test("customer email escapes HTML and wraps long unbroken customer input on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const badName = "<script>alert(1)</script>" + "A".repeat(300);
  const html = renderCustomerEmail(
    "ORDER_OUT_FOR_DELIVERY",
    order(false, badName),
    { zoneName: "LongZone".repeat(70) },
  ).html;
  await page.setContent(html);
  await expect(page.locator("script")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});
