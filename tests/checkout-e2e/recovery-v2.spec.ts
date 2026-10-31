import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { setCheckoutProviderStatus } from "../fixtures/checkout-provider-control";
import AxeBuilder from "@axe-core/playwright";
const origin = "http://127.0.0.1:3189";
async function prepare(page: Page, request: APIRequestContext) {
  const body = {
    lines: [{ productId: "fixture-36", quantity: 3 }],
    delivery: {
      zoneId: "jlt-cluster-c",
      address: "Synthetic delivery address",
      building: "Fixture Tower",
      unit: "12",
      date: new Date(Date.now() + 172800000).toISOString().slice(0, 10),
      slot: "4:00 PM – 9:00 PM",
      notes: "Synthetic instructions",
    },
    customer: {
      firstName: "Synthetic",
      lastName: "Buyer",
      phone: "0500000000",
      email: "fixture@example.invalid",
    },
    billing: { sameAsDelivery: true },
  };
  const key = crypto.randomUUID();
  const r = await request.post("/api/checkout/web", {
    headers: { Origin: origin, "Idempotency-Key": key },
    data: body,
  });
  expect(r.ok()).toBe(true);
  const previous = await r.json();
  const ready = page.waitForResponse((r) =>
    r.url().endsWith("/api/checkout/config"),
  );
  await page.goto("/");
  await (await ready).finished();
  await page.evaluate(
    ({ body, key }) => {
      localStorage.setItem("3l-cart", JSON.stringify(body.lines));
      sessionStorage.setItem("3l-checkout", JSON.stringify({ key }));
      sessionStorage.setItem(
        "3l-checkout-draft",
        JSON.stringify({
          step: 3,
          delivery: body.delivery,
          customer: body.customer,
          billing: body.billing,
        }),
      );
    },
    { body, key },
  );
  return { body, key, previous };
}

test("pending hosted checkout is checked and resumed directly at review, without another creation", async ({
  page,
  request,
}) => {
  const f = await prepare(page, request);
  let creates = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/checkout/web"))
      creates++;
  });
  await page.goto("/checkout");
  const link = page.getByRole("link", {
    name: "CONTINUE PAYMENT",
    exact: true,
  });
  await expect(link).toHaveAttribute("href", f.previous.url);
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^PAY AED/ })).toHaveCount(0);
  expect(creates).toBe(0);
  await page.screenshot({
    path: `work/recovery/${test.info().project.name}-pending-review.png`,
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: `work/recovery/${test.info().project.name}-pending-review-1440.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("expired return preserves all details, then creates one fresh hosted attempt on explicit pay", async ({
  page,
  request,
}) => {
  const f = await prepare(page, request);
  setCheckoutProviderStatus(f.previous.url, "EXPIRED");
  await page.goto("/checkout/return");
  await page.getByRole("link", { name: "TRY AGAIN", exact: true }).click();
  const pay = page.getByRole("button", { name: "PAY AED 108", exact: true });
  await expect(pay).toBeVisible();
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS" }),
  ).toHaveCount(0);
  await expect(page.locator("main")).toContainText(
    "Synthetic delivery address",
  );
  await expect(page.locator("main")).toContainText("Synthetic Buyer");
  await page.getByLabel(/I've reviewed my order/).check();
  let creates = 0;
  let current: { url: string; orderId: string; amountFils: number } | undefined;
  await page.route("**/api/checkout/web", async (r) => {
    creates++;
    const response = await r.fetch();
    current = await response.json();
    await r.fulfill({ response });
  });
  await page.route("https://pay.test.paymennt.com/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<h1>Fake provider only</h1>",
    }),
  );
  await page.screenshot({
    path: `work/recovery/${test.info().project.name}-expired-ready.png`,
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: `work/recovery/${test.info().project.name}-expired-ready-1440.png`,
    fullPage: true,
  });
  await pay.click();
  await expect(
    page.getByRole("heading", { name: "Fake provider only" }),
  ).toBeVisible();
  expect(creates).toBe(1);
  expect(current?.url).not.toBe(f.previous.url);
  expect(current?.orderId).not.toBe(f.previous.orderId);
  expect(current?.amountFils).toBe(10800);
  const state = await (await request.get("/api/workspace")).json();
  const order = state.orders.find(
    (o: { id: string }) => o.id === current?.orderId,
  );
  expect(order.state).toBe("Awaiting Payment");
  expect(order.delivery).toMatchObject(f.body.delivery);
  expect(order.customerDetails).toMatchObject({
    firstName: f.body.customer.firstName,
    lastName: f.body.customer.lastName,
    email: f.body.customer.email,
  });
});

test("closing the tab retains a valid draft and current capability for a new tab", async ({
  page,
  context,
  request,
}) => {
  const f = await prepare(page, request);
  await page.goto("/checkout");
  await expect(
    page.getByRole("link", { name: "CONTINUE PAYMENT", exact: true }),
  ).toBeVisible();
  await page.close();
  const next = await context.newPage();
  await next.goto("/checkout");
  await expect(
    next.getByRole("link", { name: "CONTINUE PAYMENT", exact: true }),
  ).toHaveAttribute("href", f.previous.url);
  await expect(next.locator("main")).toContainText("Synthetic Buyer");
  await expect(
    next.getByRole("button", { name: "CONTINUE TO DETAILS" }),
  ).toHaveCount(0);
});

test("expired saved date returns to fulfillment without losing address/customer/cart", async ({
  page,
  request,
}) => {
  const f = await prepare(page, request);
  setCheckoutProviderStatus(f.previous.url, "EXPIRED");
  await page.evaluate(
    (body) =>
      sessionStorage.setItem(
        "3l-checkout-draft",
        JSON.stringify({
          step: 3,
          delivery: { ...body.delivery, date: "2026-10-08" },
          customer: body.customer,
          billing: body.billing,
        }),
      ),
    f.body,
  );
  await page.goto("/checkout?recover=1");
  await expect(page.getByText(/Your saved details need review/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS" }),
  ).toBeDisabled();
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("3l-checkout-draft-recovery")!).value,
  );
  expect(saved.customer).toEqual(f.body.customer);
  expect(saved.delivery.address).toBe(f.body.delivery.address);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("3l-cart")!)),
  ).toEqual(f.body.lines);
});

for (const [locale, title] of [
  ["en", "We're confirming your payment"],
  ["es", "Estamos verificando tu pago"],
  ["ar", "نتحقق من الدفع"],
])
  test(`provider timeout: recoverable hold in ${locale}, no new payment`, async ({
    page,
    request,
  }) => {
    await prepare(page, request);
    let creates = 0,
      fail = true;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().endsWith("/api/checkout/web"))
        creates++;
    });
    await page.route("**/api/checkout/resume", (r) =>
      fail
        ? r.fulfill({
            status: 503,
            json: {
              message:
                "The payment result could not be verified. Your order is held for review.",
            },
          })
        : r.continue(),
    );
    await page.goto(`/checkout?recover=1&lang=${locale}`);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^PAY AED/ })).toHaveCount(0);
    expect(await page.locator(".b-co-state").innerText()).not.toMatch(
      /Translation pending|Traducción pendiente|الترجمة قيد الإعداد/,
    );
    if (locale === "ar")
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.screenshot({
      path: `work/recovery/${test.info().project.name}-hold-${locale}.png`,
      fullPage: true,
    });
    fail = false;
    const retry = page.locator(".b-co-state button");
    await retry.click();
    await expect(
      page.locator(".b-co-card a[href^='https://pay.test.paymennt.com/']"),
    ).toBeVisible();
    expect(creates).toBe(0);
  });
