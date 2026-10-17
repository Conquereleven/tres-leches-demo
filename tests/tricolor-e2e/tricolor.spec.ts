import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { tricolorCopy } from "../../shared/tricolor";
const shots = "docs/tricolor/screenshots";
mkdirSync(shots, { recursive: true });
for (const width of [390, 768, 1440])
  for (const lang of ["en", "es", "ar"] as const)
    test(`Tricolor ${width} ${lang}: singles, colors, fixed packs, cart persistence and checkout`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const copy = tricolorCopy[lang];
      await page.goto(
        `/menu?product=conchas-traditional--tricolor&lang=${lang}`,
      );
      await expect(page.locator(".b-add-to-cart > button")).toBeDisabled();
      const sizes = page.locator(".b-menu-selectors select").first();
      const ids = await sizes
        .locator("option")
        .evaluateAll((options) =>
          options.map((o) => (o as HTMLOptionElement).value),
        );
      for (const [i, sku] of ids.entries()) {
        await sizes.selectOption(sku);
        await expect(page.locator(".b-menu-price")).toContainText(
          /mini/i.test(sku) ? /11|١١/ : /13|١٣/,
        );
        const color = page.getByRole("combobox", {
          name: copy.color,
          exact: true,
        });
        await color.selectOption(i === 0 ? "red" : "white");
        await expect(page.locator(".b-add-to-cart > button")).toBeEnabled();
        await page.screenshot({
          path: `${shots}/${info.project.name}-${width}-${lang}-single-${i}.png`,
          fullPage: true,
        });
        await page.locator(".b-add-to-cart > button").click();
      }
      await sizes.selectOption(ids[0]!);
      await page
        .getByRole("combobox", { name: copy.color, exact: true })
        .selectOption("green");
      await page.locator(".b-add-to-cart > button").click();
      await page.goto(`/menu?product=conchas-tricolor-pack&lang=${lang}`);
      await expect(
        page.getByRole("combobox", { name: copy.color, exact: true }),
      ).toHaveCount(0);
      const packSizes = page.locator(".b-menu-selectors select").first();
      for (const [i, sku] of (
        await packSizes
          .locator("option")
          .evaluateAll((options) =>
            options.map((o) => (o as HTMLOptionElement).value),
          )
      ).entries()) {
        await packSizes.selectOption(sku);
        await expect(page.locator(".b-menu-price")).toContainText(
          /mini/i.test(sku) ? /33|٣٣/ : /39|٣٩/,
        );
        await expect(page.locator(".b-pack-composition")).toContainText(
          copy.pack,
        );
        await page.screenshot({
          path: `${shots}/${info.project.name}-${width}-${lang}-pack-${i}.png`,
          fullPage: true,
        });
        await page.locator(".b-add-to-cart > button").click();
      }
      await page.goto(`/cart?lang=${lang}`);
      await expect(page.locator(".b-co-item")).toHaveCount(5);
      const cartColor = page
        .getByRole("combobox", { name: copy.color, exact: true })
        .first();
      await cartColor.selectOption("white");
      await page.reload();
      await expect(cartColor).toHaveValue("white");
      await cartColor.selectOption("red");
      await page.reload();
      await expect(cartColor).toHaveValue("red");
      await expect(page.locator(".b-co-item")).toHaveCount(5);
      await expect(
        page.getByRole("combobox", { name: copy.color, exact: true }),
      ).toHaveCount(3);
      await page.screenshot({
        path: `${shots}/${info.project.name}-${width}-${lang}-cart.png`,
        fullPage: true,
      });
      await page.goto(`/checkout?lang=${lang}`);
      await expect(
        page.locator(".b-co-summary-items .b-pack-composition"),
      ).toHaveCount(5);
      await page.screenshot({
        path: `${shots}/${info.project.name}-${width}-${lang}-checkout.png`,
        fullPage: true,
      });
    });
