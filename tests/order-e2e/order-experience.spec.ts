import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { chooseArea, fillName } from "../fixtures/storefront-form";
const shots = "work/qa/order-experience";
mkdirSync(shots, { recursive: true });
const BASE = "http://127.0.0.1:3231";
const NORMAL = "conchas-filled--pistache"; // 12-hour notice
const LEAD24 = "tres-leches-mango--mango"; // 24-hour notice
async function addToCart(page: Page, product = NORMAL, base = BASE) {
  await page.goto(`${base}/menu?product=${product}`);
  const size = page.locator("main select").first();
  await size.selectOption({ index: 1 });
  // Three, so the smallest approved delivery minimum is met.
  await page.getByRole("textbox", { name: "Quantity", exact: true }).fill("3");
  await page.locator("main .b-product-page .b-button").last().click();
  await expect(
    page.locator(".b-floating-cart, .b-cart-link").first(),
  ).toContainText(/[1-9]/);
}
const area = (page: Page) =>
  page.getByRole("combobox", { name: "Delivery area", exact: true });
const options = (page: Page) =>
  page.getByRole("listbox", { name: "Delivery area" }).getByRole("option");
async function schedule(
  page: Page,
  kind: "Delivery" | "Pickup",
  date = "2026-10-22",
) {
  await page.getByLabel(`${kind} date`, { exact: true }).fill(date);
  await page
    .getByRole("combobox", { name: `${kind} time`, exact: true })
    .selectOption("4:00 PM – 9:00 PM");
}
async function contact(page: Page, first: string, last: string) {
  await fillName(page, first, last);
  await page
    .getByLabel("Email for payment receipt")
    .fill("ana@example.invalid");
  await page.getByLabel("Mobile number").fill("0500000000");
}
async function pay(page: Page, base = BASE) {
  await page.getByRole("checkbox", { name: /I've reviewed/ }).check();
  await page.getByRole("button", { name: /^PAY AED/ }).click();
  // The hosted page belongs to the (fake) provider; nothing is entered there.
  await expect(page).toHaveURL(/pay\.test\.paymennt\.com/);
  await page.goto(`${base}/checkout/return`);
  await expect(page.getByRole("heading", { name: /Thank you/ })).toBeVisible();
  const { key } = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("3l-checkout")!),
  );
  const status = await page.request.post(`${base}/api/checkout/status`, {
    data: { key },
    headers: { origin: base },
  });
  return (await status.json()) as {
    orderId: string;
    orderNumber: string;
    status: string;
  };
}
type Workspace = {
  orders: {
    id: string;
    version: number;
    state: string;
    conversationId: string;
    publicOrderNumber?: number;
    fulfillmentMethod?: string;
    customerDetails?: { firstName?: string; lastName?: string };
    delivery?: { zoneId: string };
    billing?: { sameAsDelivery: boolean; address: Record<string, string> };
  }[];
  conversations: {
    id: string;
    version: number;
    assignedAgent: string | null;
    customer: string;
  }[];
  operationsNotifications: {
    orderId: string;
    status: string;
    recipient: { name: string };
    message: string;
  }[];
  customerNotifications: {
    orderId: string;
    event: string;
    status: string;
    subject: string;
    attemptCount: number;
  }[];
  customerEmailProvider: string | null;
  operationsOutboundEnabled: boolean;
  actor: { id: string };
};
const workspace = async (page: Page, base = BASE) =>
  (await (await page.request.get(`${base}/api/workspace`)).json()) as Workspace;
const command = (page: Page, body: unknown, key: string, base = BASE) =>
  page.request.post(`${base}/api/commands`, {
    data: body,
    headers: { origin: base, "idempotency-key": key },
  });

