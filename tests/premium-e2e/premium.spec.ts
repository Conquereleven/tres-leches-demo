import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { PACK_SPECS, componentName } from "../../shared/pack-composition";
const shots = "work/qa/premium";
mkdirSync(shots, { recursive: true });
// Canonical V3.2 interaction (the retired `.b-pack-builder` / `.b-menu-*`
// anatomy no longer renders). Packs are year-round (seasonal rules exclude
// `-pack-`); singles stay seasonal. Prices always come from the server.
const openPackDialog = async (
  page: import("@playwright/test").Page,
  family: string,
  lang: string,
) => {
  await page.goto(`/bakery?category=mexican&lang=${lang}`);
  // Same transient fixture-server drop as in conchas-e2e: settle on the real
  // grid or the UI's own TRY AGAIN state, then recover exactly once (a retry
  // loop would storm the single-threaded fixture server). Never bypassed.
  const retry = page.getByRole("button", {
    name: /try again|reintentar|حاول مجدداً/i,
  });
  let state = "waiting";
  await expect
    .poll(async () => {
      if (await page.locator(".ref32-grid").count()) state = "ready";
      else if (await retry.count()) state = "unavailable";
      return state;
    }, { timeout: 20000 })
    .not.toBe("waiting");
  if (state === "unavailable") {
    // Best-effort recovery: a successful retry unmounts this very button
    // mid-click, so a detach-race here must not fail the test. The grid
    // assertion below stays the strict gate.
    await retry.first().click({ timeout: 5000 }).catch(() => {});
    await expect(page.locator(".ref32-grid")).toBeVisible({ timeout: 15000 });
  } else {
    await expect(page.locator(".ref32-grid")).toBeVisible();
  }
  const pan = page.locator('.v32-subcategories [data-category-id="pan"]');
  if (await pan.count()) await pan.click();
  const card = page.locator(
    `[data-product-id="pan-de-muerto-${family}-pack"]`,
  );
  await expect(card).toBeEnabled({ timeout: 12000 });
  await card.scrollIntoViewIfNeeded();
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".ref32-dialog-footer")).toBeVisible();
  return dialog;
};
const fillComponent = async (
  dialog: import("@playwright/test").Locator,
  componentSkuId: string,
  lang: string,
  units: number,
) => {
  // Exact span match: "Sugar" must not match "Sugar with chocolate covering".
  const wanted = componentName(componentSkuId, lang as "en" | "es" | "ar");
  const rows = dialog.locator(".ref32-composition-row");
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  let row = null as import("@playwright/test").Locator | null;
  for (let i = 0; i < count; i++) {
    const label = (await rows.nth(i).locator("span").first().innerText()).trim();
    if (label === wanted) {
      row = rows.nth(i);
      break;
    }
  }
  if (!row) throw new Error(`composition row not found: ${wanted}`);
  for (let i = 0; i < units; i++)
    await row.locator("button").nth(1).click();
};
for (const width of [390, 768, 1440])
  for (const lang of ["en", "es", "ar"])
    test(`${width}px ${lang}: premium labels, exact piece capacity, immediate prices, cart refresh and quote`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      for (const family of ["traditional", "filled"]) {
        const spec = PACK_SPECS.find(
          (s) => s.family === family && s.capacity === 6 && s.size === "mini",
        )!;
        const dialog = await openPackDialog(page, family, lang);
        await dialog.locator(`[data-sku="${spec.packSkuId}"]`).click();
        await expect(dialog).toHaveAttribute("data-selected-sku", spec.packSkuId);
        const premium = spec.components.find((c) =>
          family === "traditional"
            ? c.componentSkuId.endsWith("-chocolate-covering")
            : c.componentSkuId.includes("filled-pistachio"),
        )!;
        const buy = dialog.locator(".ref32-buy");
        // Negative: an incomplete composition holds the CTA.
        await expect(dialog.locator(".ref32-composition")).toBeVisible();
        await expect(buy).toBeDisabled();
        await fillComponent(dialog, spec.components[0]!.componentSkuId, lang, 4);
        await expect(buy).toBeDisabled();
        // Positive: exactly 6 approved components enable the CTA.
        await fillComponent(dialog, premium.componentSkuId, lang, 2);
        await expect(dialog.locator(".ref32-composition")).toContainText("6/6");
        await expect(buy).toBeEnabled();
        const expected = family === "traditional" ? 7000 : 14600;
        await expect(dialog.locator(".ref32-price strong")).toContainText(
          family === "traditional" ? /70|٧٠/ : /146|١٤٦/,
        );
        const quote = await (
          await page.request.post("/api/checkout/quote", {
            headers: { Origin: "http://127.0.0.1:3284" },
            data: {
              lines: [
                {
                  productId: spec.packSkuId,
                  quantity: 1,
                  composition: [
                    {
                      componentSkuId: spec.components[0]!.componentSkuId,
                      units: 4,
                    },
                    { componentSkuId: premium.componentSkuId, units: 2 },
                  ],
                },
              ],
              fulfillmentMethod: "pickup",
            },
          })
        ).json();
        expect(quote.totalFils).toBe(expected);
        expect(
          (await new AxeBuilder({ page }).include(".ref32-dialog").analyze())
            .violations,
        ).toEqual([]);
        expect(await page.locator("html").getAttribute("dir")).toBe(
          lang === "ar" ? "rtl" : "ltr",
        );
        await page.screenshot({
          path: `${shots}/${info.project.name}-${width}-${lang}-${family}.png`,
          fullPage: true,
        });
        await buy.click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        // Page overflow is measured with the dialog closed: on mobile the
        // approved active-card zoom (scale 1.62) intentionally extends past
        // the viewport while the dialog is open and must not fail page health.
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      await page.goto(`/cart?lang=${lang}`);
      await expect(page.locator('[data-new-ui="cart"]')).toBeVisible();
      await expect(
        page.locator(".v32-new-cart-items .v32-new-cart-row"),
      ).toHaveCount(2);
      await expect(
        page.locator('.v32-new-cart-row input[type="number"]').first(),
      ).toHaveAttribute("max", "100");
      await page.reload();
      await expect(
        page.locator(".v32-new-cart-items .v32-new-cart-row"),
      ).toHaveCount(2);
      await expect(
        page.locator(".v32-new-cart-items"),
      ).toContainText(/70|٧٠/);
      await expect(
        page.locator(".v32-new-cart-items"),
      ).toContainText(/146|١٤٦/);
      await page.screenshot({
        path: `${shots}/${info.project.name}-${width}-${lang}-cart.png`,
        fullPage: true,
      });
      await page.goto(`/checkout?lang=${lang}`);
      await expect(page.locator(".b-shop .b-co-summary")).toContainText(
        /216|٢١٦/,
      );
      expect(errors).toEqual([]);
    });
