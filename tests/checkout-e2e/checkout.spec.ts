import { test, expect } from "@playwright/test";
test("quantity, confirmed quote, hosted handoff, pending return and WhatsApp fallback", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("https://pay.test.paymennt.com/**", (r) =>
    r.fulfill({
      body: "Hosted TEST provider fixture",
      contentType: "text/html",
    }),
  );
  await page.goto("/#bakery");
  await page
    .getByLabel("Delivery zone", { exact: true })
    .selectOption("jlt-cluster-c");
  await expect(
    page.getByRole("button", { name: "PAY SECURELY", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Your order is below the delivery minimum.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("spinbutton", { name: "Quantity" }).fill("2");
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("UAT reviewer");
  await page
    .getByRole("textbox", { name: "Phone including country code" })
    .fill("0000000000");
  await page
    .getByRole("textbox", { name: "Building, apartment and delivery address" })
    .fill("UAT building, apartment 1");
  await expect(page.locator(".b-direct-checkout")).toContainText(
    "Total: AED 50",
  );
  await expect(page.locator(".b-direct-checkout")).toContainText(
    "Delivery: FREE",
  );
  await expect(
    page.getByRole("link", { name: "ORDER VIA WHATSAPP", exact: true }),
  ).toHaveAttribute("href", /wa.me\/971521683319.*Quantity%3A%202/);
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "PAY SECURELY", exact: true }).click();
  const hosted = await popup;
  await expect(hosted).toHaveURL(/pay.test.paymennt.com\/checkout\//);
  await expect(page).toHaveURL(/checkout\/return$/);
  await expect(page.getByRole("heading")).toHaveText(
    "Checking payment status…",
  );
  await expect(page.getByText(/AED 50 · pending/)).toBeVisible();
  await page.goto("/checkout/return?status=paid");
  await expect(page.getByRole("heading")).not.toHaveText("PAYMENT CONFIRMED");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
