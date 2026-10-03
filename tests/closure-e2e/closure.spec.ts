import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const shots = "work/qa/closure";
const family = (page: Page, id: string) =>
  page.locator(`[data-menu-family="${id}"]`);
async function addVariants(page: Page) {
  await page.goto("/menu?category=pan");
  await page
    .getByRole("navigation", { name: "Menu categories" })
    .getByRole("button", { name: "Pan de Muerto", exact: true })
    .click();
  const filled = family(page, "pan-de-muerto-filled");
  await filled
    .getByRole("combobox", { name: "Filling", exact: true })
    .selectOption("Pistachio");
  await filled
    .getByRole("combobox", { name: "Size / pack", exact: true })
    .selectOption("Individual");
  await filled
    .getByRole("button", { name: "ADD TO CART · AED 21", exact: true })
    .click();
  const traditional = family(page, "pan-de-muerto-traditional");
  await traditional
    .getByRole("combobox", { name: "Flavour", exact: true })
    .selectOption("Azúcar · Chocolate covering");
  await traditional
    .getByRole("combobox", { name: "Size / pack", exact: true })
    .selectOption("Individual · 70 g");
  await traditional
    .getByRole("button", { name: "ADD TO CART · AED 13", exact: true })
    .click();
}
test("actual Pan variants persist selector → cart → checkout → database → dashboard → customer tracking", async ({
  page,
  context,
  request,
}) => {
  mkdirSync(shots, { recursive: true });
  await context.route("https://pay.test.paymennt.com/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<h1>Fixture hosted payment</h1>",
    }),
  );
  await addVariants(page);
  await page.goto("/cart");
  await expect(page.locator("main")).toContainText("Pistachio");
  await expect(page.locator(".b-co-item").first()).not.toContainText(
    "Chocolate",
  );
  await expect(page.locator("main")).toContainText("Chocolate covering");
  await expect(page.locator("main")).toContainText("AED 34");
  await page.getByRole("link", { name: "CONTINUE TO DELIVERY" }).click();
  await page.getByLabel("Delivery area").selectOption("jlt-cluster-c");
  await page
    .getByLabel("Street address and community")
    .fill("Approved coverage fixture");
  await page.getByLabel("Building or villa").fill("Fixture Tower");
  await page.getByLabel("Delivery date").fill("2026-10-22");
  await page
    .getByRole("combobox", { name: "Delivery time", exact: true })
    .selectOption("4:00 PM – 9:00 PM");
  await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();
  await page.getByLabel("Full name").fill("Closure Fixture");
  await page
    .getByLabel("Email for payment receipt")
    .fill("fixture@example.invalid");
  await page.getByLabel("Mobile number").fill("0500000000");
  await page.getByRole("button", { name: "REVIEW ORDER" }).click();
  await expect(
    page.getByRole("region", { name: "Order review" }),
  ).toContainText("Chocolate covering");
  await page.getByRole("checkbox", { name: /I've reviewed/ }).check();
  await page.getByRole("button", { name: "PAY AED 34", exact: true }).click();
  await expect(page).toHaveURL(/pay.test.paymennt.com/);
  await page.goto("http://127.0.0.1:3198/checkout/return");
  await expect(page.getByRole("heading", { name: /Thank you/ })).toBeVisible();
  const capability = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("3l-checkout")!),
  );
  const status = await request.post("/api/checkout/status", {
    data: { key: capability.key },
    headers: { origin: "http://127.0.0.1:3198" },
  });
  expect(status.ok()).toBe(true);
  const data = await status.json();
  expect(data.status).toBe("Confirmed");
  expect(
    data.summary.items.map((i: { productId: string }) => i.productId),
  ).toEqual(
    expect.arrayContaining([
      "pan-de-muerto-filled-pistachio-individual",
      "pan-de-muerto-traditional-azucar-individual-70-g-chocolate-covering",
    ]),
  );
  const saved = await (await request.get("/api/workspace")).json();
  const order = saved.orders.find((o: { id: string }) => o.id === data.orderId);
  expect(order.lines.map((l: { productId: string }) => l.productId)).toEqual(
    data.summary.items.map((i: { productId: string }) => i.productId),
  );
  expect(
    order.catalogSnapshot.some((p: { name: string }) =>
      p.name.includes("Pistachio"),
    ),
  ).toBe(true);
  expect(
    order.catalogSnapshot.find(
      (p: { id: string }) =>
        p.id === "pan-de-muerto-filled-pistachio-individual",
    ).description,
  ).toContain("Pistachio");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: `${shots}/tracking-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto("/operations/orders");
  await page.getByRole("button", { name: /^Todos los pedidos/ }).click();
  await expect(page.locator("main")).toContainText(data.orderId);
  await page
    .getByRole("article", { name: `Pedido ${data.orderId}` })
    .getByText("Ver pedido y seguimiento", { exact: true })
    .click();
  await expect(page.getByTestId("order-panel")).toContainText("Pistachio");
  await expect(page.getByTestId("order-panel")).toContainText(
    "Chocolate covering",
  );
  await page.screenshot({
    path: `${shots}/variant-dashboard-1440.png`,
    fullPage: true,
  });
});
test("cart quantity, removal, clear cancel/accept and floating support do not overlap", async ({
  page,
}) => {
  await addVariants(page);
  await page.goto("/cart");
  const first = page.locator(".b-co-item").first();
  // Operate by accessible names from the cart controls, not localStorage injection.
  await page
    .getByRole("button", { name: /^Increase / })
    .first()
    .click();
  await expect(page.locator("main")).toContainText("AED 55");
  await page
    .getByRole("button", { name: /^Decrease / })
    .first()
    .click();
  await expect(page.locator("main")).toContainText("AED 34");
  await page
    .getByRole("button", { name: /Remove/ })
    .first()
    .click();
  await expect(page.locator("main")).toContainText("AED 13");
  const wa = await page.locator(".b-shopping-wa").boundingBox(),
    cart = await page.locator(".b-floating-cart").boundingBox();
  expect(wa!.x + wa!.width).toBeLessThan(cart!.x);
  await expect(page.locator(".b-shopping-wa")).toHaveAttribute(
    "href",
    /wa.me\/971585943319/,
  );
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Clear cart", exact: true }).click();
  await expect(page.locator("main")).toContainText("AED 13");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Clear cart", exact: true }).click();
  await expect(page.locator("main")).toContainText("Your cart is empty");
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("3l-cart")!)),
  ).toEqual([]);
  void first;
});
test("approved coverage rejects forged HTTP area, client flags and changed address", async ({
  request,
}) => {
  const headers = { origin: "http://127.0.0.1:3198" };
  const body = {
    zoneId: "jlt-cluster-c",
    address: "Outside coverage fixture",
    building: "Fixture Tower",
  };
  const outside = await request.post("/api/checkout/address", {
    headers,
    data: body,
  });
  expect(outside.status()).toBe(422);
  expect(await outside.text()).toContain(
    "outside our current delivery coverage area",
  );
  expect(
    (
      await request.post("/api/checkout/address", {
        headers,
        data: {
          ...body,
          coverageValid: true,
          location: { lat: 25.1, lng: 55.25 },
        },
      })
    ).status(),
  ).toBe(400);
  const valid = await request.post("/api/checkout/address", {
    headers,
    data: { ...body, address: "Approved coverage fixture", zoneId: "downtown" },
  });
  expect((await valid.json()).zoneId).toBe("jlt-cluster-c");
});
for (const width of [390, 768, 1440])
  test(`locale persistence, RTL, public screenshots and console at ${width}`, async ({
    page,
  }) => {
    mkdirSync(shots, { recursive: true });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    for (const [route, name] of [
      ["/", "homepage"],
      ["/menu", "menu"],
      ["/how-to-order", "how-to-order"],
    ]) {
      await page.goto(route);
      await page
        .locator("img")
        .evaluateAll((images) =>
          images.forEach((image) => (image.loading = "eager")),
        );
      await expect
        .poll(
          () =>
            page.locator("img").evaluateAll((images) =>
              images.every((image) => {
                image.loading = "eager";
                return image.complete;
              }),
            ),
          { timeout: 10000 },
        )
        .toBe(true);
      await page
        .locator("img")
        .evaluateAll((images) =>
          Promise.all(
            images
              .filter((image) => image.complete && image.naturalWidth > 0)
              .map((image) => image.decode().catch(() => {})),
          ),
        );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (name === "homepage") {
        await page.evaluate(() => document.fonts.ready);
        writeFileSync(
          `${shots}/current-layout-${width}.json`,
          JSON.stringify(
            await page.evaluate(() =>
              Object.fromEntries(
                ["hero", "bridge", "featured", "tradition", "family"].map(
                  (name) => {
                    const r = document
                      .querySelector(".ref-" + name)!
                      .getBoundingClientRect();
                    return [name, { y: r.y + scrollY, height: r.height }];
                  },
                ),
              ),
            ),
            null,
            2,
          ),
        );
      }
      await page.screenshot({
        path: `${shots}/${name}-${width}.png`,
        fullPage: true,
      });
    }
    await addVariants(page);
    await family(page, "pan-de-muerto-filled").screenshot({
      path: `${shots}/product-${width}.png`,
    });
    for (const [route, name] of [
      ["/cart", "cart"],
      ["/checkout", "checkout"],
    ]) {
      await page.goto(route);
      await page
        .locator("img")
        .evaluateAll((images) =>
          images.forEach((image) => (image.loading = "eager")),
        );
      await expect
        .poll(
          () =>
            page.locator("img").evaluateAll((images) =>
              images.every((image) => {
                image.loading = "eager";
                return image.complete;
              }),
            ),
          { timeout: 10000 },
        )
        .toBe(true);
      if (name === "homepage") {
        await page.evaluate(() => document.fonts.ready);
        writeFileSync(
          `${shots}/current-layout-${width}.json`,
          JSON.stringify(
            await page.evaluate(() =>
              Object.fromEntries(
                ["hero", "bridge", "featured", "tradition", "family"].map(
                  (name) => {
                    const r = document
                      .querySelector(".ref-" + name)!
                      .getBoundingClientRect();
                    return [name, { y: r.y + scrollY, height: r.height }];
                  },
                ),
              ),
            ),
            null,
            2,
          ),
        );
      }
      await page.screenshot({
        path: `${shots}/${name}-${width}.png`,
        fullPage: true,
      });
    }
    await page.goto("/menu?lang=ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${shots}/rtl-menu-${width}.png`,
      fullPage: true,
    });
    await page.goto("/menu?category=pan&lang=ar");
    await page
      .getByRole("navigation", { name: "Menu categories" })
      .getByRole("button", { name: /Pan de Muerto/ })
      .click();
    const rtlFamily = family(page, "pan-de-muerto-filled");
    await rtlFamily.locator("select").first().selectOption("Pistachio");
    await expect(rtlFamily.locator("select").first()).toHaveValue("Pistachio");
    await page.goto("/checkout");
    await page.getByLabel("Delivery date").fill("2026-10-22");
    await page
      .getByRole("combobox", { name: /Delivery time/ })
      .selectOption("4:00 PM – 9:00 PM");
    await expect(
      page.getByRole("combobox", { name: /Delivery time/ }),
    ).toHaveValue("4:00 PM – 9:00 PM");
    await page.goto("/cart");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.goto("/operations/orders");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    expect(errors).toEqual([]);
  });