test("all eight formats expose the approved per-piece rate and final price; premium 12-piece boxes contain exactly twelve pieces", async ({
  page,
}) => {
  for (const spec of PACK_SPECS) {
    const dialog = await openPackDialog(page, spec.family, "en");
    await dialog.locator(`[data-sku="${spec.packSkuId}"]`).click();
    await expect(dialog).toHaveAttribute("data-selected-sku", spec.packSkuId);
    const c = spec.components.find((c) =>
      spec.family === "traditional"
        ? c.componentSkuId.endsWith("-chocolate-covering")
        : c.componentSkuId.includes("filled-pistachio"),
    )!;
    await fillComponent(dialog, c.componentSkuId, "en", spec.capacity);
    await expect(dialog.locator(".ref32-composition")).toContainText(
      `${spec.capacity}/${spec.capacity}`,
    );
    await expect(dialog.locator(".ref32-buy")).toBeEnabled();
    const rate =
      spec.family === "traditional"
        ? spec.size === "mini"
          ? 5
          : 6
        : spec.size === "mini"
          ? 23
          : 26;
    const cfg = await (await page.request.get("/api/checkout/config")).json();
    const total =
      cfg.products.find((p: { id: string }) => p.id === spec.packSkuId)
        .priceFils /
        100 +
      spec.capacity * rate;
    // Server-authoritative total for a full premium box, never a client multiple.
    await expect(dialog.locator(".ref32-price strong")).toContainText(
      String(total),
    );
    const quote = await (
      await page.request.post("/api/checkout/quote", {
        headers: { Origin: "http://127.0.0.1:3284" },
        data: {
          lines: [
            {
              productId: spec.packSkuId,
              quantity: 1,
              composition: [{ componentSkuId: c.componentSkuId, units: spec.capacity }],
            },
          ],
          fulfillmentMethod: "pickup",
        },
      })
    ).json();
    expect(quote.totalFils).toBe(
      cfg.products.find((p: { id: string }) => p.id === spec.packSkuId).priceFils +
        spec.capacity * rate * 100,
    );
    await dialog.locator(".ref32-buy").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.evaluate(() => localStorage.removeItem("3l-cart"));
  }
});
test("integrated premium kitchen email contains parent-first frozen prices with no component product charges", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const requests: string[] = [];
  await page.route("**/*", (r) => {
    requests.push(r.request().url());
    return r.abort();
  });
  await page.setContent(
    readFileSync("docs/pack-pricing/fictional-premium-kitchen.html", "utf8"),
  );
  await expect(
    page.getByRole("heading", { name: "Total paid: AED 462.00" }),
  ).toBeVisible();
  await expect(page.getByText("AED 70.00", { exact: true })).toBeVisible();
  await expect(
    page.getByText("AED 146.00", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("AED 123.00 per box", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("AED 246.00", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(requests).toEqual([]);
  await page.screenshot({
    path: `${shots}/${info.project.name}-390-kitchen.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: `${shots}/${info.project.name}-1440-kitchen.png`,
    fullPage: true,
  });
});

test("fake hosted checkout, duplicate paid reconciliation and frozen preparation summary agree on premium prices", async ({
  page,
  request,
}, info) => {
  const traditional = PACK_SPECS[0]!,
    filled = PACK_SPECS[4]!;
  const make = (s: typeof traditional, q: number) => ({
    productId: s.packSkuId,
    quantity: q,
    composition: [
      { componentSkuId: s.components[0]!.componentSkuId, units: 4 },
      {
        componentSkuId: s.components.find((c) =>
          s.family === "traditional"
            ? c.componentSkuId.endsWith("-chocolate-covering")
            : c.componentSkuId.includes("filled-pistachio"),
        )!.componentSkuId,
        units: 2,
      },
    ],
  });
  const cfg = await (await request.get("/api/checkout/config")).json();
  const key = crypto.randomUUID();
  const headers = { Origin: "http://127.0.0.1:3284", "Idempotency-Key": key };
  const body = {
    lines: [make(traditional, 1), make(filled, 2)],
    fulfillmentMethod: "pickup",
    pickup: { pickupDate: cfg.dates.min, preferredTime: "4:00 PM – 9:00 PM" },
    customer: {
      firstName: "Premium",
      lastName: "Fixture",
      phone: "0500000000",
      email: "fixture@example.invalid",
      instructions: "Fictional original instructions",
    },
    billing: {
      sameAsDelivery: false,
      name: "Premium Fixture",
      address1: "Fixture street",
      city: "Dubai",
      country: "AE",
    },
  };
  const q = await (
    await request.post("/api/checkout/quote", {
      headers,
      data: { lines: body.lines, fulfillmentMethod: "pickup" },
    })
  ).json();
  expect(q.totalFils).toBe(36200);
  const response = await request.post("/api/checkout/web", {
    headers: { ...headers, "X-Checkout-Quote-Revision": q.quoteRevision },
    data: body,
  });
  expect(response.status(), await response.text()).toBe(200);
  const checkout = await response.json();
  expect(checkout.amountFils).toBe(36200);
  const replay = await request.post("/api/checkout/web", {
    headers,
    data: body,
  });
  expect((await replay.json()).orderId).toBe(checkout.orderId);
  await request.post("/__fixture/paid");
  for (let i = 0; i < 2; i++) {
    const paid = await request.post("/api/checkout/reconcile", {
      headers,
      data: { key },
    });
    expect(paid.status(), await paid.text()).toBe(200);
    const data = await paid.json();
    expect(data.paymentStatus).toBe("paid");
    expect(
      data.summary.items.map((i: { lineFils: number }) => i.lineFils),
    ).toEqual([7000, 29200]);
  }
  const login = await page.request.post("/api/login", {
    headers,
    data: { id: "admin", password: "pack-fixture-password" },
  });
  expect(login.status(), await login.text()).toBe(200);
  const cookie = login.headers()["set-cookie"]!.split(";")[0]!;
  // Existing loopback-only fixture convention; Production cookie flags are unchanged.
  await page.context().addCookies([
    {
      name: cookie.split("=")[0]!,
      value: cookie.slice(cookie.indexOf("=") + 1),
      url: "http://127.0.0.1:3284",
      httpOnly: true,
      secure: false,
      sameSite: "Strict",
    },
  ]);
  await page.goto(`/operations/orders/${checkout.orderId}`);
  await expect(
    page.getByText(/Sugar with chocolate covering/).first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "pan-de-muerto-traditional-pack-6-mini" }),
  ).toContainText("AED 70.00");
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "pan-de-muerto-filled-pack-6-mini" }),
  ).toContainText("AED 292.00");
  await page.goto("/operations/print");
  await page
    .getByRole("combobox", { name: "Order", exact: true })
    .selectOption(checkout.orderId);
  await expect(page.locator(".ops-ticket")).toContainText(
    "Sugar with chocolate covering",
  );
  await expect(page.locator(".ops-ticket")).toContainText("Pistachio");
  await expect(page.locator(".ops-ticket")).toContainText(
    "Unit price: AED 70.00",
  );
  await expect(page.locator(".ops-ticket")).toContainText(
    "Unit price: AED 146.00",
  );
  await expect(page.locator(".ops-ticket")).toContainText(
    "Line total: AED 292.00",
  );
  await page.screenshot({
    path: `${shots}/${info.project.name}-premium-ticket.png`,
    fullPage: true,
  });
  // Read-only response corruption: an accepted order must not reconstruct its
  // historical money from the mutable catalog when its snapshot is absent.
  await page.route("**/api/workspace", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const order = data.orders.find(
      (o: { id: string }) => o.id === checkout.orderId,
    );
    delete order.catalogSnapshot;
    // Exercise Inbox's shared accepted-money view with a synthetic conversation;
    // genuine website conversations correctly remain outside Inbox.
    const conversation = data.conversations.find(
      (c: { id: string }) => c.id === order.conversationId,
    );
    conversation.sourceNumberId = "fixture-inbox";
    await route.fulfill({ response, json: data });
  });
  await page.goto(`/operations/orders/${checkout.orderId}`);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Current catalog prices are not substituted" }),
  ).toBeVisible();
  await page.goto("/operations/inbox");
  await page.getByRole("button").filter({ hasText: "Premium Fixture" }).click();
  await expect(
    page.getByTestId("order-panel").locator(".co-lines"),
  ).toContainText("Review required");
});
