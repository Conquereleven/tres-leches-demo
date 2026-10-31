/** Synthetic browser responses only: never contact a real payment provider. */
import { test, expect } from "@playwright/test";
import { status } from "../fixtures/ux-states";
const key = "00000000-0000-4000-8000-000000000000";
const hosted = "https://pay.test.paymennt.com/checkout/incident-synthetic";

for (const paymentStatus of ["pending", "authorized", "pending_confirmation"]) {
  test(`incident ${paymentStatus}: refresh/reopen never creates a second payment`, async ({
    page,
  }) => {
    const creates: string[] = [];
    page.on("request", (r) => {
      if (
        r.method() === "POST" &&
        /checkout\/(web|payment)$/.test(new URL(r.url()).pathname)
      )
        creates.push(r.url());
    });
    await page.addInitScript(
      (key) => sessionStorage.setItem("3l-checkout", JSON.stringify({ key })),
      key,
    );
    await page.route("**/api/checkout/reconcile", (r) =>
      r.fulfill({
        json: status({
          paymentStatus,
          paymentFlow: "web",
          url: paymentStatus === "pending" ? hosted : null,
        }),
      }),
    );
    await page.goto("/checkout/return?success=true");
    const title =
      paymentStatus === "pending"
        ? "Complete your payment"
        : "Confirming your payment…";
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    if (paymentStatus === "pending") {
      await expect(
        page.getByRole("link", { name: "CONTINUE PAYMENT", exact: true }),
      ).toHaveAttribute("href", hosted);
      await page.screenshot({
        path: `work/incident/${test.info().project.name}-pending.png`,
        fullPage: true,
      });
      await page.route("https://pay.test.paymennt.com/**", (r) =>
        r.fulfill({
          contentType: "text/html; charset=utf-8",
          body: '<!doctype html><meta charset="utf-8"><h1>Fake hosted payment - no transaction</h1>',
        }),
      );
      await page
        .getByRole("link", { name: "CONTINUE PAYMENT", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Fake hosted payment - no transaction",
        }),
      ).toBeVisible();
      await page.goto("/checkout/return");
    } else
      await expect(
        page.getByRole("link", { name: /CONTINUE PAYMENT|TRY AGAIN/ }),
      ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Your order is confirmed", { exact: true }),
    ).toHaveCount(0);
    expect(creates).toEqual([]);
  });
}

test("incident interrupted legacy bank verification retains redirect without declaring paid", async ({
  page,
}) => {
  await page.addInitScript(
    (key) => sessionStorage.setItem("3l-checkout", JSON.stringify({ key })),
    key,
  );
  await page.route("**/api/checkout/reconcile", (r) =>
    r.fulfill({ json: status({ url: "https://bank.fixture.invalid/3ds" }) }),
  );
  await page.goto("/checkout/return?success=true");
  await expect(
    page.getByRole("heading", { name: "Verify with your bank" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "CONTINUE PAYMENT" }),
  ).toHaveAttribute("href", "https://bank.fixture.invalid/3ds");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Verify with your bank" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your order is confirmed", { exact: true }),
  ).toHaveCount(0);
});

test("incident denied session storage returns safe support state with no payment calls", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/checkout\//.test(r.url()))
      writes.push(r.url());
  });
  await page.addInitScript(() =>
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new DOMException("Fixture storage denied", "SecurityError");
      },
    }),
  );
  await page.goto("/checkout/return?success=true");
  await expect(
    page.getByRole("heading", { name: "Check your order", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/does not mean your payment failed/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /CONTINUE PAYMENT|TRY AGAIN/ }),
  ).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("incident network error offers status retry, never retries checkout creation", async ({
  page,
}) => {
  let offline = true,
    reads = 0;
  const writes: string[] = [];
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /checkout\/(web|payment)$/.test(new URL(r.url()).pathname)
    )
      writes.push(r.url());
  });
  await page.addInitScript(
    (key) => sessionStorage.setItem("3l-checkout", JSON.stringify({ key })),
    key,
  );
  await page.route("**/api/checkout/reconcile", (r) => {
    reads++;
    return offline
      ? r.abort()
      : r.fulfill({ json: status({ paymentFlow: "web", url: hosted }) });
  });
  await page.goto("/checkout/return");
  await expect(
    page.getByRole("button", { name: "CHECK AGAIN", exact: true }),
  ).toBeVisible();
  offline = false;
  await page.getByRole("button", { name: "CHECK AGAIN", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "CONTINUE PAYMENT", exact: true }),
  ).toHaveAttribute("href", hosted);
  expect(reads).toBe(2);
  expect(writes).toEqual([]);
});
