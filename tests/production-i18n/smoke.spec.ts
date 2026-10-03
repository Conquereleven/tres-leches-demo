import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
const index: Record<string, string> = JSON.parse(
  readFileSync("src/brand/locales/source-index.json", "utf8"),
);
const copy = (s: string, l: string) => {
  if (l === "en") return s;
  const [ns, k] = index[s]!.split(":");
  return JSON.parse(readFileSync(`src/brand/locales/${l}/${ns}.json`, "utf8"))[
    k!
  ];
};
for (const locale of ["en", "es", "ar"]) {
  test(`${locale} Production delivery/pickup smoke, no payment`, async ({
    page,
    context,
  }) => {
    mkdirSync("work/qa/i18n/production", { recursive: true });
    const errors: string[] = [],
      financial: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await context.route(
      /\/api\/checkout\/(?:prepare|pay|token)|api\.(?:test\.)?paymennt\.com|graph\.facebook/,
      async (r) => {
        financial.push(r.request().url());
        await r.abort();
      },
    );
    await page.goto(`/?lang=${locale}`);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "ar" ? "rtl" : "ltr",
    );
    await expect(page.locator(".ref-hero video")).toBeVisible();
    await page.goto("/menu?product=conchas-filled--pistache");
    await page.locator("main select").selectOption("Mini");
    await page.locator("main .b-product-page .b-button").last().click();
    await page.goto("/checkout");
    await page
      .getByRole("combobox", {
        name: copy("Delivery area", locale),
        exact: true,
      })
      .selectOption("jlt-cluster-c");
    await expect(
      page.getByRole("button", {
        name: copy("CONTINUE TO DETAILS", locale),
        exact: true,
      }),
    ).toBeDisabled();
    await expect(page.locator("main")).toContainText("12");
    await page.goto("/cart");
    await page.locator(".b-quantity-input").fill("3");
    await page.locator(".b-quantity-input").press("Tab");
    const before = await page.evaluate(() => localStorage.getItem("3l-cart"));
    for (const next of ["en", "es", "ar", locale])
      await page.locator(".b-language:visible").first().selectOption(next);
    await page.reload();
    expect(await page.evaluate(() => localStorage.getItem("3l-cart"))).toBe(
      before,
    );
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await page.goto("/checkout");
    await page
      .getByRole("combobox", {
        name: copy("Delivery area", locale),
        exact: true,
      })
      .selectOption("jlt-cluster-c");
    await page
      .getByLabel(copy("Street address and community", locale), { exact: true })
      .fill("Release smoke fixture street — DO NOT FULFIL");
    await page
      .getByLabel(copy("Building or villa", locale), { exact: true })
      .fill("Release fixture");
    const date = new Date(Date.now() + 259200000).toISOString().slice(0, 10);
    await page
      .getByLabel(copy("Delivery date", locale), { exact: true })
      .fill(date);
    await page
      .getByRole("combobox", {
        name: copy("Delivery time", locale),
        exact: true,
      })
      .selectOption("4:00 PM – 9:00 PM");
    await page
      .getByRole("button", {
        name: copy("CONTINUE TO DETAILS", locale),
        exact: true,
      })
      .click();
    await page
      .getByLabel(copy("Full name", locale), { exact: true })
      .fill("Release Smoke Fixture");
    await page
      .getByLabel(copy("Email for payment receipt", locale), { exact: true })
      .fill("release@example.invalid");
    await page
      .getByLabel(copy("Mobile number", locale), { exact: true })
      .fill("0500000000");
    await page
      .getByLabel(copy("WhatsApp number (optional)", locale), { exact: true })
      .fill("+525512345678");
    await page
      .getByRole("button", { name: copy("REVIEW ORDER", locale), exact: true })
      .click();
    await expect(page.locator("button[type=submit]")).toContainText("54");
    await page.screenshot({
      path: `work/qa/i18n/production/${locale}-delivery.png`,
      fullPage: true,
    });
    // Stop at review: no prepare/pay/token request and no order creation.
    await page.goto("/checkout");
    await page
      .getByRole("radio", { name: copy("PICKUP", locale), exact: true })
      .check();
    await page
      .getByLabel(copy("Pickup date", locale), { exact: true })
      .fill(date);
    await page
      .getByRole("combobox", { name: copy("Pickup time", locale), exact: true })
      .selectOption("4:00 PM – 9:00 PM");
    await page
      .getByRole("button", {
        name: copy("CONTINUE TO DETAILS", locale),
        exact: true,
      })
      .click();
    await page
      .getByLabel(copy("Name on billing address", locale), { exact: true })
      .fill("Release Smoke Fixture");
    await page
      .getByLabel(copy("Address line 1", locale), { exact: true })
      .fill("Release billing fixture");
    await page.getByLabel(copy("City", locale), { exact: true }).fill("Dubai");
    await page
      .getByRole("combobox", { name: copy("Country", locale), exact: true })
      .selectOption("AE");
    await page
      .getByRole("button", { name: copy("REVIEW ORDER", locale), exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: copy("Order review", locale) }),
    ).toContainText(copy("Pickup", locale));
    await expect(page.locator("button[type=submit]")).toContainText("54");
    await page.screenshot({
      path: `work/qa/i18n/production/${locale}-pickup.png`,
      fullPage: true,
    });
    await page.goto("/checkout/return");
    await expect(page.locator("main")).toContainText(
      copy(
        "We can't find a checkout in this browser. If you placed an order, please contact us.",
        locale,
      ),
    );
    // Presentation-only tracking fixture on deployed assets. Reconciliation is intercepted,
    // so no historical capability or LIVE provider lookup is used.
    await page.route("**/api/checkout/reconcile", (r) =>
      r.fulfill({
        json: {
          orderId: "TL-SMOKE-FIXTURE",
          status: "Confirmed",
          paymentStatus: "paid",
          amountFils: 5400,
          currency: "AED",
          url: null,
          summary: {
            items: [
              {
                productId: "conchas-filled-pistache-mini",
                name: "Concha rellena de pistache · Mini",
                quantity: 3,
                lineFils: 5400,
              },
            ],
            subtotalFils: 5400,
            feeFils: 0,
            fulfillmentMethod: "pickup",
            pickup: { pickupDate: date, preferredTime: "4:00 PM – 9:00 PM" },
            customerName: "Release Fixture",
          },
        },
      }),
    );
    await page.evaluate(() =>
      sessionStorage.setItem(
        "3l-checkout",
        JSON.stringify({ key: "presentation-fixture-not-a-real-capability" }),
      ),
    );
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: new RegExp(copy("Thank you", locale)),
      }),
    ).toBeVisible();
    await expect(page.locator("main")).toContainText("TL-SMOKE-FIXTURE");
    await page.screenshot({
      path: `work/qa/i18n/production/${locale}-tracking-fixture.png`,
      fullPage: true,
    });
    expect(await page.locator("body").innerText()).not.toMatch(
      /Traducción pendiente|الترجمة قيد الإعداد/,
    );
    expect(financial).toEqual([]);
    expect(errors).toEqual([]);
  });
}
