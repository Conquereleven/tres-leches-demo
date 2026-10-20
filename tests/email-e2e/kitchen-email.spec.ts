import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync, writeFileSync } from "node:fs";

for (const width of [390, 1024]) {
  test(`frozen kitchen email ${width}px: hierarchy, prices, notes, accessible fluid layout and no network`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const requested: string[] = [];
    await page.route("**/*", (route) => {
      requested.push(route.request().url());
      return route.abort();
    });
    await page.setContent(
      readFileSync("docs/email/previews/fictional-paid-order.html", "utf8"),
    );
    await expect(
      page.getByRole("heading", { name: "Order #042 · PAID", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Customer instructions / allergies" }),
    ).toBeVisible();
    await expect(
      page.getByText("ALLERGY: peanuts", { exact: false }),
    ).toContainText("Gracias — شكراً.");
    const boxes = page.locator('[data-kitchen-item="pack"]');
    await expect(boxes).toHaveCount(3);
    for (const box of await boxes.all()) {
      const structure = await box.evaluate((el) => {
        const title = el.querySelector("h2")!;
        const inside = el.querySelector("h3")!;
        return !!(
          title.compareDocumentPosition(inside) &
          Node.DOCUMENT_POSITION_FOLLOWING
        );
      });
      expect(structure).toBe(true);
      const list = await box.locator("li").allTextContents();
      expect(list.every((text) => !text.includes("AED"))).toBe(true);
    }
    await expect(
      page.getByText("TOTAL: 12 pieces · 2 boxes", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Total paid: AED 441.00",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "Open order in Operations (sign-in required)",
      }),
    ).toHaveAttribute(
      "href",
      "https://www.3ldubai.ae/operations/orders?order=TL-FICTIONAL-EMAIL",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    expect(requested).toEqual([]);
    await page.screenshot({
      path: `docs/email/previews/${browserName}-${width}.png`,
      fullPage: true,
    });
  });
}
test("long original notes and malicious customer HTML remain text without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const source = readFileSync(
    "docs/email/previews/fictional-paid-order.html",
    "utf8",
  );
  await page.setContent(
    source.replace(
      "ALLERGY: peanuts",
      "&lt;script&gt;malicious&lt;/script&gt; " + "LongCustomerText".repeat(80),
    ),
  );
  expect(await page.locator("script").count()).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

for (const width of [320, 375, 390, 430, 1024]) {
  test(`compact typical ${width}px: measured screenshot brief`, async ({
    page,
    browserName,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const requested: string[] = [];
    await page.route("**/*", (route) => {
      requested.push(route.request().url());
      return route.abort();
    });
    const html = readFileSync(
      "docs/email/previews/compact-typical.html",
      "utf8",
    );
    expect(Buffer.byteLength(html)).toBeLessThan(100 * 1024);
    await page.setContent(html);
    await expect(
      page.getByRole("heading", { name: /^Order #042/ }),
    ).toBeVisible();
    const singles = page.locator('[data-kitchen-item="single"]');
    await expect(singles).toHaveCount(3);
    expect(
      await singles.locator("[data-kitchen-quantity]").allTextContents(),
    ).toEqual(["1", "1", "1"]);
    const table = page.getByRole("table", { name: "Products to prepare" });
    expect(await table.getByRole("columnheader").allTextContents()).toEqual([
      "Product",
      "Qty",
      "Price",
    ]);
    const priority = await table.evaluate((el) =>
      [
        "[data-kitchen-notes]",
        "[data-kitchen-fulfillment]",
        "[data-kitchen-customer]",
        "[data-kitchen-address]",
      ].every(
        (selector) =>
          !!(
            el.compareDocumentPosition(document.querySelector(selector)!) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
    );
    expect(priority).toBe(true);
    const box = page.locator('[data-kitchen-item="pack"]');
    await expect(box.locator("h2")).not.toHaveText(/^\d+ ×/);
    await expect(
      box.getByText("TOTAL: 6 pieces · 1 box", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "conchas-traditional-chocolate-individual-70-g",
    );
    await expect(page.getByText(/ALLERGY: peanuts/)).toBeVisible();
    await expect(
      page.getByText("Address verification: UNVERIFIED", { exact: true }),
    ).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      height: Math.ceil(
        document.querySelector('[role="main"]')!.getBoundingClientRect().height,
      ),
      documentHeight: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(width);
    await info.attach("layout.json", {
      body: JSON.stringify({
        ...dimensions,
        htmlBytes: Buffer.byteLength(html),
      }),
      contentType: "application/json",
    });
    await page.screenshot({
      path: `docs/email/previews/compact-${browserName}-${width}.png`,
      fullPage: true,
    });
    if (width === 390) {
      await page.screenshot({
        path: `docs/email/previews/compact-${browserName}-390-screen.png`,
        fullPage: false,
      });
      expect(dimensions.height).toBeLessThanOrEqual(844);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(requested).toEqual([]);
  });
}
for (const kind of ["long", "large", "pickup", "review"] as const) {
  test(`compact ${kind}: complete content and mobile mail constraints`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(
      readFileSync(`docs/email/previews/compact-${kind}.html`, "utf8"),
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    expect(await page.locator("script, img, iframe, form").count()).toBe(0);
    if (kind === "long") {
      await expect(
        page.getByText(/END OF ORIGINAL ALLERGY INSTRUCTIONS/),
      ).toBeVisible();
      await expect(page.getByText(/END OF DELIVERY NOTES/)).toBeVisible();
    }
    if (kind === "large") {
      await expect(
        page.getByText("TOTAL: 12 pieces · 2 boxes", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "2 boxes · 6 pieces per box; same contents in each box.",
          { exact: true },
        ),
      ).toBeVisible();
    }
    if (kind === "review")
      await expect(
        page.getByText(/MANUAL REVIEW REQUIRED: Pack composition/),
      ).toBeVisible();
    if (kind === "pickup")
      await expect(
        page.getByRole("heading", { name: /^Pickup ·/ }),
      ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `docs/email/previews/compact-${kind}-${browserName}-390.png`,
      fullPage: true,
    });
  });
}
test("dark preference and stripped style element keep the complete brief readable", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  const html = readFileSync("docs/email/previews/compact-typical.html", "utf8");
  // Gmail may strip head styles: all layout/content styling must be inline.
  await page.setContent(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ""));
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: `docs/email/previews/compact-dark-${browserName}-390.png`,
    fullPage: true,
  });
});

test("before/after compact brief measurement at iPhone width", async ({
  page,
  browserName,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(
    readFileSync("docs/email/previews/compact-before.html", "utf8"),
  );
  const before = await page.evaluate(() =>
    Math.ceil(
      document.querySelector('[role="main"]')!.getBoundingClientRect().height,
    ),
  );
  await page.screenshot({
    path: `docs/email/previews/compact-before-${browserName}-390.png`,
    fullPage: true,
  });
  await page.setContent(
    readFileSync("docs/email/previews/compact-typical.html", "utf8"),
  );
  const after = await page.evaluate(() =>
    Math.ceil(
      document.querySelector('[role="main"]')!.getBoundingClientRect().height,
    ),
  );
  writeFileSync(
    `docs/email/previews/metrics-${browserName}.json`,
    JSON.stringify(
      {
        width: 390,
        viewportHeight: 844,
        beforeHeight: before,
        afterHeight: after,
        reductionPercent: (1 - after / before) * 100,
      },
      null,
      2,
    ),
  );
  expect(after).toBeLessThanOrEqual(844);
  expect(after).toBeLessThan(before * 0.65);
  await info.attach("before-after.json", {
    body: JSON.stringify({
      before,
      after,
      reductionPercent: (1 - after / before) * 100,
    }),
    contentType: "application/json",
  });
});
