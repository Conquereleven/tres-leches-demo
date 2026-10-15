import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { packCopy } from "../../shared/pack-copy";
import { PACK_SPECS, componentName } from "../../shared/pack-composition";
const shots = "work/qa/packs";
mkdirSync(shots, { recursive: true });
const product = "/menu?product=pan-de-muerto-filled-pack";
const fill = async (page: Page, lang = "en", n = 12, i = 4) => {
  const spec = PACK_SPECS.find(
    (s) =>
      s.family === "filled" && s.capacity === 12 && s.size === "individuales",
  )!;
  await page
    .locator(".b-pack-builder")
    .getByRole("spinbutton", {
      name: componentName(spec.components[i]!.componentSkuId, lang),
      exact: true,
    })
    .fill(String(n));
};
for (const width of [390, 768, 1440])
  for (const lang of ["en", "es", "ar"] as const)
    test(`${width}px ${lang}: custom choice, cart persistence, editing and fixed checkout price`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${product}&lang=${lang}`);
      await expect(page.locator(".b-pack-builder")).toBeVisible();
      const select = page.locator(".b-menu-selectors select");
      const individual = await select.locator("option").allTextContents();
      await select.selectOption({
        label: individual.find((v) => /12/.test(v) && !/mini|صغير/.test(v))!,
      });
      await expect(page.locator(".b-add-to-cart > button")).toBeDisabled();
      await fill(page, lang);
      await expect(page.locator(".b-add-to-cart > button")).toBeEnabled();
      await expect(page.locator(".b-pack-builder")).toContainText("12 / 12");
      expect(
        (await new AxeBuilder({ page }).include(".b-pack-builder").analyze())
          .violations,
      ).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300); // Let the existing sticky-header transition settle for evidence.
      await page.screenshot({
        path: `${shots}/${info.project.name}-${width}-${lang}-product.png`,
        fullPage: true,
      });
      await page.locator(".b-add-to-cart > button").click();
      await page.goto(`/cart?lang=${lang}`);
      await expect(page.locator(".b-co-item")).toHaveCount(1);
      await expect(page.locator(".b-pack-composition")).toContainText("12");
      await page.reload();
      await expect(page.locator(".b-pack-composition")).toContainText("12");
      await page.locator(".b-pack-edit summary").click();
      const spec = PACK_SPECS.find(
        (s) =>
          s.family === "filled" &&
          s.capacity === 12 &&
          s.size === "individuales",
      )!;
      await page
        .locator(".b-pack-builder")
        .getByRole("spinbutton", {
          name: componentName(spec.components[4]!.componentSkuId, lang),
          exact: true,
        })
        .fill("8");
      await page
        .locator(".b-pack-builder")
        .getByRole("spinbutton", {
          name: componentName(spec.components[1]!.componentSkuId, lang),
          exact: true,
        })
        .fill("4");
      await page
        .locator(".b-pack-edit")
        .getByRole("button", { name: packCopy(lang).save, exact: true })
        .click();
      await expect(page.locator(".b-pack-composition")).toContainText("8");
      await expect(page.locator(".b-pack-composition")).toContainText("4");
      await page.goto(`${product}&lang=${lang}`);
      await page.locator(".b-menu-selectors select").selectOption({
        label: individual.find((v) => /12/.test(v) && !/mini|صغير/.test(v))!,
      });
      await fill(page, lang, 12, 2);
      await page.locator(".b-add-to-cart > button").click();
      await page.goto(`/cart?lang=${lang}`);
      await expect(page.locator(".b-co-item")).toHaveCount(2);
      await expect(page.locator(".b-co-item-total").first()).toContainText(
        /235|٢٣٥/,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300); // Let the existing sticky-header transition settle for evidence.
      await page.screenshot({
        path: `${shots}/${info.project.name}-${width}-${lang}-cart.png`,
        fullPage: true,
      });
      await page.goto(`/checkout?lang=${lang}`);
      await expect(
        page.locator(".b-co-summary-items .b-pack-composition"),
      ).toHaveCount(2);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300); // Let the existing sticky-header transition settle for evidence.
      await page.screenshot({
        path: `${shots}/${info.project.name}-${width}-${lang}-checkout.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      expect(
        (
          await new AxeBuilder({ page })
            .disableRules(["color-contrast"])
            .analyze()
        ).violations.filter(
          (v) => v.impact === "critical" || v.impact === "serious",
        ),
      ).toEqual([]);
    });