for (const width of [390, 1440])
  test(`kitchen email ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.setContent(
      readFileSync("docs/tricolor/fictional-kitchen.html", "utf8"),
    );
    await expect(page.getByText(/^INSIDE (THIS|EACH) BOX:$/)).toHaveCount(2);
    await expect(page.getByText(/TOTAL: 6 pieces/)).toBeVisible();
    await page.screenshot({
      path: `${shots}/${info.project.name}-${width}-email.png`,
      fullPage: true,
    });
  });
test("paid synthetic order: confirmation and OMS retain color and physical-piece totals", async ({
  page,
  request,
}, info) => {
  const headers = {
    Origin: "http://127.0.0.1:3272",
    "Idempotency-Key": crypto.randomUUID(),
  };
  const lines = [
    {
      productId: "conchas-traditional-tricolor-mini-40-g",
      quantity: 2,
      color: "green",
    },
    { productId: "conchas-tricolor-pack-3-individuales", quantity: 2 },
  ];
  const config = await (await request.get("/api/checkout/config")).json();
  const quote = await (
    await request.post("/api/checkout/quote", {
      headers,
      data: { lines, fulfillmentMethod: "pickup" },
    })
  ).json();
  expect(quote.totalFils).toBe(10000);
  const response = await request.post("/api/checkout/web", {
    headers: { ...headers, "X-Checkout-Quote-Revision": quote.quoteRevision },
    data: {
      lines,
      fulfillmentMethod: "pickup",
      pickup: {
        pickupDate: config.dates.min,
        preferredTime: "4:00 PM – 9:00 PM",
      },
      customer: {
        firstName: "Fictional",
        lastName: "Tricolor QA",
        phone: "0500000000",
        email: "qa@example.invalid",
      },
      billing: {
        sameAsDelivery: false,
        name: "Fictional QA",
        address1: "Fixture street",
        city: "Dubai",
        country: "AE",
      },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  const order = await response.json();
  await request.post("/__fixture/paid");
  const reconciled = await request.post("/api/checkout/reconcile", {
    headers,
    data: { key: headers["Idempotency-Key"] },
  });
  expect((await reconciled.json()).paymentStatus).toBe("paid");
  await page.goto("/cart");
  await page.evaluate(
    (key) => sessionStorage.setItem("3l-checkout", JSON.stringify({ key })),
    headers["Idempotency-Key"],
  );
  await page.goto("/checkout/return");
  await expect(
    page.locator(".b-co-summary-items .b-pack-composition"),
  ).toHaveCount(2);
  await expect(
    page.getByText(/Total physical pieces: 6/).first(),
  ).toBeVisible();
  await page.screenshot({
    path: `${shots}/${info.project.name}-confirmation.png`,
    fullPage: true,
  });
  const login = await request.post("/api/login", {
    headers,
    data: { id: "admin", password: "pack-fixture-password" },
  });
  expect(login.status()).toBe(200);
  const cookie = login
    .headers()
    ["set-cookie"]!.split(";")[0]!
    .slice("tl_session=".length);
  await page.context().addCookies([
    {
      name: "tl_session",
      value: cookie,
      url: "http://127.0.0.1:3272",
      httpOnly: true,
      secure: false,
      sameSite: "Strict",
    },
  ]);
  await page.goto(`/operations/orders/${order.orderId}`);
  await expect(
    page.getByText(/Total physical pieces: 6/).first(),
  ).toBeVisible();
  await expect(page.getByText(/Green · Mini · 40 g/).first()).toBeVisible();
  await page.screenshot({
    path: `${shots}/${info.project.name}-oms.png`,
    fullPage: true,
  });
  await page.goto("/operations/print");
  await page
    .getByRole("combobox", { name: "Order", exact: true })
    .selectOption(order.orderId);
  await expect(
    page.getByText(/Total physical pieces: 6/).first(),
  ).toBeVisible();
  await page.screenshot({
    path: `${shots}/${info.project.name}-ticket.png`,
    fullPage: true,
  });
});
