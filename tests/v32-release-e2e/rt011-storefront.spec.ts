import { expect, test } from "@playwright/test";

const vanilla = "conchas-traditional--vainilla";
const individual = "conchas-traditional-vainilla-individual-70-g";
const chocolate = "conchas-traditional--chocolate";
const tricolor = "conchas-traditional--tricolor";
const chocolatePack = "conchas-traditional-pack";

for (const locale of ["en", "es", "ar"] as const) {
  test(`RT01.1 ${locale}: the card, dialog, SKU and persisted cart agree`, async ({
    page,
  }) => {
    await page.goto(`/bakery?category=conchas&lang=${locale}`);
    if (locale === "ar")
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const dialog = page.getByRole("dialog");
    const card = (id: string) =>
      page.locator(`[data-product-id="${id}"].ref32-product`);
    for (const id of [chocolate, tricolor, chocolatePack, vanilla]) {
      const current = card(id);
      const title = await current
        .locator(".ref32-product-copy strong")
        .innerText();
      await current.click();
      await expect(dialog).toHaveAttribute("data-product-id", id);
      await expect(dialog).toHaveAccessibleName(title);
      await expect(dialog.getByRole("heading")).toHaveText(title);
      if (locale === "ar") {
        await expect(dialog).toHaveAttribute("dir", "rtl");
        await expect(dialog.locator(".ref32-price strong")).toContainText(
          /د\.إ/,
        );
      }
      if (id !== vanilla) {
        await page.keyboard.press("Escape");
        await expect(current).toBeFocused();
      }
    }
    await expect(dialog.locator('[data-sku*="chocolate"]')).toHaveCount(0);
    await dialog.locator(`[data-sku="${individual}"]`).click();
    await expect(dialog).toHaveAttribute("data-selected-sku", individual);
    await dialog.locator(".ref32-buy").click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    const cart = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("3l-cart") ?? "[]"),
    );
    expect(cart).toEqual([{ productId: individual, quantity: 1 }]);
    const quote = await page.request.post("/api/checkout/quote", {
      headers: { Origin: new URL(page.url()).origin },
      data: { lines: cart, fulfillmentMethod: "pickup" },
    });
    expect(quote.ok()).toBeTruthy();
    const config = await (
      await page.request.get("/api/checkout/config")
    ).json();
    expect((await quote.json()).subtotalFils).toBe(
      config.products.find((item: { id: string }) => item.id === individual)
        .priceFils,
    );
    if (locale === "ar") {
      await page.goto("/cart?lang=ar");
      await expect(page.locator(".v32-new-cart-row")).toContainText(
        /كونشا|كونتشا/,
      );
      await expect(page.locator(".v32-new-total")).toContainText(/د\.إ/);
    }
  });
}

