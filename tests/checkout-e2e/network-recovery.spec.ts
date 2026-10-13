import { test, expect } from "@playwright/test";
import { chooseArea } from "../fixtures/storefront-form";

test("configuration outage retries without losing cart or creating payment", async ({
  page,
}) => {
  let fail = true;
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/checkout\/(web|payment)/.test(request.url())
    )
      writes.push(request.url());
  });
  await page.route("**/api/checkout/config", (route) =>
    fail
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "fixture outage" }),
        })
      : route.continue(),
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "3l-cart",
      JSON.stringify([{ productId: "pan-de-muerto", quantity: 2 }]),
    );
  });
  await page.goto("/checkout");
  const retry = page.getByRole("button", { name: "Try again", exact: true });
  await expect(retry).toBeVisible();
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS" }),
  ).toHaveCount(0);
  fail = false;
  await retry.click();
  await expect(
    page.getByRole("combobox", { name: "Delivery area", exact: true }),
  ).toBeVisible();
  await chooseArea(page, "JLT", "JLT Cluster C");
  await expect(page.locator(".b-shop-totals")).toContainText("AED 50");
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("3l-cart")!)),
  ).toEqual([{ productId: "pan-de-muerto", quantity: 2 }]);
  expect(writes).toEqual([]);
});

test("failed authoritative quote blocks checkout; a fresh area selection recovers safely", async ({
  page,
}) => {
  let fail = true;
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/checkout\/web/.test(request.url())
    )
      writes.push(request.url());
  });
  await page.route("**/api/checkout/quote", (route) =>
    fail
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "fixture unavailable" }),
        })
      : route.continue(),
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "3l-cart",
      JSON.stringify([{ productId: "pan-de-muerto", quantity: 2 }]),
    );
  });
  await page.goto("/checkout");
  await chooseArea(page, "JLT", "JLT Cluster C");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS" }),
  ).toBeDisabled();
  fail = false;
  await chooseArea(page, "JVC", "JVC");
  await expect(page.getByText(/Add AED 50 more/)).toBeVisible();
  await chooseArea(page, "JLT", "JLT Cluster C");
  await expect(page.locator(".b-shop-form")).toContainText(
    "Minimum order for JLT Cluster C is AED 30",
  );
  expect(writes).toEqual([]);
});