test("local hosted checkout carries exact mixture to paid order, kitchen and preview-only ticket; manager cannot publish", async ({
  page,
  request,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const spec = PACK_SPECS.find(
    (s) =>
      s.family === "filled" && s.capacity === 12 && s.size === "individuales",
  )!;
  const composition = [
    { componentSkuId: spec.components[4]!.componentSkuId, units: 8 },
    { componentSkuId: spec.components[1]!.componentSkuId, units: 4 },
  ];
  const config = await (await request.get("/api/checkout/config")).json();
  const date = config.dates.min;
  const body = {
    lines: [{ productId: spec.packSkuId, quantity: 2, composition }],
    fulfillmentMethod: "pickup",
    pickup: { pickupDate: date, preferredTime: "4:00 PM – 9:00 PM" },
    customer: {
      firstName: "Pack",
      lastName: "UAT",
      phone: "0500000000",
      email: "uat@example.invalid",
    },
    billing: {
      sameAsDelivery: false,
      name: "Pack UAT",
      address1: "Fixture street",
      city: "Dubai",
      country: "AE",
    },
  };
  const headers = {
    Origin: "http://127.0.0.1:3272",
    "Idempotency-Key": crypto.randomUUID(),
  };
  const quote = await (
    await request.post("/api/checkout/quote", {
      headers,
      data: { lines: body.lines, fulfillmentMethod: "pickup" },
    })
  ).json();
  expect(quote.totalFils).toBe(47000);
  const response = await request.post("/api/checkout/web", {
    headers: { ...headers, "X-Checkout-Quote-Revision": quote.quoteRevision },
    data: body,
  });
  expect(response.status(), await response.text()).toBe(200);
  const checkout = await response.json();
  const replay = await request.post("/api/checkout/web", {
    headers,
    data: body,
  });
  expect((await replay.json()).orderId).toBe(checkout.orderId);
  await request.post("/__fixture/paid");
  const status = await request.post("/api/checkout/reconcile", {
    headers,
    data: { key: headers["Idempotency-Key"] },
  });
  expect(status.status(), await status.text()).toBe(200);
  expect((await status.json()).paymentStatus).toBe("paid");
  const login = await page.request.post("/api/login", {
    headers,
    data: { id: "admin", password: "pack-fixture-password" },
  });
  expect(login.status()).toBe(200);
  await page.goto(`/operations/orders/${checkout.orderId}`);
  await expect(page.getByText(/Pistachio × 8/).first()).toBeVisible();
  await expect(page.getByText(/Chocolate × 4/).first()).toBeVisible();
  await page.screenshot({
    path: `${shots}/${info.project.name}-order.png`,
    fullPage: true,
  });
  await page.goto("/operations/production");
  await expect(page.getByText(/Pistachio × 8/).first()).toBeVisible();
  await page.screenshot({
    path: `${shots}/${info.project.name}-kitchen.png`,
    fullPage: true,
  });
  await page.goto("/operations/print");
  await page
    .getByRole("combobox", { name: "Order", exact: true })
    .selectOption(checkout.orderId);
  await expect(page.getByText(/Pistachio × 8/).first()).toBeVisible();
  await page.screenshot({
    path: `${shots}/${info.project.name}-ticket.png`,
    fullPage: true,
  });
  await page.goto("/operations/products");
  await page.getByText("Pack flavor eligibility", { exact: true }).click();
  await page.screenshot({
    path: `${shots}/${info.project.name}-hub.png`,
    fullPage: true,
  });
  const managerLogin = await page.request.post("/api/login", {
    headers,
    data: { id: "manager", password: "pack-fixture-password" },
  });
  expect(managerLogin.status(), await managerLogin.text()).toBe(200);
  const managerCookie = managerLogin.headers()["set-cookie"]?.split(";")[0];
  const managerHeaders = { ...headers, Cookie: managerCookie };
  const managerViewResponse = await page.request.get("/api/product-hub", {
    headers: managerHeaders,
  });
  expect(managerViewResponse.status(), await managerViewResponse.text()).toBe(
    200,
  );
  const view = await managerViewResponse.json();
  expect(view.permissions.canPublish).toBe(false);
  const denied = await page.request.post("/api/product-hub/commands", {
    headers: managerHeaders,
    data: {
      type: "publish",
      expectedVersion: view.version,
      expectedPublishedRevision: view.published.id,
    },
  });
  expect(denied.status()).toBe(403);
});

test("customer completes local product → cart → checkout → hosted TEST double → return with immutable mix", async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(product + "&lang=en");
  await expect(page.locator(".b-pack-builder")).toBeVisible();
  await page
    .locator(".b-menu-selectors select")
    .selectOption("12 individuales");
  await fill(page, "en", 8, 4);
  await fill(page, "en", 4, 1);
  await page.locator(".b-add-to-cart > button").click();
  await page.goto("/cart");
  await page
    .getByRole("link", { name: "CONTINUE TO FULFILLMENT", exact: true })
    .click();
  const { chooseArea, fillName } = await import("../fixtures/storefront-form");
  await chooseArea(page, "JVC");
  await page
    .getByLabel("Street address and community")
    .fill("Fixture JVC street");
  await page.getByLabel("Building or villa").fill("Fixture tower");
  const cfg = await (await page.request.get("/api/checkout/config")).json();
  await page.getByLabel("Delivery date", { exact: true }).fill(cfg.dates.min);
  const cutoff = page.getByRole("dialog");
  if (await cutoff.isVisible())
    await cutoff.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Delivery time", exact: true })
    .selectOption("4:00 PM – 9:00 PM");
  const continueButton = page.getByRole("button", {
    name: "CONTINUE TO DETAILS",
    exact: true,
  });
  await expect(continueButton).toBeEnabled();
  await continueButton.click({ timeout: 15000 });
  await fillName(page, "Local", "Pack UAT");
  await page
    .getByLabel("Email for payment receipt")
    .fill("pack@example.invalid");
  await page.getByLabel("Mobile number").fill("0500000000");
  await page.getByRole("button", { name: "REVIEW ORDER", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "PAY AED 235", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".b-pack-composition").first()).toContainText(
    "Pistachio × 8",
  );
  await page.screenshot({
    path: `${shots}/${info.project.name}-payment-review.png`,
    fullPage: true,
  });
  await context.route("https://pay.test.paymennt.com/checkout/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<h1>Local Paymennt TEST double</h1>",
    }),
  );
  await page.getByRole("checkbox", { name: /I've reviewed/ }).check();
  const submitted = page.waitForRequest(
    (r) => r.url().endsWith("/api/checkout/web") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "PAY AED 235", exact: true }).click();
  const sent = await submitted;
  expect(
    sent
      .postDataJSON()
      .lines[0].composition.reduce(
        (n: number, c: { units: number }) => n + c.units,
        0,
      ),
  ).toBe(12);
  await page.waitForURL(/^https:\/\/pay.test.paymennt.com\/checkout\//, {
    waitUntil: "load",
  });
  await page.request.post("http://127.0.0.1:3272/__fixture/paid");
  await page.goto("http://127.0.0.1:3272/checkout/return");
  await expect(
    page.getByText("Your order is confirmed", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".b-pack-composition")).toContainText(
    "Pistachio × 8",
  );
  await page.screenshot({
    path: `${shots}/${info.project.name}-paid-return.png`,
    fullPage: true,
  });
});

