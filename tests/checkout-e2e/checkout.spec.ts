import { test, expect } from "@playwright/test";
import { chooseArea, fillName } from "../fixtures/storefront-form";

const ORIGIN = "http://127.0.0.1:3189";
const tomorrow = () =>
  new Date(Date.now() + 172_800_000).toISOString().slice(0, 10);

test("cart → delivery → details → review → payment step", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Hosted checkout is intercepted below; no provider request or card entry.

  // Preserve the original financial regression using its explicitly retired fixture.
  // Current menu selectors and new SKUs are exercised in menu-e2e separately.
  // Seed cart only after homepage hydration/config has completed. Navigating
  // away immediately after `load` can destroy WebKit's document before its
  // React effect starts fetch(), producing an access-control page error.
  const homepageConfig = page.waitForResponse(
    (response) => response.url() === ORIGIN + "/api/checkout/config",
  );
  await page.goto("/");
  const configResponse = await homepageConfig;
  expect(configResponse.status()).toBe(200);
  expect(await configResponse.finished()).toBeNull();
  await page.evaluate(() =>
    localStorage.setItem(
      "3l-cart",
      JSON.stringify([{ productId: "pan-de-muerto", quantity: 2 }]),
    ),
  );
  await page.goto("/cart");
  await expect(page.locator("main")).toContainText("AED 50");
  await page.getByRole("link", { name: "CONTINUE TO FULFILLMENT" }).click();

  await expect(page).toHaveURL(/\/checkout$/);
  // Typing an area we do not serve offers no suggestion and blocks checkout.
  await page
    .getByRole("combobox", { name: "Delivery area", exact: true })
    .fill("Sharjah");
  await expect(
    page.getByText("We don't currently deliver to this area."),
  ).toBeVisible();
  await expect(
    page.getByText("Online delivery isn't available for your area yet."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS" }),
  ).toBeDisabled();

  await chooseArea(page, "JLT", "JLT Cluster C");
  await expect(page.locator(".b-shop-form")).toContainText(
    "Included once minimum order is reached",
  );
  await expect(page.locator(".b-shop-totals")).not.toContainText("Delivery");
  await page
    .getByLabel("Street address and community")
    .fill("Jumeirah Lakes Towers, Cluster C");
  await page.getByLabel("Building or villa").fill("UAT Tower");
  await page.getByLabel("Delivery date").fill(tomorrow());
  await page
    .getByRole("combobox", { name: "Delivery time", exact: true })
    .selectOption("4:00 PM – 9:00 PM");
  await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();

  await fillName(page, "UAT", "Reviewer");
  await page.getByLabel("Email for payment receipt").fill("uat@example.com");
  await page.getByLabel("Mobile number").fill("04 000 0000");
  await page.getByRole("button", { name: "REVIEW ORDER" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Please enter a valid UAE mobile number.",
  );
  await page.getByLabel("Mobile number").fill("050 000 0000");

  // Billing defaults to the delivery address; unticking requires its fields.
  const same = page.getByLabel(
    "Billing address is the same as delivery address",
  );
  await expect(same).toBeChecked();
  await same.uncheck();
  await expect(page.getByLabel("Address line 1")).toBeVisible();
  await page.getByRole("button", { name: "REVIEW ORDER" }).click();
  await expect(
    page.getByRole("heading", { name: "Contact details" }),
  ).toBeAttached();
  await same.check();
  await expect(page.getByLabel("Address line 1")).toHaveCount(0);
  await page.getByRole("button", { name: "REVIEW ORDER" }).click();

  const review = page.getByRole("region", { name: "Order review" });
  await expect(review).toContainText("Pan de Muerto");
  await expect(review).toContainText("× 2");
  await expect(review).toContainText("UAT Tower");
  await expect(review).toContainText("Same as delivery address");
  await expect(review).toContainText(
    "UAT Reviewer, UAT Tower, Jumeirah Lakes Towers, Cluster C, Dubai, United Arab Emirates",
  );
  await expect(
    page.getByRole("button", { name: "PAY AED 50", exact: true }),
  ).toBeDisabled();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("checkbox", { name: /I've reviewed/ }).check();
  await expect(
    page.getByRole("button", { name: "PAY AED 50", exact: true }),
  ).toBeEnabled();
  await context.route("https://pay.test.paymennt.com/checkout/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<h1>Mock Paymennt TEST checkout</h1>",
    }),
  );
  const pay = page.getByRole("button", { name: "PAY AED 50", exact: true });
  const paymentForm = page.locator("form.b-co-payment");
  await expect(paymentForm).toHaveAttribute("aria-busy", "false");
  await expect(
    page.getByRole("checkbox", { name: /I've reviewed/ }),
  ).toBeChecked();
  // The scenario has just scrolled between billing, consent and the footer.
  // Complete that movement before issuing one real pointer action. Enabled
  // alone does not establish that the same point stays on PAY during scrolling.
  await pay.evaluate((el) =>
    el.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await expect
    .poll(() =>
      pay.evaluate(async (el) => {
        const before = el.getBoundingClientRect();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const after = el.getBoundingClientRect();
        return (
          before.x === after.x &&
          before.y === after.y &&
          before.height === after.height &&
          document
            .elementFromPoint(
              after.x + after.width / 2,
              after.y + after.height / 2,
            )
            ?.closest("button") === el
        );
      }),
    )
    .toBe(true);
  const submitted = page.waitForRequest(
    (r) => r.url().endsWith("/api/checkout/web") && r.method() === "POST",
  );
  await pay.click();
  expect((await submitted).headers()["x-checkout-quote-revision"]).toMatch(
    /^[a-f0-9]{64}$/,
  );
  // URL polling can pass at navigation commit, before WebKit has finished
  // replacing the 3L document. Returning immediately races that navigation
  // and its same-origin config fetch. Complete the simulated hosted visit
  // before starting the independent return navigation, as a customer would.
  await page.waitForURL(/^https:\/\/pay.test.paymennt.com\/checkout\//, {
    waitUntil: "load",
  });
  await expect(page).toHaveURL(/^https:\/\/pay.test.paymennt.com\/checkout\//);
  await expect(
    page.getByRole("heading", { name: "Mock Paymennt TEST checkout" }),
  ).toBeVisible();
  const reconciled = page.waitForResponse(
    (response) => response.url() === ORIGIN + "/api/checkout/reconcile",
  );
  await page.goto(ORIGIN + "/checkout/return?status=paid");
  expect((await reconciled).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Thank you" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Complete your payment" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("confirmation comes from the server, never from the URL", async ({
  page,
  request,
}) => {
  await page.goto("/checkout/return?status=paid");
  await expect(page.getByRole("heading", { name: "Thank you" })).toHaveCount(0);

  const key = crypto.randomUUID();
  const prepared = await request.post("/api/checkout/prepare", {
    headers: { "Idempotency-Key": key, Origin: ORIGIN },
    data: {
      lines: [{ productId: "pan-de-muerto", quantity: 2 }],
      delivery: {
        zoneId: "jlt-cluster-c",
        address: "Jumeirah Lakes Towers, Cluster C",
        building: "UAT Tower",
        date: tomorrow(),
        slot: "4:00 PM – 9:00 PM",
      },
      customer: {
        name: "UAT reviewer",
        phone: "0500000000",
        email: "uat@example.com",
      },
      billing: { sameAsDelivery: true },
    },
  });
  expect(prepared.status(), await prepared.text()).toBe(200);
  const { orderId, amountFils } = await prepared.json();
  expect(amountFils).toBe(5000);
  const paid = await request.post("/api/checkout/token", {
    headers: { Origin: ORIGIN },
    data: {
      key,
      orderId,
      token: "ptk_test_fixture_local_only",
      email: "uat@example.com",
    },
  });
  expect((await paid.json()).paymentStatus).toBe("paid");

  await page.evaluate((k) => {
    sessionStorage.setItem("3l-checkout", JSON.stringify({ key: k }));
  }, key);
  await page.goto("/checkout/return");
  await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();
  // The customer sees the short public number; the internal reference stays internal.
  await expect(page.locator("main")).toContainText("#001");
  await expect(page.locator("main")).not.toContainText(orderId);
  await expect(page.locator("main")).toContainText("AED 50");
});

test("a paid checkout in this session cannot be paid again", async ({
  page,
  request,
  context,
}) => {
  await context.route("https://pay.test.paymennt.com/**", (r) =>
    r.fulfill({ body: "", contentType: "application/javascript" }),
  );
  const key = crypto.randomUUID();
  const delivery = {
    zoneId: "jlt-cluster-c",
    address: "Jumeirah Lakes Towers, Cluster C",
    building: "UAT Tower",
    date: tomorrow(),
    slot: "4:00 PM – 9:00 PM",
  };
  const customer = {
    name: "UAT reviewer",
    phone: "0500000000",
    email: "uat@example.com",
  };
  const prepared = await request.post("/api/checkout/prepare", {
    headers: { "Idempotency-Key": key, Origin: ORIGIN },
    data: {
      lines: [{ productId: "pan-de-muerto", quantity: 2 }],
      delivery,
      customer,
      billing: { sameAsDelivery: true },
    },
  });
  const { orderId } = await prepared.json();
  await request.post("/api/checkout/token", {
    headers: { Origin: ORIGIN },
    data: {
      key,
      orderId,
      token: "ptk_test_fixture_local_only",
      email: customer.email,
    },
  });
  // Same cart and fulfillment must keep the paid order protected.
  // Match the first checkout scenario: don't tear down an initializing WebKit
  // document while its configuration fetch is still in flight.
  const homepageConfig = page.waitForResponse(
    (response) => response.url() === ORIGIN + "/api/checkout/config",
  );
  await page.goto("/");
  const configResponse = await homepageConfig;
  expect(configResponse.status()).toBe(200);
  expect(await configResponse.finished()).toBeNull();
  await page.evaluate(
    ([k, d, c]) => {
      sessionStorage.setItem(
        "3l-checkout",
        JSON.stringify({ key: k, fingerprint: "earlier" }),
      );
      sessionStorage.setItem(
        "3l-checkout-draft",
        JSON.stringify({
          delivery: d,
          customer: c,
          billing: { sameAsDelivery: true },
        }),
      );
      localStorage.setItem(
        "3l-cart",
        JSON.stringify([{ productId: "pan-de-muerto", quantity: 2 }]),
      );
    },
    [key, delivery, customer] as const,
  );
  await page.goto("/checkout");
  await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();
  await page.getByRole("button", { name: "REVIEW ORDER" }).click();
  await expect(page.getByRole("alert")).toContainText(
    /Order #\d{3,} from this visit is already paid\./,
  );
  await expect(page.getByRole("button", { name: /^PAY / })).toHaveCount(0);
});
