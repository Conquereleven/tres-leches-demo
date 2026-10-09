import { test, expect } from "@playwright/test";
import { chooseArea, fillName } from "../fixtures/storefront-form";
import { mkdirSync } from "node:fs";
const tomorrow = () =>
  new Date(Date.now() + 172800000).toISOString().slice(0, 10);
for (const width of [390, 1440]) {
  test(`delivery and pickup ${width}px: all zones, minima, separate billing and accurate totals`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // The cart page asks the server for prices. Leaving before that answer
    // arrives makes WebKit report the cancelled request as a page error, so
    // wait for it; any real page error still fails the test below.
    const config = page.waitForResponse((r) =>
      r.url().endsWith("/api/checkout/config"),
    );
    await page.goto("/cart");
    await config;
    await page.evaluate(() =>
      localStorage.setItem(
        "3l-cart",
        JSON.stringify([{ productId: "pan-de-muerto", quantity: 1 }]),
      ),
    );
    await page.goto("/checkout");
    // Focusing the empty field lists every approved area, as the dropdown did.
    await page
      .getByRole("combobox", { name: "Delivery area", exact: true })
      .focus();
    await expect(
      page.getByRole("listbox", { name: "Delivery area" }).getByRole("option"),
    ).toHaveCount(94);
    await chooseArea(page, "Dubai Mar", "Marina");
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
    const area = page.getByRole("combobox", {
      name: "Delivery area",
      exact: true,
    });
    // Typed by name or alias; the minimum always comes from the resolved area.
    for (const [typed, min] of [
      ["JLT Cluster C", 30],
      ["Jumeirah Village Circle", 100],
      ["Dubai Hills", 150],
      ["Dubai Investments Park", 200],
      ["Damac Hills", 250],
      ["Downtown Dubai", 300],
    ] as const) {
      await area.fill(typed);
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
    await expect(page.locator("main")).toContainText("Pickup · 3L Pastelerías");
    await page.getByLabel("Pickup date").fill(tomorrow());
    await page
      .getByRole("combobox", { name: "Pickup time", exact: true })
      .selectOption("4:00 PM – 9:00 PM");
    await expect(
      page.getByRole("button", { name: "CONTINUE TO DETAILS" }),
    ).toBeEnabled();
    await page.screenshot({
      path: `work/qa/delivery-pickup/pickup-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();
    await fillName(page, "Pickup", "UAT Reviewer");
    await page
      .getByLabel("Email for payment receipt")
      .fill("uat@example.invalid");
    await page.getByLabel("Mobile number").fill("0500000000");
    await expect(
      page.getByLabel("Billing address is the same as delivery address"),
    ).toHaveCount(0);
    // Pickup asks only for what the payment provider requires.
    await expect(page.getByLabel("Name on billing address")).toHaveCount(0);
    await expect(page.getByLabel("Address line 2")).toHaveCount(0);
    await page
      .getByLabel("Street address", { exact: true })
      .fill("UAT billing fixture address");
    await page.getByLabel("City", { exact: true }).fill("Dubai");
    await expect(page.getByLabel("Country", { exact: true })).toHaveValue(
      "United Arab Emirates",
    );
    await expect(
      page.getByLabel("Country", { exact: true }),
    ).not.toBeEditable();
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