test("published eligibility refreshes an open builder; private manager drafts never affect customers", async ({
  page,
}, info) => {
  await page.goto(product + "&lang=en");
  await page
    .locator(".b-menu-selectors select")
    .selectOption("12 individuales");
  await fill(page, "en", 12, 4);
  await expect(page.locator(".b-add-to-cart > button")).toBeEnabled();
  const origin = "http://127.0.0.1:3272";
  const login = async (id: string) => {
    const r = await page.request.post("/api/login", {
      headers: { Origin: origin },
      data: { id, password: "pack-fixture-password" },
    });
    expect(r.status()).toBe(200);
    return r.headers()["set-cookie"].split(";")[0]!;
  };
  const admin = await login("admin"),
    manager = await login("manager");
  const view = async (cookie: string) => {
    const r = await page.request.get("/api/product-hub", {
      headers: { Cookie: cookie },
    });
    expect(r.status()).toBe(200);
    return r.json();
  };
  const initial = await view(admin),
    original = initial.packEligibility;
  const spec = PACK_SPECS.find(
    (s) =>
      s.family === "filled" && s.capacity === 12 && s.size === "individuales",
  )!;
  const changed = original.map(
    (r: { packSkuId: string; componentSkuIds: string[] }) =>
      r.packSkuId === spec.packSkuId
        ? {
            ...r,
            componentSkuIds: r.componentSkuIds.filter(
              (id: string) => id !== spec.components[4]!.componentSkuId,
            ),
          }
        : r,
  );
  const command = async (cookie: string, data: unknown) => {
    const r = await page.request.post("/api/product-hub/commands", {
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data,
    });
    expect(r.status(), await r.text()).toBe(200);
  };
  try {
    await command(manager, {
      type: "savePackEligibility",
      expectedVersion: initial.version,
      rules: changed,
    });
    const publicBefore = await (
      await page.request.get("/api/storefront/catalog")
    ).json();
    expect(publicBefore.revision).toBe(initial.published.id);
    await expect(page.locator(".b-add-to-cart > button")).toBeEnabled();
    const v = await view(admin);
    await command(admin, {
      type: "publish",
      expectedVersion: v.version,
      expectedPublishedRevision: v.published.id,
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator(".b-add-to-cart > button")).toBeDisabled();
    await expect(page.locator(".b-pack-builder")).toContainText(
      packCopy("en").disabled,
    );
    await fill(page, "en", 0, 4);
    await fill(page, "en", 12, 1);
    await expect(page.locator(".b-add-to-cart > button")).toBeEnabled();
    await page.screenshot({
      path: `${shots}/${info.project.name}-changed-eligibility.png`,
      fullPage: true,
    });
  } finally {
    const v = await view(admin);
    await command(admin, {
      type: "savePackEligibility",
      expectedVersion: v.version,
      rules: original,
    });
    const d = await view(admin);
    await command(admin, {
      type: "publish",
      expectedVersion: d.version,
      expectedPublishedRevision: d.published.id,
    });
  }
});
