import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { omsWorkspace } from "../fixtures/oms";

const SHOTS = "docs/operations/oms/screenshots";
type Data = ReturnType<typeof omsWorkspace>;

/** Serves the synthetic workspace and records every write the page attempts. */
async function serve(page: Page, data: Data = omsWorkspace()) {
  const writes: { url: string; body: unknown; key?: string }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (r) => {
    const req = r.request();
    if (req.method() !== "GET") {
      writes.push({
        url: new URL(req.url()).pathname,
        body: req.postDataJSON(),
        key: req.headers()["idempotency-key"],
      });
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: data });
  });
  return { data, writes, errors };
}
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const row = (page: Page, id: string) =>
  page.locator(`.oms-table tr[data-order="${id}"]`);

test("orders list shows real orders, marks unpaid ones and filters them", async ({
  page,
}) => {
  const { data, writes, errors } = await serve(page);
  await page.goto("/operations/orders");
  await expect(page.locator(".oms-table tbody tr")).toHaveCount(
    data.orders.length,
  );
  const paid = row(page, "TL-FIX00001");
  for (const text of [
    "#012",
    "Layla Fixture",
    "AED 100.00",
    "Paid",
    "Confirmed",
    "JLT Cluster C",
  ])
    await expect(paid).toContainText(text);
  const unpaid = row(page, "TL-FIX00007");
  await expect(unpaid).toHaveAttribute("data-unpaid", "true");
  await expect(unpaid).toContainText("Awaiting payment");
  await expect(unpaid).toContainText("Not in the kitchen queue");
  // A delivery area is never shown as the customer's name.
  await expect(row(page, "TL-FIX00004")).toContainText("Name not recorded");
  await expect(row(page, "TL-FIX00003")).toContainText("Pickup");

  await page.getByRole("button", { name: /^Awaiting payment/ }).click();
  await expect(page.locator(".oms-table tbody tr")).toHaveCount(1);
  await expect(page).toHaveURL(/status=unpaid/);
  await page.getByRole("button", { name: /^All/ }).click();

  await page.getByRole("searchbox", { name: "Search orders" }).fill("layla");
  await expect(page.locator(".oms-table tbody tr")).toHaveCount(1);
  await expect(page).toHaveURL(/q=layla/);
  await page.getByRole("searchbox").fill("nothing matches this");
  await expect(page.getByText("No orders match these filters")).toBeVisible();
  await page
    .getByRole("button", { name: "Clear search and filters" })
    .first()
    .click();
  await expect(page.locator(".oms-table tbody tr")).toHaveCount(
    data.orders.length,
  );

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByLabel("Payment status").selectOption("issue");
  await expect(page.locator(".oms-table tbody tr")).toHaveCount(1);
  await expect(row(page, "TL-FIX00008")).toContainText("Payment expired");
  await page.getByLabel("Fulfillment method").selectOption("pickup");
  await expect(page.getByText("No orders match these filters")).toBeVisible();

  // Unpaid orders stay out of the kitchen queue.
  await page.goto("/operations/production");
  await expect(page.locator(".ops-order-card").first()).toBeVisible();
  await expect(page.locator(".ops-content")).not.toContainText("TL-FIX00007");
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("row opens the order page; Back restores filters, search and page", async ({
  page,
}) => {
  await serve(page, omsWorkspace(40));
  await page.goto("/operations/orders?status=completed&page=2");
  await expect(page.getByText(/Page 2 of 2/)).toBeVisible();
  const first = page.locator(".oms-table tbody tr").first();
  const id = (await first.getAttribute("data-order"))!;
  await first.locator("td").nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/operations/orders/${id}$`));
  await expect(page.locator(".oms-details")).toHaveAttribute("data-order", id);
  await page.getByRole("button", { name: "Back to orders" }).click();
  await expect(page).toHaveURL(/status=completed&page=2/);
  await expect(page.getByText(/Page 2 of 2/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Delivered/ }),
  ).toHaveAttribute("aria-pressed", "true");

  // Keyboard: the order number is a real link.
  await page.goto("/operations/orders?q=layla");
  const link = page.getByRole("link", { name: "#012" });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/operations\/orders\/TL-FIX00001$/);
  await page.goBack();
  await expect(page).toHaveURL(/q=layla/);
  await expect(page.getByRole("searchbox")).toHaveValue("layla");
  await page.goForward();
  await expect(page.locator(".oms-page-heading h1")).toHaveText("#012");
});

test("direct URL, refresh, legacy link, missing order and polling stability", async ({
  page,
}) => {
  const { data } = await serve(page);
  await page.goto("/operations/orders/TL-FIX00001");
  await expect(page.locator(".oms-page-heading h1")).toHaveText("#012");
  await page.reload();
  await expect(page.locator(".oms-page-heading h1")).toHaveText("#012");
  // Opened without the list: Back still lands on the list.
  await page.getByRole("button", { name: "Back to orders" }).click();
  await expect(page).toHaveURL(/\/operations\/orders$/);
  await expect(page.locator(".oms-table")).toBeVisible();

  // Links from earlier emails and alerts keep working.
  await page.goto("/operations/orders?order=TL-FIX00003");
  await expect(page).toHaveURL(/\/operations\/orders\/TL-FIX00003$/);
  await expect(page.locator(".oms-page-heading h1")).toHaveText("#013");

  // The open order survives workspace refreshes, including a state change.
  await page.getByText("Reconciliation details").click();
  data.orders.find((o: { id: string }) => o.id === "TL-FIX00003")!.version = 9;
  await page.waitForResponse("**/api/workspace");
  await page.waitForResponse("**/api/workspace");
  await expect(page.locator(".oms-page-heading h1")).toHaveText("#013");
  await expect(page.locator(".oms-advanced")).toHaveAttribute("open", "");

  await page.goto("/operations/orders/TL-DOESNOTEXIST");
  await expect(page.getByRole("alert")).toContainText("Order not found");
  await expect(page.getByRole("alert")).toContainText("TL-DOESNOTEXIST");
  await page.getByRole("button", { name: "Back to orders" }).click();
  await expect(page.locator(".oms-table")).toBeVisible();
});

test("order page shows stored facts only: customer, items, payment, delivery", async ({
  page,
}) => {
  const { data, writes } = await serve(page);
  data.catalog[0].priceFils = 99900;
  data.catalog[0].name = "Current catalog must never replace history";
  await page.goto("/operations/orders/TL-FIX00001");
  const details = page.locator(".oms-details");
  // The internal reference stays visible, under the order number.
  await expect(page.locator(".oms-page-heading")).toContainText(
    /Internal reference\s*TL-FIX00001/,
  );
  for (const text of [
    "Layla Fixture",
    "+971500000101",
    "layla.fixture@example.invalid",
    "Website checkout",
    "AED 25.00",
    "AED 100.00",
    "Free",
    "Card · Paymennt (website checkout)",
    "Unit 1204, Fixture Tower 1, Sample Street, JLT Cluster C",
    "Sample Street",
    "Fixture Tower 1",
    "1204",
    "Morning, 10–12",
    "Happy birthday plaque, no nuts",
    "Leave with reception",
    "Pending · WhatsApp sending disabled",
    "Order created",
    "Awaiting payment → Paid",
    "Payment reconciled as paid",
    "Dubai time",
  ])
    await expect(details).toContainText(text);
  await expect(details).not.toContainText("AED 999.00");
  await expect(details).not.toContainText("Current catalog must never");
  await expect(details).not.toContainText("Address incomplete");
  await expect(details).not.toContainText("ADDRESS NOT VERIFIED");
  // Sent only with provider evidence.
  const notifications = page.locator(".oms-notifications li");
  await expect(notifications.nth(1)).toContainText("Internal email");
  await expect(notifications.nth(1)).toContainText("Sent");
  // No fake controls: notes and arbitrary resend buttons do not exist.
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /resend|retry/i })).toHaveCount(
    0,
  );

  // Missing customer and address details are stated, not invented.
  await page.goto("/operations/orders/TL-FIX00004");
  await expect(page.locator(".oms-customer-name")).toHaveText(
    "Name not recorded",
  );
  await expect(details).toContainText("Address incomplete");
  await expect(details).toContainText("ADDRESS NOT VERIFIED");
  await expect(details).toContainText("Failed · review");
  await expect(details).toContainText("WhatsApp · WA1");

  // Missing snapshot: prices stay unknown.
  const order = data.orders.find(
    (o: { id: string }) => o.id === "TL-FIX00002",
  )!;
  delete order.catalogSnapshot;
  await page.goto("/operations/orders/TL-FIX00002");
  await expect(page.locator(".oms-items")).toContainText("Not stored");
  await expect(page.locator(".oms-items")).not.toContainText("AED");
  await expect(details).toContainText(
    "Current catalog prices are not substituted",
  );

  // Pickup: no delivery address is required or shown.
  await page.goto("/operations/orders/TL-FIX00003");
  await expect(details).toContainText("Pastelerías 3L · Collect in store");
  await expect(details).toContainText("5:00 PM");
  await expect(details).not.toContainText("Street / address");
  await expect(details).not.toContainText("Address incomplete");
  await expect(details).not.toContainText("ADDRESS NOT VERIFIED");
  await expect(page.locator(".oms-steps li")).toHaveCount(4);
  expect(writes).toEqual([]);
});

test("fulfilment actions reuse the existing commands exactly once", async ({
  page,
}) => {
  const { data, writes } = await serve(page);
  const order = (id: string) =>
    data.orders.find((o: { id: string }) => o.id === id)!;
  await page.goto("/operations/orders/TL-FIX00001");
  const start = page.getByRole("button", { name: "Start preparation" });
  await start.dblclick();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({
    url: "/api/commands",
    body: {
      type: "transition",
      id: "TL-FIX00001",
      version: order("TL-FIX00001").version,
      state: "Production",
    },
  });
  expect(writes[0]!.key).toBeTruthy();

  // Pickup goes from Ready straight to handed over.
  await page.goto("/operations/orders/TL-FIX00003");
  await page.getByRole("button", { name: "Confirm pickup" }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]!.body).toMatchObject({
    type: "transition",
    id: "TL-FIX00003",
    state: "Delivered",
  });

  // Unpaid, delivered and cancelled orders offer no fulfilment step.
  for (const id of ["TL-FIX00007", "TL-FIX00006", "TL-FIX00008"]) {
    await page.goto(`/operations/orders/${id}`);
    await expect(page.locator(".oms-details")).toHaveAttribute(
      "data-order",
      id,
    );
    await expect(page.locator(".oms-primary-action")).toHaveCount(0);
  }
  await expect(page.locator(".oms-details")).toContainText(
    "Cancelling does not refund a payment",
  );
  await page.goto("/operations/orders/TL-FIX00007");
  await expect(page.locator(".oms-details")).toContainText(
    "must not be prepared",
  );

  // Someone else's order: the operator cannot advance it.
  data.actor = { id: "other-operator", name: "Other", role: "operator" };
  await page.goto("/operations/orders/TL-FIX00002");
  await expect(page.locator(".oms-primary-action")).toHaveCount(0);
  await expect(page.locator(".oms-details")).toContainText(
    "Only the assigned operator can advance this order",
  );

  // Nothing touched payments or outbound messaging.
  expect(writes.map((w) => w.url)).toEqual(["/api/commands", "/api/commands"]);
  expect(
    writes.every((w) => (w.body as { type: string }).type === "transition"),
  ).toBe(true);
});

test("a rejected command shows an error and leaves the order unchanged", async ({
  page,
}) => {
  const data = omsWorkspace();
  let posts = 0;
  await page.route("**/api/**", (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: data });
    posts++;
    return r.fulfill({
      status: 409,
      json: { error: "Transición inválida: Confirmed → Production" },
    });
  });
  await page.goto("/operations/orders/TL-FIX00001");
  await page.getByRole("button", { name: "Start preparation" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  expect(posts).toBe(1);
  await expect(page.locator(".oms-details")).toHaveAttribute(
    "data-state",
    "Confirmed",
  );
});

test("draft orders keep the existing builder on their page", async ({
  page,
}) => {
  await serve(page);
  await page.goto("/operations/orders/TL-FIX00009");
  await expect(page.locator(".oms-details")).toContainText("Draft order");
  await expect(page.getByTestId("order-panel")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request Payment" }),
  ).toBeVisible();
});

test("order number is the page title; review flags stay out of product titles", async ({
  page,
}) => {
  await serve(page);
  await page.goto("/operations/orders/TL-FIX00001");
  // One page title: the order number, not a second "Orders" heading.
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("#012");
  await expect(page.locator(".ops-page-header")).not.toContainText(
    "Manage orders from payment to fulfillment",
  );
  // The fixture product has no reviewed English name: flagged, title untouched.
  const title = page.locator(".oms-item-name");
  await expect(title).toHaveText("Pan de Muerto");
  await expect(page.locator(".oms-item-review")).toHaveText(
    "Product translation requires review",
  );
  await expect(page.locator(".oms-items")).toContainText("pan-de-muerto");
  // The list keeps the section title.
  await page.goto("/operations/orders");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Orders");
});

test("address problems are stated beside the dispatch action, which stays the operator's decision", async ({
  page,
}) => {
  const { data, writes } = await serve(page);
  const order = (id: string) =>
    data.orders.find((o: { id: string }) => o.id === id)!;
  // Ready for dispatch with an incomplete, unverified address.
  order("TL-FIX00004").state = "Ready";
  await page.goto("/operations/orders/TL-FIX00004");
  const warning = page.locator(".oms-dispatch-warning");
  await expect(warning).toContainText("Address incomplete");
  await expect(warning).toContainText("Review address before dispatch");
  const send = page.getByRole("button", { name: "Send for delivery" });
  // Existing behaviour: the state machine allows it; the UI does not block.
  await expect(send).toBeEnabled();
  // Complete but unverified.
  Object.assign(order("TL-FIX00004").delivery, {
    address: "Sample Street",
    building: "Fixture Villa 4",
  });
  await page.reload();
  await expect(warning).toContainText("ADDRESS NOT VERIFIED");
  // Verified and complete: no warning. Pickup: never.
  order("TL-FIX00001").state = "Ready";
  await page.goto("/operations/orders/TL-FIX00001");
  await expect(send).toBeVisible();
  await expect(warning).toHaveCount(0);
  await page.goto("/operations/orders/TL-FIX00003");
  await expect(
    page.getByRole("button", { name: "Confirm pickup" }),
  ).toBeVisible();
  await expect(warning).toHaveCount(0);
  // Earlier steps are not dispatch: no warning while preparing.
  order("TL-FIX00004").state = "Production";
  Object.assign(order("TL-FIX00004").delivery, { address: "", building: "" });
  await page.goto("/operations/orders/TL-FIX00004");
  await expect(page.getByRole("button", { name: "Mark ready" })).toBeVisible();
  await expect(warning).toHaveCount(0);
  expect(writes).toEqual([]);
});

for (const width of [390, 1440])
  test(`accessibility scan (contrast included) at ${width}px`, async ({
    page,
  }) => {
    await serve(page);
    await page.setViewportSize({ width, height: 1000 });
    for (const path of [
      "/operations/orders",
      "/operations/orders/TL-FIX00001",
      "/operations/orders/TL-FIX00004",
      "/operations/orders/TL-FIX00007",
      "/operations/orders/TL-FIX00008",
      "/operations/production",
    ]) {
      await page.goto(path);
      await expect(page.locator(".ops-content")).toBeVisible();
      await page.waitForTimeout(150);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`),
        path,
      ).toEqual([]);
    }
  });