test("delivery: names, area typeahead, billing, #001 confirmation, operations and one email per transition", async ({
  page,
}) => {
  await addToCart(page);
  await page.goto("/checkout");
  await expect(
    page.getByRole("radio", { name: "DELIVERY", exact: true }),
  ).toBeChecked();

  // ---- Area typeahead ----
  await area(page).focus();
  await expect(options(page)).toHaveCount(94);
  await area(page).fill("Jumei");
  await expect(options(page).first()).toContainText("Jumeirah 1");
  for (const name of ["Jumeirah Island", "Jumeirah Park", "Jumeirah Heights"])
    await expect(options(page).filter({ hasText: name })).toHaveCount(1);
  await page.screenshot({ path: `${shots}/area-typeahead-1440.png` });
  // Unsupported: no suggestion, a clear message, and the form cannot continue.
  await area(page).fill("Sharjah");
  await expect(options(page)).toHaveCount(0);
  await expect(
    page.getByText("We don't currently deliver to this area.").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS" }),
  ).toBeDisabled();
  // Free text that merely resembles an area is not a selection.
  await area(page).fill("Jumeirah");
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS" }),
  ).toBeDisabled();
  expect(
    await area(page).evaluate((el) => (el as HTMLInputElement).validity.valid),
  ).toBe(false);
  // A misspelling still finds the area; keyboard alone can choose it.
  await area(page).fill("Mraina");
  await expect(options(page)).toHaveCount(1);
  await area(page).press("ArrowDown");
  await area(page).press("ArrowUp");
  await area(page).press("Enter");
  await expect(area(page)).toHaveValue("Marina");
  // Enter chose the area; it did not submit the form.
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(
    page.getByText(/minimum order.*Marina.*AED 50/i).first(),
  ).toBeVisible();
  // An alias typed in full selects its canonical area.
  await area(page).fill("Jumeirah Lakes Towers Cluster C");
  await expect(page.getByText("JLT Cluster C — Minimum AED 30")).toBeVisible();
  await chooseArea(page, "JLT", "JLT Cluster C");
  await expect(area(page)).toHaveAttribute("aria-expanded", "false");

  await page
    .getByLabel("Street address and community")
    .fill("Fixture street, JLT");
  await page.getByLabel("Building or villa").fill("Fixture Tower");
  await schedule(page, "Delivery");
  await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();

  // ---- Names and billing ----
  await expect(page.getByLabel("Full name")).toHaveCount(0);
  await page.getByRole("button", { name: "REVIEW ORDER" }).click();
  expect(
    await page
      .getByLabel("Last name", { exact: true })
      .evaluate((el) => (el as HTMLInputElement).validity.valueMissing),
  ).toBe(true);
  await contact(page, "Ana María", "López Ortega");
  const same = page.getByLabel(
    "Billing address is the same as delivery address",
  );
  await expect(same).toBeChecked();
  await expect(page.locator(".b-co-address-preview")).toContainText(
    "Ana María López Ortega, Fixture Tower, Fixture street, JLT, Dubai, United Arab Emirates",
  );
  await same.uncheck();
  // Separate billing: country starts on the UAE, with no extra click.
  await expect(page.getByRole("combobox", { name: /^Country/ })).toHaveValue(
    "AE",
  );
  await page
    .getByLabel("Address line 1", { exact: true })
    .fill("Typed billing street");
  await page.getByLabel("City", { exact: true }).fill("Abu Dhabi");
  // Ticking the box again does not erase what was typed.
  await same.check();
  await same.uncheck();
  await expect(page.getByLabel("Address line 1", { exact: true })).toHaveValue(
    "Typed billing street",
  );
  await same.check();
  await page.screenshot({
    path: `${shots}/details-delivery-1440.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "REVIEW ORDER" }).click();
  const review = page.getByRole("region", { name: "Order review" });
  await expect(review).toContainText("Ana María López Ortega");
  await expect(review).toContainText("Same as delivery address");

  // ---- Payment (fake provider) and confirmation ----
  const paid = await pay(page);
  expect(paid.status).toBe("Confirmed");
  expect(paid.orderNumber).toBe("#001");
  expect(paid.orderId).toMatch(/^TL-[0-9A-F]{8}$/);
  await expect(page.locator("main")).toContainText("#001");
  await expect(page.locator("main")).not.toContainText(paid.orderId);
  await expect(page.locator("main")).toContainText("Thank you, Ana María");
  await page.screenshot({
    path: `${shots}/confirmation-1440.png`,
    fullPage: true,
  });
  // Returning to the confirmation never issues another number.
  await page.reload();
  await expect(page.locator("main")).toContainText("#001");

  let data = await workspace(page);
  const order = data.orders.find((o) => o.id === paid.orderId)!;
  expect(order.publicOrderNumber).toBe(1);
  expect(order.customerDetails).toMatchObject({
    firstName: "Ana María",
    lastName: "López Ortega",
  });
  expect(order.delivery!.zoneId).toBe("jlt-cluster-c");
  expect(order.billing).toMatchObject({
    sameAsDelivery: true,
    address: { country: "AE", city: "Dubai" },
  });
  // Internal WhatsApp event: recorded for Liza, not sent, nothing faked.
  const alerts = data.operationsNotifications.filter(
    (n) => n.orderId === order.id,
  );
  expect(alerts.map((n) => [n.recipient.name, n.status])).toEqual([
    ["Liza", "pending-whatsapp-delivery"],
  ]);
  expect(alerts[0]!.message).toContain("New paid order #001");
  expect(data.operationsOutboundEnabled).toBe(false);
  expect(data.customerEmailProvider).toBeNull();
  // Paying and looking at the order tell the customer nothing yet.
  expect(data.customerNotifications).toEqual([]);

  // ---- Operations ----
  await page.goto("/operations/orders");
  await page.getByRole("button", { name: /^Todos los pedidos/ }).click();
  const card = page.getByRole("article", { name: "Pedido #001" });
  await expect(card.locator(".ops-oc-number")).toHaveText("#001");
  // The internal reference stays available for audit.
  await expect(card).toContainText(paid.orderId);
  await expect(card).toContainText("Ana María López Ortega");
  await page.screenshot({
    path: `${shots}/operations-orders-1440.png`,
    fullPage: true,
  });
  // Producción lists the confirmed order under its public number.
  await page.goto("/operations/production");
  await expect(
    page.getByRole("article", { name: "Pedido #001" }),
  ).toBeVisible();
  await page.screenshot({ path: `${shots}/operations-production-1440.png` });
  // Opening and reloading operations pages records no customer email.
  await page.reload();
  expect((await workspace(page)).customerNotifications).toEqual([]);

  // The operator takes the order, then moves it. Each move is sent twice
  // with the same idempotency key (a double click) and once more as a retry.
  const conversation = data.conversations.find(
    (c) => c.id === order.conversationId,
  )!;
  await command(
    page,
    {
      type: "assign",
      id: conversation.id,
      version: conversation.version,
      agent: data.actor.id,
    },
    "take-order-1",
  );
  const move = async (state: string) => {
    const current = (await workspace(page)).orders.find(
      (o) => o.id === order.id,
    )!;
    const body = {
      type: "transition",
      id: order.id,
      version: current.version,
      state,
    };
    const [first, second] = await Promise.all([
      command(page, body, `move-order-${state.replaceAll(" ", "-")}`),
      command(page, body, `move-order-${state.replaceAll(" ", "-")}`),
    ]);
    expect(first.ok() && second.ok()).toBe(true);
    // A retried request with a new key is refused: the order already moved.
    expect(
      (
        await command(page, body, `retry-order-${state.replaceAll(" ", "-")}`)
      ).ok(),
    ).toBe(false);
  };
  const events = async () =>
    (await workspace(page)).customerNotifications
      .filter((n) => n.orderId === order.id)
      .map((n) => n.event);
  await move("Production");
  expect(await events()).toEqual(["ORDER_PRODUCTION_STARTED"]);
  await move("Ready");
  expect(await events()).toEqual(["ORDER_PRODUCTION_STARTED"]);
  // Entregas shows the ready order under the same number.
  await page.goto("/operations/delivery");
  await expect(
    page.getByRole("article", { name: "Pedido #001" }),
  ).toBeVisible();
  await page.screenshot({ path: `${shots}/operations-delivery-1440.png` });
  await move("Out for Delivery");
  expect(await events()).toEqual([
    "ORDER_PRODUCTION_STARTED",
    "ORDER_OUT_FOR_DELIVERY",
  ]);
  await move("Delivered");
  data = await workspace(page);
  const emails = data.customerNotifications.filter(
    (n) => n.orderId === order.id,
  );
  expect(emails.map((n) => n.subject)).toEqual([
    "Your 3L order #001 is now being prepared",
    "Your 3L order #001 is on the way",
  ]);
  // No provider is configured here: recorded, pending, never reported as sent.
  expect(
    emails.every((n) => n.status === "pending" && n.attemptCount === 0),
  ).toBe(true);
  await page.goto(`/operations/orders?order=${order.id}`);
  await expect(page.locator("main")).toContainText(
    "Referencia interna: " + paid.orderId,
  );
  await expect(page.locator(".co-notifications")).toContainText(
    "Pendiente · proveedor de email no configurado",
  );
  await expect(page.locator(".co-notifications")).toContainText(
    "Pendiente · envío de WhatsApp desactivado",
  );
  await expect(page.locator(".co-notifications")).not.toContainText("Enviado");
  await page.screenshot({
    path: `${shots}/operations-order-detail-1440.png`,
    fullPage: true,
  });
});

test("pickup: no area or address, minimum billing with fixed UAE, 3L Pastelerías, its own number and the pickup emails", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const base = "http://127.0.0.1:3237";
  const cmd = (p: Page, body: unknown, key: string) =>
    command(p, body, key, base);
  await addToCart(page, NORMAL, base);
  await page.goto(`${base}/checkout`);
  await page.getByRole("radio", { name: "PICKUP", exact: true }).check();
  await expect(area(page)).toHaveCount(0);
  await expect(page.getByLabel("Street address and community")).toHaveCount(0);
  await expect(page.getByLabel("Building or villa")).toHaveCount(0);
  await expect(page.locator("main")).toContainText("Pickup · 3L Pastelerías");
  await expect(page.locator("main")).toContainText(
    "Golositalia JLT, Jumeirah Lakes Towers, Cluster C, Retail Shop C6/A, Dubai, UAE",
  );
  await expect(page.locator("main")).not.toContainText("Pastelerías 3L ·");
  await schedule(page, "Pickup");
  await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();
  await contact(page, "Omar", "Haddad");
  // Only what the payment provider requires.
  await expect(
    page.getByLabel("Billing address is the same as delivery address"),
  ).toHaveCount(0);
  for (const hidden of [
    "Name on billing address",
    "Address line 1",
    "Address line 2",
    "Postcode",
  ])
    await expect(page.getByLabel(hidden)).toHaveCount(0);
  const country = page.getByLabel("Country", { exact: true });
  await expect(country).toHaveValue("United Arab Emirates");
  await expect(country).not.toBeEditable();
  // Nothing is pre-filled with the shop's address.
  await expect(page.getByLabel("Street address", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByLabel("City", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "REVIEW ORDER" }).click();
  await expect(page.getByRole("region", { name: "Order review" })).toHaveCount(
    0,
  );
  await page
    .getByLabel("Street address", { exact: true })
    .fill("12 Fixture Road");
  await page.getByLabel("City", { exact: true }).fill("Dubai");
  await page.screenshot({
    path: `${shots}/details-pickup-390.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "REVIEW ORDER" }).click();
  const review = page.getByRole("region", { name: "Order review" });
  await expect(review).toContainText("3L Pastelerías · Golositalia JLT");
  await expect(review).toContainText(
    "Omar Haddad, 12 Fixture Road, Dubai, United Arab Emirates",
  );
  const paid = await pay(page, base);
  expect(paid.orderNumber).toBe("#001");
  await expect(page.locator("main")).toContainText("#001");
  await expect(page.locator("main")).toContainText("Thank you, Omar");
  await page.screenshot({
    path: `${shots}/confirmation-pickup-390.png`,
    fullPage: true,
  });

  let data = await workspace(page, base);
  const order = data.orders.find((o) => o.id === paid.orderId)!;
  expect(order.fulfillmentMethod).toBe("pickup");
  expect(order.delivery).toBeUndefined();
  expect(order.billing!.address).toEqual({
    name: "Omar Haddad",
    address1: "12 Fixture Road",
    city: "Dubai",
    country: "AE",
  });
  const conversation = data.conversations.find(
    (c) => c.id === order.conversationId,
  )!;
  const taken = await cmd(
    page,
    {
      type: "assign",
      id: conversation.id,
      version: conversation.version,
      agent: data.actor.id,
    },
    "take-order-2",
  );
  expect(taken.status(), await taken.text()).toBe(200);
  for (const state of ["Production", "Ready"]) {
    const current = (await workspace(page, base)).orders.find(
      (o) => o.id === order.id,
    )!;
    const moved = await cmd(
      page,
      { type: "transition", id: order.id, version: current.version, state },
      `pickup-move-${state}`,
    );
    expect(moved.status(), await moved.text()).toBe(200);
  }
  // Pickup can never go out for delivery.
  const ready = (await workspace(page, base)).orders.find(
    (o) => o.id === order.id,
  )!;
  expect(
    (
      await cmd(
        page,
        {
          type: "transition",
          id: order.id,
          version: ready.version,
          state: "Out for Delivery",
        },
        "pickup-move-out",
      )
    ).ok(),
  ).toBe(false);
  expect(
    (
      await cmd(
        page,
        {
          type: "transition",
          id: order.id,
          version: ready.version,
          state: "Delivered",
        },
        "pickup-move-done",
      )
    ).ok(),
  ).toBe(true);
  data = await workspace(page, base);
  expect(
    data.customerNotifications
      .filter((n) => n.orderId === order.id)
      .map((n) => n.subject),
  ).toEqual([
    "Your 3L order #001 is now being prepared",
    "Your 3L order #001 is ready for pickup",
  ]);
});

