import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fillName } from "../fixtures/storefront-form";
import { zoneSeed } from "../../server/domain/zones";
import { workspace } from "../fixtures/ux-states";
const screenshots = "artifacts/flexible-delivery/screenshots";
for (const width of [390, 1440]) {
  for (const lang of ["en", "es", "ar"]) {
    test(`delivery fee, free threshold, pickup and cart ${lang} ${width}`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      const config = page.waitForResponse((r) =>
        r.url().endsWith("/api/checkout/config"),
      );
      await page.goto("/cart");
      await config;
      await page.evaluate(() => {
        localStorage.setItem(
          "3l-cart",
          JSON.stringify([{ productId: "pan-de-muerto", quantity: 1 }]),
        );
        sessionStorage.setItem(
          "3l-checkout-draft",
          JSON.stringify({ delivery: { zoneId: "marina" } }),
        );
      });
      await page.goto(`/checkout?lang=${lang}`);
      const main = page.locator("main");
      await expect(main).toContainText(/40|٤٠/); // AED 25 products + AED 15 delivery.
      await expect(main).toContainText(
        lang === "es"
          ? "Envío gratis"
          : lang === "ar"
            ? "توصيل مجاني"
            : "Free delivery from",
      );
      await expect(page.locator(".b-shop-grand")).toContainText(/40|٤٠/);
      const date = "2026-10-10";
      await page.locator('input[type="date"]').fill(date);
      await page
        .locator("select")
        .filter({ has: page.locator('option[value="4:00 PM – 9:00 PM"]') })
        .selectOption("4:00 PM – 9:00 PM");
      await page
        .locator('input[autocomplete="street-address"]')
        .first()
        .fill("Marina fixture address");
      // Form details are not needed for quoting. The fee is not a minimum blocker.
      expect(
        await page.locator('.b-shop-form button[type="submit"]').isEnabled(),
      ).toBe(true);
      if (width === 390) await page.locator(".b-co-summary-toggle").click();
      mkdirSync(screenshots, { recursive: true });
      await page.screenshot({
        path: `${screenshots}/${info.project.name}-${lang}-below-${width}.png`,
        fullPage: true,
      });
      if (lang === "en") {
        await page
          .getByLabel("Building or villa", { exact: true })
          .fill("Fixture Tower");
        await page
          .getByRole("button", { name: "CONTINUE TO DETAILS", exact: true })
          .click();
        await fillName(page, "Synthetic", "Reviewer");
        await page
          .getByLabel("Email for payment receipt")
          .fill("fixture@example.invalid");
        await page
          .getByLabel("Mobile number", { exact: true })
          .fill("0500000000");
        await page
          .getByRole("button", { name: "REVIEW ORDER", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "PAY AED 40", exact: true }),
        ).toBeVisible();
        if (width === 390) await page.locator(".b-co-summary-toggle").click();
        await page.screenshot({
          path: `${screenshots}/${info.project.name}-review-${width}.png`,
          fullPage: true,
        });
      }
      await page.goto(`/cart?lang=${lang}`);
      await expect(page.locator(".b-shop-grand")).toContainText(/40|٤٠/);
      await page.evaluate(() =>
        localStorage.setItem(
          "3l-cart",
          JSON.stringify([{ productId: "pan-de-muerto", quantity: 2 }]),
        ),
      );
      await page.goto(`/checkout?lang=${lang}`);
      await expect(page.locator(".b-shop-grand")).toContainText(/50|٥٠/);
      await expect(main).toContainText(
        lang === "es" ? "Gratis" : lang === "ar" ? "مجاني" : "Free",
      );
      if (width === 390) await page.locator(".b-co-summary-toggle").click();
      await page.screenshot({
        path: `${screenshots}/${info.project.name}-${lang}-free-${width}.png`,
        fullPage: true,
      });
      await page.getByRole("radio").nth(1).check();
      await expect(page.locator(".b-shop-grand")).toContainText(/50|٥٠/);
      await page.screenshot({
        path: `${screenshots}/${info.project.name}-${lang}-pickup-${width}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        lang === "ar" ? "rtl" : "ltr",
      );
      expect(errors).toEqual([]);
    });
  }
  test(`admin edits policy with preserved legacy metadata ${width}`, async ({
    page,
  }, info) => {
    const data = { ...workspace(), zones: [structuredClone(zoneSeed[0]!)] };
    const zone = data.zones[0]!;
    const policy = {
      mode: "flexible",
      freeDeliveryThresholdFils: 5000,
      belowThresholdFeeFils: 1500,
    };
    Object.assign(zone, { deliveryPolicy: policy });
    const writes: Record<string, unknown>[] = [];
    await page.route("**/api/**", async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        writes.push(body);
        Object.assign(zone, body.zone, { version: zone.version + 1 });
        return route.fulfill({ json: { id: zone.id, version: zone.version } });
      }
      return route.fulfill({ json: data });
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/operations/zones");
    await page
      .getByLabel("Free delivery threshold AED", { exact: true })
      .fill("60");
    await page
      .getByLabel("Delivery fee below threshold AED", { exact: true })
      .fill("17");
    await page.getByRole("button", { name: "Save rule", exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({
      type: "updateZone",
      zone: {
        deliveryPolicy: {
          mode: "flexible",
          freeDeliveryThresholdFils: 6000,
          belowThresholdFeeFils: 1700,
        },
        deliveryFeeAed: 0,
        freeDelivery: true,
      },
    });
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.screenshot({
      path: `${screenshots}/${info.project.name}-admin-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("server quote rejects forged shipping and reprices zone/quantity changes", async ({
  request,
  page,
}) => {
  // Browser network context supplies the same-origin header, as the real form does.
  await page.goto("/cart");
  for (const [zoneId, quantity, fee, total] of [
    ["marina", 1, 1500, 4000],
    ["marina", 2, 0, 5000],
    ["downtown", 1, 2500, 5000],
  ] as const) {
    const response = await request.post("/api/checkout/quote", {
      headers: { Origin: "http://127.0.0.1:3268" },
      data: { lines: [{ productId: "pan-de-muerto", quantity }], zoneId },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      eligible: true,
      feeFils: fee,
      totalFils: total,
    });
  }
  const response = await request.post("/api/checkout/quote", {
    headers: { Origin: "http://127.0.0.1:3268" },
    data: {
      lines: [{ productId: "pan-de-muerto", quantity: 1 }],
      zoneId: "marina",
      feeFils: 0,
    },
  });
  expect(response.ok()).toBe(false);
});
