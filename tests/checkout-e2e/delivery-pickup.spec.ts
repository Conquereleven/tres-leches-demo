import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const tomorrow = () =>
  new Date(Date.now() + 86400000).toISOString().slice(0, 10);
for (const width of [390, 1440]) {
  test(`delivery and pickup ${width}px: all zones, minima, separate billing and accurate totals`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/cart");
    await page.evaluate(() =>
      localStorage.setItem(
        "3l-cart",
        JSON.stringify([{ productId: "pan-de-muerto", quantity: 1 }]),
      ),
    );
    await page.goto("/checkout");
    const area = page.getByLabel("Delivery area");
    await expect(area.locator("option")).toHaveCount(95); //93 zones + prompt + out-of-coverage
    await area.selectOption("marina");
    await expect(
      page.getByText(/The minimum order for Marina is AED 50/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "CONTINUE TO DETAILS" }),
    ).toBeDisabled();
    mkdirSync("work/qa/delivery-pickup", { recursive: true });
    await page.screenshot({
      path: `work/qa/delivery-pickup/delivery-${width}.png`,
      fullPage: true,
    });
    for (const [id, min] of [
      ["jlt-cluster-c", 30],
      ["jvc", 100],
      ["dubai-hills", 150],
      ["dip", 200],
      ["damac-hills", 250],
      ["downtown", 300],
    ] as const) {
      await area.selectOption(id);
      await expect(
        page.getByText(new RegExp(`minimum order.*AED ${min}`)),
      ).toBeVisible();
    }
    await page.getByRole("radio", { name: "PICKUP", exact: true }).check();
    await expect(area).toHaveCount(0);
    await expect(page.getByLabel("Street address and community")).toHaveCount(
      0,
    );
    await expect(
      page.locator("main").getByText(/Golositalia JLT/),
    ).toBeVisible();
    await page.getByLabel("Pickup date").fill(tomorrow());
    await page.getByLabel("Preferred pickup time").fill("Afternoon");
    await expect(
      page.getByRole("button", { name: "CONTINUE TO DETAILS" }),
    ).toBeEnabled();
    await page.screenshot({
      path: `work/qa/delivery-pickup/pickup-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();
    await page.getByLabel("Full name").fill("Pickup UAT Reviewer");
    await page
      .getByLabel("Email for payment receipt")
      .fill("uat@example.invalid");
    await page.getByLabel("Mobile number").fill("0500000000");
    await expect(
      page.getByLabel("Billing address is the same as delivery address"),
    ).toHaveCount(0);
    await page
      .getByLabel("Name on billing address")
      .fill("Pickup UAT Reviewer");
    await page
      .getByLabel("Address line 1", { exact: true })
      .fill("UAT billing fixture address");
    await page.getByLabel("City", { exact: true }).fill("Dubai");
    await page.getByRole("combobox", { name: /^Country/ }).selectOption("AE");
    await page.getByRole("button", { name: "REVIEW ORDER" }).click();
    await expect(
      page.getByRole("region", { name: "Order review" }),
    ).toContainText("Pickup");
    await expect(
      page.getByRole("button", { name: "PAY AED 25", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `work/qa/delivery-pickup/pickup-review-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    // No payment submission: fixture-only quote and form review.
  });
}
