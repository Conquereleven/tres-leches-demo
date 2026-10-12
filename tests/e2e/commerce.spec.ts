import { test, expect } from "@playwright/test";
test("WA2 operational golden path, responsive and console", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(m.text());
  });
  await page.goto("/operations/inbox");
  await expect(
    page.getByRole("heading", { name: "Inbox", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delivery areas", exact: true })
    .click();
  await page.getByLabel("Minimum AED", { exact: true }).fill("100");
  await expect(page.getByLabel("Tarifa AED", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect(page.locator(".commerce")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await page
    .locator(".co-conversation")
    .filter({ hasText: "Valentina" })
    .click();
  await page
    .getByRole("button", { name: "Take conversation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Release conversation", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create order", exact: true }).click();
  await expect(page.getByTestId("order-panel")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Product", exact: true })
    .selectOption("tres");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page.locator(".co-state")).toContainText("Awaiting location");
  await page.request.post("/api/demo/location", {
    data: { conversationId: "conversation-wa2" },
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".co-state")).toContainText("Minimum check");
  await expect(page.locator(".co-quote")).toContainText("AED 120.00");
  await page
    .getByRole("button", { name: "Request payment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Payment · Pending" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".co-message.out")).toContainText(
    "Complete your payment here",
  );
  await expect(page.locator(".co-message.out")).toContainText("WA2");
  const snapshot = await (await page.request.get("/api/workspace")).json();
  await page.request.post("/api/demo/payment", {
    data: { paymentId: snapshot.payments[0].id, status: "paid" },
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".co-state")).toContainText("Confirmed");
  for (const state of ["Preparing", "Ready", "Out for delivery", "Delivered"]) {
    await page
      .getByRole("button", { name: `Move to ${state}`, exact: true })
      .click();
    await expect(page.locator(".co-state")).toContainText(state);
  }
  await page.getByRole("button", { name: "Deliveries", exact: true }).click();
  await expect(page.locator(".co-state")).toContainText("Delivered");
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `work/qa/delivery-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `work/qa/inbox-${width}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
test("legacy MVP surface is removed", async ({ page }) => {
  await page.goto("/operations/inbox");
  await expect(
    page.getByRole("button", { name: "MVP demo", exact: true }),
  ).toHaveCount(0);
  await page.goto("/legacy-inbox");
  await expect(page).toHaveURL(/\/operations\/inbox$/);
  await expect(
    page
      .getByRole("navigation", { name: "Operations" })
      .getByRole("button", { name: /Inbox/ }),
  ).toHaveCount(1);
});

test("recoverable send keeps draft, filters and out-of-coverage block payment", async ({
  page,
}) => {
  await page.goto("/operations/inbox");
  await page.getByRole("button", { name: /Ana Torres WA1/ }).click();
  await page
    .getByRole("button", { name: "Take conversation", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Demo recoverable reply");
  await page.route(
    "**/api/commands",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Conexión interrumpida. Intenta nuevamente.",
        }),
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveValue("Demo recoverable reply");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveValue("");
  await expect(page.locator(".co-message.out")).toContainText(
    "Demo recoverable reply",
  );
  await expect(page.locator(".co-message.out")).toContainText("Sent");
  await expect(page.locator(".commerce")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "Create order", exact: true }).click();
  await expect(page.getByTestId("order-panel")).toBeVisible();
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await page.getByLabel("Manual address / area").fill("Al Ain");
  await page
    .getByRole("button", { name: "Resolve address", exact: true })
    .click();
  await expect(page.locator(".co-quote")).toContainText("Fuera de cobertura");
  await expect(
    page.getByRole("button", { name: "Request payment", exact: true }),
  ).toBeDisabled();
  await page.getByText("Review and select area", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Confirmed area", exact: true })
    .selectOption("jvc");
  await page
    .getByLabel("Reason for selection", { exact: true })
    .fill("Synthetic UAT: confirmed with fixture customer");
  await page
    .getByRole("button", { name: "Confirm manual area", exact: true })
    .click();
  await expect(page.locator(".co-quote")).toContainText(
    "Minimum order for JVC is AED 100.",
  );
  await expect(
    page.getByRole("button", { name: "Request payment", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("order-panel")).toContainText(
    "Zona manual jvc",
  );
  await page.getByLabel("Search conversations").fill("No existe");
  await expect(
    page.getByText("No conversations match these filters."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delivery areas", exact: true })
    .click();
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `work/qa/zones-${width}.png`,
      fullPage: true,
    });
  }
});