test("language menu: a flag beside each written name, keyboard and RTL", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?lang=en");
    const toggle = page.locator(".b-language:visible").first();
    await expect(toggle).toContainText("English");
    await expect(toggle.locator("svg.b-flag")).toHaveCount(1);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAccessibleName("Change language: English");
    // Keyboard: open, move, choose.
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const menu = page.locator(".b-language-menu:visible");
    await expect(menu.locator("button")).toHaveText([
      "English",
      "Español",
      "العربية",
    ]);
    // Every option has a drawn flag and a visible name; no emoji is used.
    await expect(menu.locator("button svg.b-flag")).toHaveCount(3);
    expect(await menu.innerText()).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
    await expect(menu.locator('[aria-current="true"]')).toHaveText("English");
    await page.screenshot({ path: `${shots}/language-menu-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(menu.locator('[data-locale="es"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator(".b-language:visible").first()).toContainText(
      "Español",
    );
    // Arabic: right-to-left, the menu stays inside the viewport.
    await page.locator(".b-language:visible").first().click();
    await page.locator('.b-language-menu:visible [data-locale="ar"]').click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator(".b-language:visible").first()).toContainText(
      "العربية",
    );
    await page.locator(".b-language:visible").first().click();
    const box = await page.locator(".b-language-menu:visible").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `${shots}/language-menu-ar-${width}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    // Clicking elsewhere closes it.
    await page.locator("main").click({ position: { x: 5, y: 300 } });
    await expect(page.locator(".b-language-menu:visible")).toHaveCount(0);
  }
});

