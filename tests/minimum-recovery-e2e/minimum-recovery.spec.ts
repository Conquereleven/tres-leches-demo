/**
 * TPL-21: the customer journey from a stale 5-piece hosted checkout that the
 * worker ended before Paymennt. Isolated SQLite + fake Paymennt transport;
 * the provider page is intercepted, so no external request or charge occurs.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { clickStableControl } from "../helpers/stable-control";
import {
  STALE_BODY,
  STALE_KEYS,
} from "../../playwright.minimum-recovery.config";

const origin = "http://127.0.0.1:3191";
const creates = () =>
  readFileSync(process.env.PROVIDER_CALL_LOG!, "utf8")
    .split("\n")
    .filter((l) => l.startsWith("POST ")).length;
const stale = {
  ...STALE_BODY,
  lines: [{ ...STALE_BODY.lines[0], quantity: 5 }],
};
const corrected = STALE_BODY;

test("stale 5-piece checkout: minimum shown, cart corrected, one new Paymennt attempt", async ({
  page,
  request,
}, info) => {
  const key = STALE_KEYS[info.project.name as keyof typeof STALE_KEYS];
  const shots = `work/qa/minimum-recovery/${info.project.name}`;
  // The worker already ended this job locally: no provider call, no link.
  const before = await (
    await request.post("/api/checkout/status", {
      headers: { Origin: origin },
      data: { key },
    })
  ).json();
  expect(before).toMatchObject({
    paymentStatus: "cancelled",
    rejection: "minimum_quantity",
    url: null,
    actionRequired: null,
  });
  const createsBefore = creates();

  // Returning shopper with the saved capability, draft and stale cart.
  const ready = page.waitForResponse((r) =>
    r.url().endsWith("/api/checkout/config"),
  );
  await page.goto("/");
  await (await ready).finished();
  await page.evaluate(
    ({ body, key }) => {
      localStorage.setItem("3l-cart", JSON.stringify(body.lines));
      sessionStorage.setItem(
        "3l-checkout",
        JSON.stringify({ key, fingerprint: JSON.stringify(body) }),
      );
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
    { body: stale, key },
  );

  // 1. Clear minimum indication on the payment status page, no retry link.
  await page.goto("/checkout/return");
  const main = page.locator("main");
  await expect(
    page.getByRole("heading", { name: "Payment wasn't completed" }),
  ).toBeVisible();
  await expect(main).toContainText("Minimum order: 6 pieces");
  await expect(main).toContainText(
    "Update items below the 6-piece minimum to continue.",
  );
  await expect(page.getByRole("link", { name: "TRY AGAIN" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "CONTINUE PAYMENT" }),
  ).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).include("main").analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: `${shots}-1-return.png`, fullPage: true });

  // 2. Correct the quantity to 6 in the cart.
  await page.getByRole("link", { name: "Edit cart" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.locator("[data-minimum-blocker]")).toBeVisible();
  await page.screenshot({ path: `${shots}-2-cart-stale.png`, fullPage: true });
  await page.getByRole("button", { name: "Update to 6 pieces" }).click();
  await expect(page.locator("[data-minimum-blocker]")).toHaveCount(0);
  await page.getByRole("link", { name: "CONTINUE TO FULFILLMENT" }).click();

  // 3. Recovery lands on review with a fresh, retry-ready checkout.
  await expect(
    page.getByText(/Your previous payment attempt has ended/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "CHECK PAYMENT STATUS" }),
  ).toHaveCount(0);
  const replacement = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("3l-checkout")!).key as string,
  );
  expect(replacement).not.toBe(key);
  await page.getByLabel(/I've reviewed my order/).check();
  const pay = page.getByRole("button", { name: /^PAY AED \d+/ });
  await expect(pay).toBeEnabled();
  await page.screenshot({ path: `${shots}-3-review.png`, fullPage: true });
  expect(creates()).toBe(createsBefore);

  // 4. Exactly one new hosted attempt for the corrected 6-piece order.
  await page.route("https://pay.test.paymennt.com/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<h1>Isolated provider mock — no charge</h1>",
    }),
  );
  let fresh!: { orderId: string; url: string; amountFils: number };
  let submitted: unknown;
  await page.route("**/api/checkout/web", async (route) => {
    submitted = route.request().postDataJSON();
    const response = await route.fetch();
    fresh = await response.json();
    await route.fulfill({ response });
  });
  await clickStableControl(pay);
  await expect(page).toHaveURL(/^https:\/\/pay.test.paymennt.com\/checkout\//);
  expect(creates()).toBe(createsBefore + 1);
  expect(fresh.orderId).not.toBe(before.orderId);
  expect(fresh.amountFils).toBe(before.amountFils + before.amountFils / 5);

  // 5. Other tabs, repeated recovery and replays reuse it: no second attempt.
  for (const k of [key, replacement]) {
    const resumed = await (
      await request.post("/api/checkout/resume", {
        headers: { Origin: origin },
        data: { key: k, checkout: corrected },
      })
    ).json();
    expect(resumed.key).toBe(replacement);
    expect(resumed.status).toMatchObject({
      orderId: fresh.orderId,
      url: fresh.url,
    });
  }
  // Same tab replay (exact browser body) returns the same order and link;
  // different details under that key are refused, never a second attempt.
  for (const [data, ok] of [
    [submitted, true],
    [corrected, false],
  ] as const) {
    const replay = await request.post("/api/checkout/web", {
      headers: { Origin: origin, "Idempotency-Key": replacement },
      data,
    });
    expect(replay.ok()).toBe(ok);
    if (ok)
      expect(await replay.json()).toMatchObject({
        orderId: fresh.orderId,
        url: fresh.url,
      });
  }
  expect(creates()).toBe(createsBefore + 1);
  const old = await (
    await request.post("/api/checkout/status", {
      headers: { Origin: origin },
      data: { key },
    })
  ).json();
  expect(old).toMatchObject({
    superseded: true,
    url: null,
    paymentStatus: "cancelled",
  });
});
