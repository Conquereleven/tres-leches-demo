/** TPL-2 · P0 12 Nov 2026: a changed cart beside an open hosted attempt. Fake provider only. */
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setCheckoutProviderStatus } from "../fixtures/checkout-provider-control";
const origin = "http://127.0.0.1:3189";
const OPEN = /still has an open payment/;

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
  // The customer returns from Paymennt and edits the delivery note.
  await page.evaluate(
    ({ body, key }) => {
      localStorage.setItem("3l-cart", JSON.stringify(body.lines));
      sessionStorage.setItem("3l-checkout", JSON.stringify({ key }));
      sessionStorage.setItem(
        "3l-checkout-draft",
        JSON.stringify({
          step: 3,
          delivery: { ...body.delivery, notes: "Changed after Paymennt" },
          customer: body.customer,
          billing: body.billing,
        }),
      );
    },
    { body, key },
  );
  await page.route("https://pay.test.paymennt.com/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<h1>Fake provider only</h1>",
    }),
  );
  const resumes: number[] = [];
  let creates = 0;
  page.on("response", (r) => {
    if (r.url().endsWith("/api/checkout/resume")) resumes.push(r.status());
  });
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/checkout/web"))
      creates++;
  });
  return { body, key, previous, resumes, creates: () => creates };
}

test("changed cart beside an open attempt shows that attempt, never a 409 loop, and continues it on Paymennt", async ({
  page,
  request,
}) => {
  const f = await prepare(page, request);
  await page.goto("/checkout");
  const panel = page.locator(".b-co-card[role=alert]");
  await expect(panel).toContainText(OPEN);
  await expect(panel).toContainText(f.previous.orderId);
  await expect(page.getByText("We're confirming your payment")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "CHECK AGAIN" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /^PAY AED/ })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "CONTINUE PAYMENT", exact: true }),
  ).toHaveCount(0);
  expect(f.resumes.length).toBeGreaterThan(0);
  expect(f.resumes.every((s) => s === 200)).toBe(true);
  await page.screenshot({
    path: `work/tpl-2/${test.info().project.name}-open-attempt.png`,
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // Authoritative status of the previous attempt, with its own number and amount.
  await page
    .getByRole("link", { name: "CHECK PAYMENT STATUS", exact: true })
    .click();
  await expect(page).toHaveURL(/\/checkout\/return$/);
  await expect(page.locator("main")).toContainText(f.previous.orderId);
  await expect(page.locator("main")).toContainText("AED 108");
  const cont = page.getByRole("link", {
    name: "CONTINUE PAYMENT",
    exact: true,
  });
  await expect(cont).toHaveAttribute("href", f.previous.url);
  await page.screenshot({
    path: `work/tpl-2/${test.info().project.name}-return-continue.png`,
    fullPage: true,
  });
  await cont.click();
  await expect(
    page.getByRole("heading", { name: "Fake provider only" }),
  ).toBeVisible();
  await page.screenshot({
    path: `work/tpl-2/${test.info().project.name}-fake-hosted.png`,
  });
  expect(f.creates()).toBe(0);
});

test("after the previous attempt is authoritatively EXPIRED the changed cart pays once", async ({
  page,
  request,
}) => {
  const f = await prepare(page, request);
  await page.goto("/checkout");
  await expect(page.locator(".b-co-card[role=alert]")).toContainText(OPEN);
  setCheckoutProviderStatus(f.previous.url, "EXPIRED");
  await page.reload();
  const pay = page.getByRole("button", { name: "PAY AED 108", exact: true });
  await expect(pay).toBeVisible();
  await page.getByLabel(/I've reviewed my order/).check();
  await pay.click();
  await expect(
    page.getByRole("heading", { name: "Fake provider only" }),
  ).toBeVisible();
  expect(f.creates()).toBe(1);
  expect(page.url()).not.toBe(f.previous.url);
  expect(f.resumes.every((s) => s === 200)).toBe(true);
});

test("an unverifiable provider stays held and CHECK AGAIN is bounded", async ({
  page,
  request,
}) => {
  const f = await prepare(page, request);
  await page.route("**/api/checkout/resume", (r) =>
    r.fulfill({
      status: 503,
      json: {
        message:
          "The payment result could not be verified. Your order is held for review.",
      },
    }),
  );
  await page.goto("/checkout?recover=1");
  await expect(page.getByText("We're confirming your payment")).toBeVisible();
  const again = page.getByRole("button", { name: "CHECK AGAIN" });
  let clicks = 0;
  while (clicks < 5) {
    await expect(page.locator(".b-co-state")).toBeVisible();
    if (!(await again.count())) break;
    const checked = page.waitForResponse((r) =>
      r.url().endsWith("/api/checkout/resume"),
    );
    await again.click();
    await checked;
    clicks++;
  }
  // The first failure counts too: three unverified checks in a row end the loop.
  expect(clicks).toBe(2);
  await expect(again).toHaveCount(0);
  await expect(
    page.getByText("Please check again in a moment, or contact us."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^PAY AED/ })).toHaveCount(0);
  expect(f.creates()).toBe(0);
});

test("a PAID previous attempt with the same cart shows it is already paid; no second charge", async ({
  page,
  request,
}) => {
  const f = await prepare(page, request);
  setCheckoutProviderStatus(f.previous.url, "PAID");
  await page.evaluate(
    (body) =>
      sessionStorage.setItem(
        "3l-checkout-draft",
        JSON.stringify({
          step: 3,
          delivery: body.delivery,
          customer: body.customer,
          billing: body.billing,
        }),
      ),
    f.body,
  );
  await page.goto("/checkout");
  await expect(page.getByText("This order is already paid")).toBeVisible();
  await expect(page.getByRole("button", { name: /^PAY AED/ })).toHaveCount(0);
  expect(f.creates()).toBe(0);
});
