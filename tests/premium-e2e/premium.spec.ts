import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { PACK_SPECS, componentName } from "../../shared/pack-composition";
import { packCopy } from "../../shared/pack-copy";
const shots = "work/qa/premium";
mkdirSync(shots, { recursive: true });
const select = async (
  page: import("@playwright/test").Page,
  spec: (typeof PACK_SPECS)[number],
) => {
  await page
    .locator(".b-menu-selectors select")
    .selectOption(`${spec.capacity} ${spec.size}`);
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
        await page.goto(
          `/menu?product=pan-de-muerto-${family}-pack&lang=${lang}`,
        );
        await expect(page.locator(".b-pack-builder")).toBeVisible();
        await select(page, spec);
        const premium = spec.components.find((c) =>
          family === "traditional"
            ? c.componentSkuId.endsWith("-chocolate-covering")
            : c.componentSkuId.includes("filled-pistachio"),
        )!;
        const builder = page.locator(".b-pack-builder");
        await expect(builder).toContainText(packCopy(lang).premiumNote);
        await expect(builder).toContainText(packCopy(lang).perPiece);
        await builder
          .getByRole("spinbutton", {
            name: componentName(spec.components[0]!.componentSkuId, lang),
            exact: true,
          })
          .fill("4");
        await expect(page.locator(".b-add-to-cart > button")).toBeDisabled();
        await builder
          .getByRole("spinbutton", {
            name: componentName(premium.componentSkuId, lang),
            exact: true,
          })
          .fill("2");
        await expect(page.locator(".b-add-to-cart > button")).toBeEnabled();
        const expected = family === "traditional" ? 7000 : 14600;
        const button = page.locator(".b-add-to-cart > button");
        await expect(button).toContainText(
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
          (await new AxeBuilder({ page }).include(".b-pack-builder").analyze())
            .violations,
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `${shots}/${info.project.name}-${width}-${lang}-${family}.png`,
          fullPage: true,
        });
        await button.click();
      }
      await page.goto(`/cart?lang=${lang}`);
      await expect(page.locator(".b-co-item")).toHaveCount(2);
      await page.reload();
      await expect(page.locator(".b-co-item")).toHaveCount(2);
      await expect(page.locator(".b-co-item-total").nth(0)).toContainText(
        /70|٧٠/,
      );
      await expect(page.locator(".b-co-item-total").nth(1)).toContainText(
        /146|١٤٦/,
      );
      await page.screenshot({
        path: `${shots}/${info.project.name}-${width}-${lang}-cart.png`,
        fullPage: true,
      });
      await page.goto(`/checkout?lang=${lang}`);
      await expect(page.locator(".b-co-summary")).toContainText(/216|٢١٦/);
      expect(errors).toEqual([]);
    });
test("all eight formats expose the approved per-piece rate and final price; premium 12-piece boxes contain exactly twelve pieces", async ({
  page,
}) => {
  for (const spec of PACK_SPECS) {
    await page.goto(`/menu?product=pan-de-muerto-${spec.family}-pack&lang=en`);
    await expect(page.locator(".b-pack-builder")).toBeVisible();
    await select(page, spec);
    const c = spec.components.find((c) =>
      spec.family === "traditional"
        ? c.componentSkuId.endsWith("-chocolate-covering")
        : c.componentSkuId.includes("filled-pistachio"),
    )!;
    await page
      .locator(".b-pack-builder")
      .getByRole("spinbutton", {
        name: componentName(c.componentSkuId),
        exact: true,
      })
      .fill(String(spec.capacity));
    await expect(page.locator(".b-pack-builder")).toContainText(
      `${spec.capacity} / ${spec.capacity}`,
    );
    await expect(page.locator(".b-add-to-cart > button")).toBeEnabled();
    const rate =
      spec.family === "traditional"
        ? spec.size === "mini"
          ? 5
          : 6
        : spec.size === "mini"
          ? 23
          : 26;
    await expect(page.locator(".b-pack-builder")).toContainText(
      new RegExp(`\\+ AED.?${rate}\\.00 per piece`),
    );
    const cfg = await (await page.request.get("/api/checkout/config")).json();
    const total =
      cfg.products.find((p: { id: string }) => p.id === spec.packSkuId)
        .priceFils /
        100 +
      spec.capacity * rate;
    await expect(page.locator(".b-add-to-cart > button")).toContainText(
      String(total),
    );
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
  await expect(
    page.getByText("AED 70.00 per box · AED 70.00 line total", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("AED 146.00 per box · AED 146.00 line total", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("AED 123.00 per box · AED 246.00 line total", {
      exact: true,
    }),
  ).toBeVisible();
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