test("RT01.1 Pan de Muerto availability, Panettone direct navigation and stale cart", async ({
  page,
}) => {
  await page.route("**/api/checkout/config", async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config.serverNow = "2026-11-25T08:00:00.000Z";
    await route.fulfill({ response, json: config });
  });
  await page.goto("/bakery?category=pan");
  await expect(
    page.locator(".ref32-product[data-category-id=pan]"),
  ).toHaveCount(10);
  await expect(
    page.locator('[data-product-id="pan-de-muerto-filled--pistachio"]'),
  ).toBeEnabled();
  await page.goto("/bakery?category=panettone");
  await expect(page.getByRole("button", { name: "Panettone", exact: true })).toHaveCount(0);
  await expect(page.locator(".v32-search-empty")).toBeVisible();
  expect((await page.request.get("/menu/panettone")).status()).toBe(404);
  await expect(page.locator(".ref32-product")).toHaveCount(0);
  const categoryTrigger = page.locator(".category-trigger");
  if (await categoryTrigger.isVisible()) await categoryTrigger.click();
  await page
    .getByRole("button", { name: "Mexican Bakery", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Mexican Bakery", exact: true, includeHidden: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/category=mexican/);
  await expect(
    page.locator('[data-product-id="conchas-filled-pack"]'),
  ).toHaveCount(0);
  await page.goto("/bakery?q=pistache");
  await expect(
    page.locator('[data-product-id="conchas-traditional--pistache"]'),
  ).toHaveCount(0);
  await page.evaluate(() =>
    localStorage.setItem(
      "3l-cart",
      JSON.stringify([
        { productId: "conchas-filled-pack-6-mini", quantity: 1 },
        {
          productId: "conchas-traditional-vainilla-individual-70-g",
          quantity: 1,
        },
      ]),
    ),
  );
  await page.goto("/cart");
  await expect(page.getByRole("alert")).toContainText("no longer available");
  await expect(page.locator('a[href="/checkout"]')).toHaveCount(0);
  await page.goto("/checkout");
  await expect(page.getByRole("alert")).toContainText("no longer available");
});

test("RT01.1 cold HTML, portrait completion, reduced motion, contacts and journal", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const origin = new URL(testInfo.project.use.baseURL!);
  const cold = await browser.newContext({ javaScriptEnabled: false, viewport: page.viewportSize() });
  try {
    const firstPaint = await cold.newPage();
    await firstPaint.goto(origin.href);
    await expect(firstPaint.locator(".home-main")).toBeVisible();
    await expect(firstPaint.locator(".brand-experience")).toHaveCount(0);
    await expect(firstPaint.getByRole("img", { name: "Alicia Luna Baeza" })).toBeVisible();
    await firstPaint.screenshot({path: testInfo.outputPath("home-first-paint.png"), fullPage: true});
  } finally {
    await cold.close();
  }
  await page.goto("/");
  await expect(page.locator(".ref-scroll-sketch")).toBeVisible();
  const sketch = page.locator(".v32-family-portrait .ref-scroll-sketch");
  await expect
    .poll(async () => Number(await sketch.getAttribute("data-drawn")))
    .toBeGreaterThan(0.05);
  await expect(page.locator(".v32-family-portrait")).toHaveAttribute(
    "data-entrance",
    "complete",
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("home-portrait-final.png"),
    fullPage: true,
  });
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 768, height: 900 });
  await page.screenshot({
    path: testInfo.outputPath("home-768.png"),
    fullPage: true,
  });
  await page.setViewportSize(originalViewport);

  const noJs = await browser.newContext({ javaScriptEnabled: false });
  try {
    const staticPage = await noJs.newPage();
    const base = new URL(page.url()).origin;
    for (const path of [
      "/",
      "/menu",
      "/bakery",
      "/journal",
      "/contact",
      "/menu/" + vanilla,
    ]) {
      expect((await staticPage.goto(base + path))?.status()).toBe(200);
      await expect(staticPage.locator(".v32-app h1")).toBeVisible();
      await expect(staticPage.locator(".brand-experience")).toHaveCount(0);
    }
    await expect(staticPage).toHaveTitle(/Concha/i);
    for (const path of ["/menu/conchas-filled-pack", "/unknown"]) {
      expect((await staticPage.goto(base + path))?.status()).toBe(404);
    }
  } finally {
    await noJs.close();
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(sketch).toHaveAttribute("data-drawn", "1.0000");
  await expect(page.locator("a[href='/#family-story']").first()).toBeVisible();
  await page.goto("/journal?lang=es");
  await expect(page.locator("h1")).toContainText("Una corona dulce");
  await expect(page.locator(".v32-journal")).toContainText("6 de enero");
  await page.screenshot({
    path: testInfo.outputPath("journal.png"),
    fullPage: true,
  });
  for (const pathname of ["/contact", "/terms", "/privacy"]) {
    await page.goto(pathname);
    await expect(
      page.locator('a[href^="https://wa.me/971585943319"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('a[href="tel:+971556406776"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('a[href*="521683319"],a[href*="506757352"]'),
    ).toHaveCount(0);
  }
});

test("Arabic geography and category history stay stable at 390, 768 and 1440", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?lang=ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const journey = page.locator(".journey");
    await expect(journey).toHaveAttribute("dir", "ltr");
    const mexico = journey.locator('[data-city="mexico"]');
    const dubai = journey.locator('[data-city="dubai"]');
    await expect(mexico).toHaveText(/مدينة مكسيكو.*١٩٨٢/);
    await expect(dubai).toHaveText(/دبي.*اليوم/);
    const [first, path, last] = await Promise.all([
      mexico.boundingBox(),
      journey.locator(".journey-svg").boundingBox(),
      dubai.boundingBox(),
    ]);
    expect(first!.x).toBeLessThan(path!.x);
    expect(path!.x).toBeLessThan(last!.x);
    for (const city of [mexico, dubai])
      await expect
        .poll(() => city.locator("img").evaluate((image) => image.naturalWidth))
        .toBeGreaterThan(0);
    await expect(mexico.locator("img")).toHaveAttribute("src", "/brand/vr008/mexico.png");
    await expect(dubai.locator("img")).toHaveAttribute("src", "/brand/vr008/dubai.jpg");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: info.outputPath(`home-ar-${width}.png`),
      fullPage: true,
    });
  }
  await page.goto("/bakery?category=mexican&lang=ar");
  const conchas = page.locator(
    ".v32-subcategories button[data-category-id=conchas]",
  );
  await expect(conchas).toHaveText("كونشا");
  await conchas.click();
  await expect(page).toHaveURL(/subcategory=conchas/);
  await expect(conchas).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(".ref32-product[data-category-id=pan]"),
  ).toHaveCount(0);
  await page.goBack();
  await expect(conchas).toHaveAttribute("aria-pressed", "false");
  await page.goForward();
  await expect(conchas).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(conchas).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("searchbox", { name: "ابحث في القائمة" })
    .fill("fictional-no-results");
  await page.getByRole("searchbox", { name: "ابحث في القائمة" }).press("Enter");
  await expect(page).toHaveURL(/q=fictional-no-results/);
  await expect(page.locator(".v32-search-empty")).toHaveText(
    "لا توجد منتجات مطابقة.",
  );
  await page.goBack();
  await expect(page.locator(".ref32-product").first()).toBeVisible();
  await page.locator(".mast").getByRole("link", { name: "المجلة", exact: true }).click();
  await expect(page).toHaveURL(/journal/);
  await expect(page.locator(".v32-journal h1")).toContainText("على هيئة تاج");
});
