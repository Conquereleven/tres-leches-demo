import { mkdirSync } from "node:fs";
import { PACK_SPECS } from "../../shared/pack-composition";
import { snapshotTricolor } from "../../shared/tricolor";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { renderCustomerEmail } from "../../server/domain/customer-notifications";
import type { CustomerEvent, Order } from "../../server/domain/model";

function order(pickup: boolean, firstName = "Alex"): Order {
  return {
    id: "TL-SYNTHETIC",
    publicOrderNumber: 42,
    fulfillmentMethod: pickup ? "pickup" : "delivery",
    customerDetails: {
      firstName,
      lastName: "Example",
      email: "fictional@example.invalid",
    },
    lines: [{ productId: "test-product", quantity: 3 }],
    catalogSnapshot: [
      { id: "test-product", name: "Mini chocolate conchas", priceFils: 1800 },
    ],
    ...(pickup
      ? {
          pickup: {
            pickupDate: "2026-10-21",
            preferredTime: "4:00 PM – 9:00 PM",
          },
        }
      : { delivery: { date: "2026-10-21", slot: "4:00 PM – 9:00 PM" } }),
  } as unknown as Order;
}

const cases: Array<{ event: CustomerEvent; pickup: boolean; heading: string }> =
  [
    {
      event: "ORDER_PRODUCTION_STARTED",
      pickup: false,
      heading: "We're preparing your order.",
    },
    {
      event: "ORDER_READY_FOR_PICKUP",
      pickup: true,
      heading: "Your order is ready!",
    },
    {
      event: "ORDER_OUT_FOR_DELIVERY",
      pickup: false,
      heading: "Your order is on its way.",
    },
  ];

for (const width of [320, 390, 1024]) {
  for (const sample of cases) {
    test(`customer email ${sample.event} ${width}px: responsive and accessible with no external calls`, async ({
      page,
      browserName,
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
      await expect(
        page.getByRole("heading", { name: sample.heading }),
      ).toBeVisible();
      await expect(page.getByText("#042", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Your order", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("3 × Mini chocolate conchas")).toBeVisible();
      await expect(page.getByText("Hi Alex,")).toBeVisible();
      if (sample.event === "ORDER_READY_FOR_PICKUP") {
        await expect(page.getByText("Retail Shop C6/A")).toBeVisible();
      }
      if (sample.event === "ORDER_OUT_FOR_DELIVERY") {
        await expect(page.getByText("JLT Cluster C")).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const a11y = await new AxeBuilder({ page }).analyze();
      expect(a11y.violations).toEqual([]);
      expect(attempted).toEqual([]);
      if (width !== 320) {
        mkdirSync("docs/email/customer-previews", { recursive: true });
        await page.screenshot({
          path: `docs/email/customer-previews/${browserName}-${width}-${sample.event}.png`,
          fullPage: true,
        });
      }
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
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("frozen boxes with distinct compositions and Tricolor selection remain complete and private", async ({
  page,
  browserName,
}) => {
  const o = order(false);
  const spec = PACK_SPECS[0]!;
  const make = (count: number, quantity: number) => {
    const composition = [
      { componentSkuId: spec.components[0]!.componentSkuId, units: count },
      {
        componentSkuId: spec.components[1]!.componentSkuId,
        units: spec.capacity - count,
      },
    ];
    return {
      productId: spec.packSkuId,
      quantity,
      composition,
      packSnapshot: {
        version: 1 as const,
        revision: "catalog-v1-" + "a".repeat(64),
        capacity: spec.capacity,
        components: composition.map((c) => ({
          ...c,
          name:
            c.componentSkuId === spec.components[0]!.componentSkuId
              ? "Frozen Sugar · Mini"
              : "Frozen Sesame · Mini",
        })),
      },
    };
  };
  const tri = {
    productId: "conchas-traditional-tricolor-mini-40-g",
    quantity: 3,
    color: "green" as const,
  };
  o.lines = [
    make(4, 2),
    make(1, 1),
    { ...tri, packSnapshot: snapshotTricolor(tri) },
  ];
  o.catalogSnapshot = [
    { id: spec.packSkuId, name: "Accepted mixed box", priceFils: 6000 },
    { id: tri.productId, name: "Accepted Tricolor mini", priceFils: 1100 },
  ] as Order["catalogSnapshot"];
  const original = structuredClone(o);
  const email = renderCustomerEmail("ORDER_PRODUCTION_STARTED", o);
  expect(o).toEqual(original);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(email.html);
  await expect(
    page.getByText("2 × Accepted mixed box", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("1 × Accepted mixed box", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Total: 12 pieces in 2 boxes", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Total: 6 pieces in 1 box", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Selection: Green · Mini · 40 g", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("PrivateSurname");
  await expect(page.locator("body")).not.toContainText("Private Street");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  mkdirSync("docs/email/customer-previews", { recursive: true });
  await page.screenshot({
    path: `docs/email/customer-previews/${browserName}-390-frozen-boxes.png`,
    fullPage: true,
  });
});