test("mobile: fulfilment tabs show there is more and keep the selection in view", async ({
  page,
}) => {
  await serve(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/operations/orders");
  const wrap = page.locator(".oms-tabs-wrap");
  await expect(wrap).toHaveAttribute("data-more-right", "true");
  await expect(wrap).not.toHaveAttribute("data-more-left", "true");
  await wrap.locator('.oms-tabs-nudge[data-side="right"]').click();
  await expect(wrap).toHaveAttribute("data-more-left", "true");
  // A deep link to a status at the far end scrolls that tab into view.
  await page.goto("/operations/orders?status=cancelled");
  const active = page.getByRole("button", { name: /^Cancelled/ });
  await expect(active).toHaveAttribute("aria-pressed", "true");
  await expect(active).toBeInViewport({ ratio: 1 });
  expect(await noOverflow(page)).toBe(true);
  // Desktop shows every tab: no scroll affordance.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(wrap).not.toHaveAttribute("data-more-right", "true");
  await expect(page.locator(".oms-tabs-nudge")).toHaveCount(0);
});

for (const width of [390, 768, 1440])
  test(`responsive and palette at ${width}px`, async ({ page }, info) => {
    await serve(page);
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width, height: 1000 });
    const shot = (name: string) =>
      info.project.name === "chromium"
        ? page.screenshot({
            path: `${SHOTS}/${name}-${width}.png`,
            fullPage: true,
          })
        : Promise.resolve();
    for (const [name, path] of [
      ["orders-list", "/operations/orders"],
      ["order-delivery-paid", "/operations/orders/TL-FIX00001"],
      ["order-pickup", "/operations/orders/TL-FIX00003"],
      ["order-awaiting-payment", "/operations/orders/TL-FIX00007"],
      ["order-missing-customer", "/operations/orders/TL-FIX00004"],
    ] as const) {
      await page.goto(path);
      await expect(page.locator(".oms")).toBeVisible();
      expect(await noOverflow(page), `${name} overflow`).toBe(true);
      // Essential facts stay visible at every width.
      if (name === "orders-list")
        for (const text of ["#012", "Layla Fixture", "AED 100.00", "Paid"])
          await expect(row(page, "TL-FIX00001")).toContainText(text);
      // Approved palette only: no purple or green anywhere in Operations.
      const offBrand = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of document.querySelectorAll(".ops-shell *")) {
          const cs = getComputedStyle(el);
          for (const value of [cs.color, cs.backgroundColor]) {
            const m = value.match(/[\d.]+/g)?.map(Number);
            if (!m || m[3] === 0) continue;
            const [r, g, b] = [m[0]! / 255, m[1]! / 255, m[2]! / 255];
            const max = Math.max(r, g, b);
            const d = max - Math.min(r, g, b);
            if (d < 0.08) continue;
            const h =
              ((max === r
                ? ((g - b) / d) % 6
                : max === g
                  ? (b - r) / d + 2
                  : (r - g) / d + 4) *
                60 +
                360) %
              360;
            if ((h >= 80 && h <= 200) || (h >= 240 && h <= 330))
              bad.push(`${el.className} ${value}`);
          }
        }
        return [...new Set(bad)];
      });
      expect(offBrand, name).toEqual([]);
      await shot(name);
    }
    // Touch targets on the order page.
    await page.goto("/operations/orders/TL-FIX00001");
    for (const button of await page.locator(".oms button:visible").all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const sidebar = page.locator(".ops-sidebar");
    if (await sidebar.isVisible())
      expect(
        await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe("rgb(246, 223, 224)");
  });