test("coverage rejection is recoverable through pickup in the customer workspace", async ({
  page,
}) => {
  await addVariants(page);
  await page.goto("/checkout");
  await page.getByLabel("Delivery area").selectOption("jlt-cluster-c");
  await page
    .getByLabel("Street address and community")
    .fill("Outside coverage fixture");
  await page.getByLabel("Building or villa").fill("Fixture Tower");
  await page.getByLabel("Delivery date").fill("2026-10-22");
  await page
    .getByRole("combobox", { name: "Delivery time", exact: true })
    .selectOption("4:00 PM – 9:00 PM");
  await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "This address is outside our current delivery coverage area.",
  );
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: `${shots}/coverage-rejected-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("radio", { name: "PICKUP", exact: true }).check();
  await page.getByLabel("Pickup date").fill("2026-10-22");
  await page
    .getByRole("combobox", { name: "Pickup time", exact: true })
    .selectOption("4:00 PM – 9:00 PM");
  await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();
  await expect(page.getByLabel("Full name")).toBeVisible();
});

test("minimum quote recalculates and elapsed server clock disables stale delivery windows", async ({
  page,
}) => {
  await page.clock.install();
  await addVariants(page);
  await page.goto("/checkout");
  await page.getByLabel("Delivery area").selectOption("jvc");
  await expect(page.locator("main")).toContainText(
    "Add AED 66 more to continue.",
  );
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS" }),
  ).toBeDisabled();
  await page.getByLabel("Delivery area").selectOption("jlt-cluster-c");
  await expect(page.locator("main")).not.toContainText(
    "Add AED 66 more to continue.",
  );
  await expect(page.getByLabel("Delivery date")).toHaveAttribute(
    "min",
    "2026-10-21",
  );
  await page.getByLabel("Delivery date").fill("2026-10-21");
  const time = page.getByRole("combobox", {
    name: "Delivery time",
    exact: true,
  });
  const morning = time.getByRole("option", {
    name: "8:00 AM – 1:00 PM",
    exact: true,
  });
  await expect(morning).toHaveJSProperty("disabled", false);
  await page.clock.fastForward(13 * 60 * 60 * 1000);
  await expect(morning).toHaveJSProperty("disabled", true);
  await expect(
    time.getByRole("option", { name: "1:00 PM – 4:00 PM", exact: true }),
  ).toHaveJSProperty("disabled", false);
  await page.getByLabel("Delivery date").fill("2026-10-20");
  for (const name of [
    "8:00 AM – 1:00 PM",
    "1:00 PM – 4:00 PM",
    "4:00 PM – 9:00 PM",
  ])
    await expect(
      time.getByRole("option", { name, exact: true }),
    ).toHaveJSProperty("disabled", true);
});