// ---- 9 PM Dubai cutoff dialog (server time frozen per server) ----
const evening = [
  {
    port: 3232,
    time: "20:59",
    closed: false,
    normal: "2026-10-07",
    lead24: "2026-10-08",
  },
  {
    port: 3233,
    time: "21:00",
    closed: false,
    normal: "2026-10-07",
    lead24: "2026-10-08",
  },
  {
    port: 3234,
    time: "21:01",
    closed: true,
    normal: "2026-10-08",
    lead24: "2026-10-08",
  },
  {
    port: 3235,
    time: "23:59",
    closed: true,
    normal: "2026-10-08",
    lead24: "2026-10-08",
  },
  // Just after midnight it is 7 October: ordinary next-day rules for the new day.
  {
    port: 3236,
    time: "00:01",
    closed: false,
    normal: "2026-10-08",
    lead24: "2026-10-08",
  },
];
for (const t of evening)
  for (const kind of ["Delivery", "Pickup"] as const)
    test(`${t.time} Dubai · ${kind}: ${t.closed ? "dialog explains the cutoff" : "no dialog, next day open"}`, async ({
      page,
    }) => {
      const base = `http://127.0.0.1:${t.port}`;
      const dialog = page.getByRole("dialog", {
        name: "Next-day ordering is closed",
      });
      for (const [product, earliest] of [
        [NORMAL, t.normal],
        [LEAD24, t.lead24],
      ] as const) {
        await page.goto(base);
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
        await addToCart(page, product, base);
        await page.goto(`${base}/checkout`);
        if (kind === "Pickup")
          await page
            .getByRole("radio", { name: "PICKUP", exact: true })
            .check();
        else await chooseArea(page, "JLT", "JLT Cluster C");
        // Never on page load.
        await expect(dialog).toHaveCount(0);
        const date = page.getByLabel(`${kind} date`, { exact: true });
        await expect(date).toHaveAttribute("min", earliest);
        await date.focus();
        if (!t.closed) {
          await expect(dialog).toHaveCount(0);
          await date.fill(earliest);
          await expect(dialog).toHaveCount(0);
          await expect(date).toHaveValue(earliest);
          continue;
        }
        // Reaching the date selection after 9:01 PM explains the cutoff once.
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(
          "Orders for next-day production close at 9:00 PM Dubai time.",
        );
        await expect(dialog).toContainText(
          "The earliest available production date is now Thursday 8 October.",
        );
        if (product === NORMAL && kind === "Delivery" && t.time === "21:01")
          await page.screenshot({ path: `${shots}/cutoff-dialog-1440.png` });
        // Dismissing it changes nothing: tomorrow is still not accepted.
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(date).toHaveValue("");
        await date.focus();
        await expect(dialog).toHaveCount(0); // not shown again on every focus
        await date.fill("2026-10-07");
        await expect(dialog).toBeVisible(); // trying the closed date explains it
        await expect(date).toHaveValue("");
        await dialog
          .getByRole("button", { name: "Continue", exact: true })
          .click();
        await expect(date).toHaveValue("");
        await date.fill("2026-10-07");
        await dialog
          .getByRole("button", { name: "Choose Thursday 8 October" })
          .click();
        await expect(dialog).toHaveCount(0);
        await expect(date).toHaveValue("2026-10-08");
        // The server refuses the closed date regardless of what a browser sends.
        const rejected = await page.request.post(`${base}/api/checkout/web`, {
          headers: { origin: base, "idempotency-key": crypto.randomUUID() },
          data: {
            lines: [{ productId: "conchas-filled-pistache-mini", quantity: 3 }],
            customer: {
              firstName: "Late",
              lastName: "Order",
              phone: "0500000000",
              email: "late@example.invalid",
            },
            ...(kind === "Pickup"
              ? {
                  fulfillmentMethod: "pickup",
                  pickup: {
                    pickupDate: "2026-10-07",
                    preferredTime: "4:00 PM – 9:00 PM",
                  },
                  billing: {
                    sameAsDelivery: false,
                    name: "Late Order",
                    address1: "Fixture",
                    city: "Dubai",
                    country: "AE",
                  },
                }
              : {
                  delivery: {
                    zoneId: "jlt-cluster-c",
                    address: "Fixture street",
                    building: "Fixture Tower",
                    date: "2026-10-07",
                    slot: "4:00 PM – 9:00 PM",
                  },
                  billing: { sameAsDelivery: true },
                }),
          },
        });
        expect(rejected.ok()).toBe(false);
      }
    });
test("mobile: the cutoff dialog fits a 390px screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const base = "http://127.0.0.1:3234";
  await addToCart(page, NORMAL, base);
  await page.goto(`${base}/checkout`);
  await page.getByRole("radio", { name: "PICKUP", exact: true }).check();
  await page.getByLabel("Pickup date", { exact: true }).focus();
  const dialog = page.getByRole("dialog", {
    name: "Next-day ordering is closed",
  });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await expect(dialog.getByRole("button", { name: /^Choose / })).toBeFocused();
  await page.screenshot({ path: `${shots}/cutoff-dialog-390.png` });
});
