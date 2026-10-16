import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";

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
      page.getByRole("heading", { name: "Order #042", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Customer instructions / allergies" }),
    ).toBeVisible();
    await expect(
      page.getByText("ALLERGY: peanuts", { exact: false }),
    ).toContainText("Gracias — شكراً.");
    const boxes = page
      .getByText("PACK / BOX", { exact: true })
      .locator("xpath=ancestor::table[1]");
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
