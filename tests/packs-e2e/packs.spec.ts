import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { packCopy } from "../../shared/pack-copy";
import { PACK_SPECS, componentName } from "../../shared/pack-composition";
const shots = "work/qa/packs";
mkdirSync(shots, { recursive: true });
// Canonical V3.2: the retired legacy /menu product page is gone. Pack
// customization now happens in the approved V3.2 purchase dialog (ref32) and
// cart editing in the canonical V3.2 cart (v32-new-*), reusing the same
// PackBuilder/packComplete/cart.edit commercial primitives.
const PACK_12 = "pan-de-muerto-filled-pack-12-individuales";
const spec12 = () =>
  PACK_SPECS.find(
    (s) =>
      s.family === "filled" && s.capacity === 12 && s.size === "individuales",
  )!;
type Lang = "en" | "es" | "ar";
test.use({ actionTimeout: 15000, navigationTimeout: 30000 });

const openPackDialog = async (page: Page, lang: Lang = "en") => {
  await page.goto(`/bakery?category=mexican&lang=${lang}`);
  // Pack cards are per family; the 12-individuales variant is chosen inside.
  const card = page.locator(
    '.ref32-product[data-product-id="pan-de-muerto-filled-pack"]',
  );
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeEnabled();
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".ref32-dialog-footer")).toBeVisible();
  const variant = dialog.locator(`button[data-sku="${PACK_12}"]`);
  await expect(variant).toBeEnabled();
  await variant.click();
  await expect(dialog).toHaveAttribute("data-selected-sku", PACK_12);
  return dialog;
};
const stepFlavor = async (
  dialog: Locator,
  lang: Lang,
  index: number,
  times: number,
) => {
  const row = dialog.locator(".ref32-composition-row", {
    hasText: componentName(spec12().components[index]!.componentSkuId, lang),
  });
  await expect(row).toBeVisible();
  for (let i = 0; i < times; i++)
    await row.getByRole("button", { name: "+", exact: true }).click();
};
const fill = async (root: Page | Locator, lang: Lang = "en", n = 12, i = 4) => {
  const spec = spec12();
  await root
    .locator(".b-pack-builder")
    .getByRole("spinbutton", {
      name: componentName(spec.components[i]!.componentSkuId, lang),
      exact: true,
    })
    .fill(String(n));
};

async function readCart(page: Page) {
  return page.evaluate(() => {
    const lines = JSON.parse(localStorage.getItem("3l-cart") ?? "[]") as Array<{
      productId: string;
      quantity: number;
      composition: { componentSkuId: string; units: number }[];
    }>;
    return lines.map(({ productId, quantity, composition }) => ({
      productId,
      quantity,
      composition: Object.fromEntries(
        composition.map(({ componentSkuId, units }) => [componentSkuId, units]),
      ),
    }));
  });
}

async function quoteCart(page: Page) {
  const lines = (await readCart(page)).map((line) => ({
    ...line,
    composition: Object.entries(line.composition).map(
      ([componentSkuId, units]) => ({
        componentSkuId,
        units,
      }),
    ),
  }));
  const response = await page.request.post("/api/checkout/quote", {
    headers: {
      Origin: "http://127.0.0.1:3272",
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: { lines, fulfillmentMethod: "pickup" },
  });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).totalFils;
}

