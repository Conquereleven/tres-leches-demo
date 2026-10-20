import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync, writeFileSync } from "node:fs";

for (const width of [320, 375, 390, 430]) {
  test(`product-first kitchen matrix ${width}px: complete accepted lines and measured hierarchy`, async ({
    page,
    browserName,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const requests: string[] = [];
    await page.route("**/*", (route) => {
      requests.push(route.request().url());
      return route.abort();
    });
    const metrics = [];
    for (const kind of [
      "short",
      "three",
      "typical",
      "large",
      "long",
      "pickup",
      "review",
    ] as const) {
      const html = readFileSync(
        `docs/email/previews/compact-${kind}.html`,
        "utf8",
      );
      expect(Buffer.byteLength(html)).toBeLessThan(100 * 1024);
      await page.setContent(html);
      const table = page.getByRole("table", { name: "Products to prepare" });
      await expect(table).toBeVisible();
      expect(await table.getByRole("columnheader").allTextContents()).toEqual([
        "Product",
        "Qty",
        "Price",
      ]);
      const items = table.locator("[data-kitchen-item]");
      await expect(items).toHaveCount(
        kind === "short" ? 1 : kind === "three" ? 3 : 4,
      );
      await expect(items.locator("[data-kitchen-quantity]")).toHaveCount(
        await items.count(),
      );
      await expect(items.locator("[data-kitchen-price]")).toHaveCount(
        await items.count(),
      );
      for (const item of await items.all()) {
        expect(await item.locator("h2").innerText()).not.toMatch(/^\d+ ×/);
        expect(
          await item.locator("[data-kitchen-quantity]").innerText(),
        ).toMatch(/^[1-9]\d*$/);
        expect(await item.locator("[data-kitchen-price]").innerText()).toMatch(
          /^AED \d+\.\d{2}$/,
        );
        expect(
          await item
            .locator("h2")
            .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
        ).toBeGreaterThanOrEqual(14);
        for (const component of await item.locator("li").allTextContents())
          expect(component).not.toContain("AED");
      }
      const dimensions = await page.evaluate(() => {
        const main = document.querySelector('[role="main"]')!;
        const products = document.querySelector(
          'table[aria-label="Products to prepare"]',
        )!;
        return {
          height: Math.ceil(main.getBoundingClientRect().height),
          width: document.documentElement.scrollWidth,
          productHeight: Math.ceil(products.getBoundingClientRect().height),
          productTop: Math.ceil(products.getBoundingClientRect().top),
          productsBeforeSecondary: [
            "[data-kitchen-notes]",
            "[data-kitchen-fulfillment]",
            "[data-kitchen-customer]",
            "[data-kitchen-address]",
          ].every(
            (selector) =>
              !!(
                products.compareDocumentPosition(
                  document.querySelector(selector)!,
                ) & Node.DOCUMENT_POSITION_FOLLOWING
              ),
          ),
        };
      });
      expect(dimensions.width).toBeLessThanOrEqual(width);
      expect(dimensions.productsBeforeSecondary).toBe(true);
      expect(
        (await page
          .getByRole("link", {
            name: "Open order in Operations (sign-in required)",
          })
          .boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);
      expect(await page.locator("script, img, iframe, form").count()).toBe(0);
      if (width === 390 && (kind === "short" || kind === "three")) {
        // Browser-only whitespace regression budgets, not native mail fit claims.
        expect(dimensions.height).toBeLessThanOrEqual(
          kind === "short" ? 740 : 860,
        );
        expect(dimensions.productTop).toBeLessThanOrEqual(150);
      }
      if (kind === "short" || kind === "three") {
        // The supplied serif reference supersedes the earlier dense layout's
        // hard 844px budget. Record actual height/fit; never hide safety content.
        await expect(page.locator("[data-kitchen-brand]")).toHaveCSS(
          "background-color",
          "rgb(246, 223, 224)",
        );
        await expect(page.locator("[data-kitchen-summary]")).toHaveCSS(
          "border-radius",
          "12px",
        );
        expect(
          await items
            .first()
            .locator("h2")
            .evaluate((el) => getComputedStyle(el).fontFamily),
        ).toContain("Georgia");
        await expect(
          page.getByRole("heading", { name: /^Total paid:/ }),
        ).toHaveText(kind === "short" ? "AED 13.00" : "AED 39.00");
      }
      if (kind === "large") {
        const boxes = table.locator('[data-kitchen-item="pack"]');
        await expect(boxes).toHaveCount(3);
        expect(await boxes.nth(0).locator("h2").innerText()).toBe(
          await boxes.nth(1).locator("h2").innerText(),
        );
        await expect(
          boxes.nth(0).locator("[data-kitchen-quantity]"),
        ).toHaveText("2");
        await expect(
          boxes.nth(1).locator("[data-kitchen-quantity]"),
        ).toHaveText("1");
        await expect(
          boxes.nth(0).getByText("TOTAL: 12 pieces · 2 boxes", { exact: true }),
        ).toBeVisible();
        await expect(
          boxes.nth(1).getByText("6 × Sesame", { exact: true }),
        ).toBeVisible();
        expect(await boxes.nth(0).locator("li").allTextContents()).not.toEqual(
          await boxes.nth(1).locator("li").allTextContents(),
        );
      }
      if (kind === "long") {
        expect(dimensions.height).toBeGreaterThan(844);
        await expect(
          page.getByText(/END OF ORIGINAL ALLERGY INSTRUCTIONS/),
        ).toBeVisible();
        await expect(page.getByText(/END OF DELIVERY NOTES/)).toBeVisible();
        expect(html).not.toMatch(
          /line-clamp|max-height|text-overflow|overflow:hidden/,
        );
      }
      if (kind === "review")
        await expect(
          page.getByText(/MANUAL REVIEW REQUIRED: Pack composition/),
        ).toBeVisible();
      if (kind === "pickup")
        await expect(page.locator("[data-kitchen-fulfillment]")).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      const screenshot = `docs/email/previews/product-first-${kind}-${browserName}-${width}.png`;
      if (width === 390 || kind === "short" || kind === "three")
        await page.screenshot({ path: screenshot, fullPage: true });
      metrics.push({
        kind,
        width,
        ...dimensions,
        htmlBytes: Buffer.byteLength(html),
        fitsRaw844px: dimensions.height <= 844,
        nativeUsableHeight: null,
        nativeClient: "PENDING",
      });
    }
    expect(requests).toEqual([]);
    writeFileSync(
      `docs/email/previews/product-first-metrics-${browserName}-${width}.json`,
      JSON.stringify(metrics, null, 2),
    );
    await info.attach("product-first-metrics.json", {
      body: JSON.stringify(metrics),
      contentType: "application/json",
    });
  });
}
