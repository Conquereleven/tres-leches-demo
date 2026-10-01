import { test, expect } from "@playwright/test";

const ORIGIN = "http://127.0.0.1:3189";
const tomorrow = () =>
  new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

test("cart → delivery → details → review → payment step", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The payment frame is served by the provider; it is stubbed so the test
  // never reaches the network and no card data is ever entered.
  await context.route("https://pay.test.paymennt.com/**", (r) =>
    r.fulfill({ body: "", contentType: "application/javascript" }),
  );

  // Preserve the original financial regression using its explicitly retired fixture.
  // Current menu selectors and new SKUs are exercised in menu-e2e separately.
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "3l-cart",
      JSON.stringify([{ productId: "pan-de-muerto", quantity: 2 }]),
    ),
  );
  await page.goto("/cart");
  await expect(page.locator("main")).toContainText("AED 50");
  await page.getByRole("link", { name: "CONTINUE TO DELIVERY" }).click();

  await expect(page).toHaveURL(/\/checkout$/);
  await page.getByLabel("Delivery area").selectOption("__missing");
  await expect(
    page.getByText("Online delivery isn't available for your area yet."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS" }),
  ).toBeDisabled();

  await page.getByLabel("Delivery area").selectOption("jlt-cluster-c");
  await expect(page.locator(".b-shop-form")).toContainText("Free");
  await page
    .getByLabel("Street address and community")
    .fill("Jumeirah Lakes Towers, Cluster C");
  await page.getByLabel("Building or villa").fill("UAT Tower");
  await page.getByLabel("Delivery date").fill(tomorrow());
  await page.getByLabel("Preferred delivery time").fill("Afternoon");
  await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();

  await page.getByLabel("Full name").fill("UAT reviewer");
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
    "UAT reviewer, UAT Tower, Jumeirah Lakes Towers, Cluster C, Dubai, United Arab Emirates",
  );
  await expect(
    page.getByRole("button", { name: "PAY AED 50", exact: true }),
  ).toBeDisabled();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
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
        slot: "Afternoon",
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
  await expect(page.locator("main")).toContainText(orderId);
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
    slot: "Afternoon",
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
  // Same session, cart refilled with different details.
  await page.goto("/");
  await page.evaluate(
    ([k, d, c]) => {
      sessionStorage.setItem(
        "3l-checkout",
        JSON.stringify({ key: k, fingerprint: "earlier" }),
      );
      sessionStorage.setItem(
        "3l-checkout-draft",
        JSON.stringify({
          delivery: { ...d, building: "Other Tower" },
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
    `Order ${orderId} from this visit is already paid.`,
  );
  await expect(page.getByRole("button", { name: /^PAY / })).toHaveCount(0);
});