for (const width of [390, 768, 1440])
  for (const lang of ["en", "es", "ar"] as const)
    test(`${width}px ${lang}: custom choice, cart persistence, editing and fixed checkout price`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const dialog = await openPackDialog(page, lang);
      // Negative: an incomplete composition keeps the V3.2 CTA disabled.
      await expect(dialog.locator(".ref32-buy")).toBeDisabled();
      await expect(dialog.locator(".ref32-composition-row")).toHaveCount(5);
      await stepFlavor(dialog, lang, 4, 8);
      await expect(dialog.locator(".ref32-buy")).toBeDisabled();
      await stepFlavor(dialog, lang, 1, 4);
      await expect(dialog.locator(".ref32-buy")).toBeEnabled();
      await expect(dialog.locator(".ref32-composition p")).toContainText(
        "12/12",
      );
      for (const plus of await dialog
        .locator(".ref32-composition-row")
        .getByRole("button", { name: "+", exact: true })
        .all()) {
        await expect(plus).toBeDisabled();
      }
      await expect(dialog.locator(".ref32-price strong")).toContainText(lang === "ar" ? /٢٣٥/ : /235/);
      const config = await (
        await page.request.get("/api/checkout/config")
      ).json();
      expect(
        config.products.find((p: { id: string }) => p.id === PACK_12)
          ?.priceFils,
      ).toBe(23500);
      expect(
        (await new AxeBuilder({ page }).include(".ref32-composition").analyze())
          .violations,
      ).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300); // Let the existing sticky-header transition settle for evidence.
      await page.screenshot({
        path: `${shots}/${info.project.name}-${width}-${lang}-product.png`,
        fullPage: true,
      });
      await dialog.locator(".ref32-buy").click();
      await expect(dialog).toHaveCount(0);
      await page.goto(`/cart?lang=${lang}`);
      await expect(page.locator(".v32-new-cart-row")).toHaveCount(1);
      const pistachio = spec12().components[4]!.componentSkuId;
      const chocolate = spec12().components[1]!.componentSkuId;
      const expected = (first: number, second: number) => [
        {
          productId: PACK_12,
          quantity: 1,
          composition: { [pistachio]: first, [chocolate]: second },
        },
      ];
      await expect.poll(() => readCart(page)).toEqual(expected(8, 4));
      await page.reload();
      await expect.poll(() => readCart(page)).toEqual(expected(8, 4));
      await page.locator(".v32-new-pack-edit summary").click();
      const editor = page.locator(".v32-new-pack-edit");
      await expect(editor.locator(".b-pack-builder")).toBeVisible();
      expect(
        (await new AxeBuilder({ page }).include(".v32-new-pack-edit").analyze())
          .violations,
      ).toEqual([]);
      const save = editor.getByRole("button", {
        name: packCopy(lang).save,
        exact: true,
      });
      // Negative: breaking completeness disables save until the mix is whole.
      await fill(editor, lang, 7, 4);
      await expect(save).toBeDisabled();
      await fill(editor, lang, 5, 1);
      await expect(save).toBeEnabled();
      await save.click();
      const rows = page.locator(".v32-new-cart-row");
      await expect(rows).toContainText(`${componentName(pistachio, lang)} × 7`);
      await expect(rows).toContainText(`${componentName(chocolate, lang)} × 5`);
      await expect(rows.first()).toContainText(/235|٢٣٥/);
      // Server authority: the edited composition quotes the fixed box price.
      expect(await quoteCart(page)).toBe(23500);
      await page.reload();
      await expect.poll(() => readCart(page)).toEqual(expected(7, 5));
      const dialog2 = await openPackDialog(page, lang);
      await stepFlavor(dialog2, lang, 2, 12);
      await dialog2.locator(".ref32-buy").click();
      await page.goto(`/cart?lang=${lang}`);
      await expect(page.locator(".v32-new-cart-row")).toHaveCount(2);
      await expect
        .poll(() => readCart(page))
        .toEqual([
          ...expected(7, 5),
          {
            productId: PACK_12,
            quantity: 1,
            composition: { [spec12().components[2]!.componentSkuId]: 12 },
          },
        ]);
      expect(await quoteCart(page)).toBe(47000);
      await expect(page.locator(".v32-new-cart-row").first()).toContainText(
        /235|٢٣٥/,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300); // Let the existing sticky-header transition settle for evidence.
      await page.screenshot({
        path: `${shots}/${info.project.name}-${width}-${lang}-cart.png`,
        fullPage: true,
      });
      await page.goto(`/checkout?lang=${lang}`);
      const summary = page.locator(".b-co-summary-items .b-pack-composition");
      await expect(summary).toHaveCount(2);
      await expect(summary.first()).toContainText(
        `${componentName(pistachio, lang)} × 7`,
      );
      await expect(summary.first()).toContainText(
        `${componentName(chocolate, lang)} × 5`,
      );
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
  // Authenticate with the real server, then install its fixture-only session in
  // this HTTP loopback browser context. Linux WebKit rejects Secure cookies and
  // overrides a manually supplied Cookie header on HTTP. Production still emits
  // Secure/HttpOnly cookies; no application auth or cookie policy is relaxed.
  expect(login.headers()["set-cookie"]).toContain("; HttpOnly; Secure;");
  const adminCookie = login.headers()["set-cookie"]?.split(";")[0];
  expect(adminCookie).toBeTruthy();
  await page.context().addCookies([
    {
      name: "tl_session",
      value: adminCookie!.slice("tl_session=".length),
      url: "http://127.0.0.1:3272",
      httpOnly: true,
      secure: false,
      sameSite: "Strict",
    },
  ]);
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
  const dialog = await openPackDialog(page, "en");
  await stepFlavor(dialog, "en", 4, 8);
  await stepFlavor(dialog, "en", 1, 4);
  await expect(dialog.locator(".ref32-buy")).toBeEnabled();
  await dialog.locator(".ref32-buy").click();
  await page.goto("/cart");
  await expect(page.locator(".v32-new-cart-row")).toHaveCount(1);
  await page.locator('a[href="/checkout"]').click();
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
  const dialog = await openPackDialog(page, "en");
  await stepFlavor(dialog, "en", 4, 12);
  const buy = dialog.locator(".ref32-buy");
  await expect(buy).toBeEnabled();
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
    await expect(buy).toBeEnabled();
    const v = await view(admin);
    await command(admin, {
      type: "publish",
      expectedVersion: v.version,
      expectedPublishedRevision: v.published.id,
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    // The open V3.2 dialog drops the unpublished flavor and holds the CTA.
    await expect(buy).toBeDisabled();
    await expect(dialog.locator(".ref32-composition")).not.toContainText(
      componentName(spec.components[4]!.componentSkuId, "en"),
    );
    // Recovery in the open dialog: re-selecting the variant clears the
    // now-ineligible flavor, so filling allowed flavors re-enables the CTA.
    await dialog.locator(`[data-sku="${PACK_12}"]`).click();
    await stepFlavor(dialog, "en", 1, 12);
    await expect(buy).toBeEnabled();
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
