/** Isolated SQLite + in-process Paymennt mock. No external payment API or card input. */
import { test, expect } from "@playwright/test";
import { clickStableControl } from "../helpers/stable-control";
import { setCheckoutProviderStatus } from "../fixtures/checkout-provider-control";
for (const [sku, initialQty, currentQty, oldAmount, amount] of [
  ["pan-de-muerto", 6, 15, 150, 375],
  ["fixture-36", 1, 3, 36, 108],
] as const) {
  test(`${oldAmount} → ${amount}: returning shopper gets a fresh checkout`, async ({
    page,
    request,
  }) => {
    const key = crypto.randomUUID();
    const delivery = {
      zoneId: "jlt-cluster-c",
      address: "Fixture address only",
      building: "Fixture Tower",
      date: new Date(Date.now() + 172800000).toISOString().slice(0, 10),
      slot: "4:00 PM – 9:00 PM",
    };
    const customer = {
      name: "Fixture Customer",
      phone: "0500000000",
      email: "fixture@example.invalid",
    };
    const body = {
      lines: [{ productId: sku, quantity: initialQty }],
      delivery,
      customer,
      billing: { sameAsDelivery: true },
    };
    const initial = await request.post("/api/checkout/web", {
      headers: { Origin: "http://127.0.0.1:3189", "Idempotency-Key": key },
      data: body,
    });
    expect(initial.ok()).toBe(true);
    const previous = await initial.json();
    expect(previous.amountFils).toBe(oldAmount * 100);
    // Complete homepage configuration before a fixture storage edit/navigation;
    // otherwise WebKit may tear down the document during its startup fetch.
    const configured = page.waitForResponse(
      (r) => r.url() === "http://127.0.0.1:3189/api/checkout/config",
    );
    await page.goto("/");
    const configResponse = await configured;
    expect(configResponse.status()).toBe(200);
    expect(await configResponse.finished()).toBeNull();
    await page.evaluate(
      ({ key, body }) => {
        sessionStorage.setItem(
          "3l-checkout",
          JSON.stringify({ key, fingerprint: JSON.stringify(body) }),
        );
        sessionStorage.setItem(
          "3l-checkout-draft",
          JSON.stringify({
            delivery: body.delivery,
            customer: body.customer,
            billing: body.billing,
          }),
        );
        localStorage.setItem("3l-cart", JSON.stringify(body.lines));
      },
      { key, body },
    );
    await page.goto("/checkout");
    await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();
    await clickStableControl(
      page.getByRole("button", { name: "REVIEW ORDER" }),
    );
    await expect(
      page.getByRole("link", { name: "CHECK PAYMENT STATUS" }),
    ).toBeVisible();
    // A new hosted attempt is safe only after GET proves the old one terminal.
    setCheckoutProviderStatus(previous.url, "EXPIRED");
    // Leave checkout and change the real browser cart.
    const returnedConfig = page.waitForResponse(
      (r) => r.url() === "http://127.0.0.1:3189/api/checkout/config",
    );
    await page.goto("/");
    const returnedResponse = await returnedConfig;
    expect(returnedResponse.status()).toBe(200);
    expect(await returnedResponse.finished()).toBeNull();
    await page.evaluate(
      ({ sku, currentQty }) =>
        localStorage.setItem(
          "3l-cart",
          JSON.stringify([{ productId: sku, quantity: currentQty }]),
        ),
      { sku, currentQty },
    );
    await page.goto("/cart");
    await expect(page.locator("main")).toContainText(`AED ${amount}`);
    await page.getByRole("link", { name: "CONTINUE TO FULFILLMENT" }).click();
    // Valid saved details now recover directly to review instead of step 1.
    await expect(
      page.getByRole("button", { name: "CONTINUE TO DETAILS" }),
    ).toHaveCount(0);
    await page.getByLabel(/I've reviewed my order/).check();
    const pay = page.getByRole("button", {
      name: `PAY AED ${amount}`,
      exact: true,
    });
    await expect(pay).toBeEnabled();
    await expect(
      page.getByRole("button", { name: `PAY AED ${oldAmount}`, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "CHECK PAYMENT STATUS" }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `work/qa/stale-checkout/${oldAmount}-to-${amount}-390.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: `work/qa/stale-checkout/${oldAmount}-to-${amount}-1440.png`,
      fullPage: true,
    });
    await page.route("https://pay.test.paymennt.com/**", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: "<h1>Isolated provider mock — no charge</h1>",
      }),
    );
    let fresh!: { amountFils: number; orderId: string; url: string };
    await page.route("**/api/checkout/web", async (route) => {
      const response = await route.fetch();
      fresh = await response.json();
      await route.fulfill({ response });
    });
    await pay.click();
    await expect(page).toHaveURL(
      /^https:\/\/pay.test.paymennt.com\/checkout\//,
    );
    expect(fresh.amountFils).toBe(amount * 100);
    expect(fresh.orderId).not.toBe(previous.orderId);
    expect(fresh.url).not.toBe(previous.url);
    await expect(page).toHaveURL(fresh.url);
    const old = await request.post("/api/checkout/status", {
      headers: { Origin: "http://127.0.0.1:3189" },
      data: { key },
    });
    expect(await old.json()).toMatchObject({
      superseded: true,
      url: null,
      paymentStatus: "expired",
    });
  });
}
