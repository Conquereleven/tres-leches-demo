import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
const shots = "work/qa/uat-v2";
for (const width of [390, 768, 1440])
  test(`UAT V2 visual and quantity/contact journey ${width}px`, async ({
    page,
  }) => {
    mkdirSync(shots, { recursive: true });
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const calls: string[] = [];
    page.on("request", (r) => {
      if (/paymennt\.com|\/api\/checkout\/(prepare|pay|token)/.test(r.url()))
        calls.push(r.url());
    });
    const shot = async (name: string) => {
      await page.waitForTimeout(250);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: `${shots}/${name}-${width}.png` });
    };
    await page.goto("/");
    await expect(page.locator(".b-header img").first()).toHaveAttribute(
      "src",
      "/brand/wordmark.png",
    );
    await shot("homepage");
    await page.locator(".b-menu-preview").scrollIntoViewIfNeeded();
    await shot("menu-preview");
    const links = await page
      .locator(".b-preview-grid a")
      .evaluateAll((as) =>
        as.map((a) => (a as HTMLAnchorElement).getAttribute("href")),
      );
    expect(links).toContain("/menu?category=pan");
    const section = page.locator(".ref-tradition");
    await section.evaluate((el) =>
      window.scrollTo({
        top: el.getBoundingClientRect().top + scrollY - innerHeight * 0.7,
        behavior: "instant",
      }),
    );
    await shot("motion-enter");
    const start = await section.evaluate((el) =>
      el.style.getPropertyValue("--editorial-progress"),
    );
    await section.evaluate((el) =>
      window.scrollTo({
        top: el.getBoundingClientRect().top + scrollY - innerHeight * 0.05,
        behavior: "instant",
      }),
    );
    await shot("motion-settled");
    const finish = await section.evaluate((el) =>
      el.style.getPropertyValue("--editorial-progress"),
    );
    expect(Number(finish)).toBeGreaterThan(Number(start));
    await page.locator("#how-to-order").scrollIntoViewIfNeeded();
    await shot("how-to-order");
    expect(
      (await new AxeBuilder({ page }).include("#how-to-order").analyze())
        .violations,
    ).toEqual([]);
    await page.goto("/menu?category=conchas");
    await expect(page.locator("[data-product-id]")).toHaveCount(4);
    await expect(page.getByLabel("Flavour", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Filling", { exact: true })).toHaveCount(0);
    await shot("conchas");
    await page.goto("/menu?category=pan");
    await expect(
      page
        .locator('[data-product-id="pan-de-muerto-traditional--azucar"] button')
        .filter({ hasText: "ADD TO CART" }),
    ).toBeEnabled();
    await shot("pan");
    await page.goto("/menu?product=conchas-filled--pistache");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /pistache/i,
    );
    await expect(page.locator("main select")).toHaveCount(1);
    await page.getByLabel("Size / pack").selectOption("Mini");
    const qty = page.getByRole("textbox", { name: "Quantity", exact: true });
    await qty.fill("40");
    await qty.press("Enter");
    await expect(qty).toHaveValue("40");
    await page
      .getByRole("button", { name: "Increase quantity", exact: true })
      .click();
    await expect(qty).toHaveValue("41");
    await page
      .getByRole("button", { name: "Decrease quantity", exact: true })
      .click();
    for (const invalid of ["0", "101", "-2", "1.5", "abc"]) {
      await qty.fill(invalid);
      await qty.press("Tab");
      await expect(qty).toHaveValue("40");
    }
    await qty.press("ArrowUp");
    await expect(qty).toHaveValue("41");
    await qty.press("ArrowDown");
    await page
      .locator(".b-product-page")
      .screenshot({ path: `${shots}/product-${width}.png` });
    await page
      .getByRole("button", { name: "ADD TO CART · AED 720", exact: true })
      .click();
    await page.goto("/cart");
    await expect(page.locator("main")).toContainText("AED 720");
    const cartQty = page.locator(".b-quantity-input");
    await cartQty.fill("100");
    await cartQty.press("Enter");
    await expect(page.locator("main")).toContainText("AED 1800");
    await cartQty.fill("40");
    await cartQty.press("Enter");
    await shot("cart");
    await page.getByRole("link", { name: "CONTINUE TO FULFILLMENT" }).click();
    await page.getByLabel("Delivery area").selectOption("jlt-cluster-c");
    await page
      .getByLabel("Street address and community", { exact: true })
      .fill("UAT fixture street");
    await page.getByLabel("Building or villa").fill("Fixture 1");
    await page.getByLabel("Delivery date").fill("2026-10-05");
    await page
      .getByRole("combobox", { name: "Delivery time", exact: true })
      .selectOption("4:00 PM – 9:00 PM");
    await shot("fulfillment");
    await page.getByRole("button", { name: "CONTINUE TO DETAILS" }).click();
    await page.getByLabel("Full name").fill("UAT Fixture");
    await page
      .getByLabel("Email for payment receipt")
      .fill("uat@example.invalid");
    await page.getByLabel("Mobile number", { exact: true }).fill("0500000000");
    await page
      .getByLabel("WhatsApp number (optional)", { exact: true })
      .fill("+52 55 1234 5678");
    await shot("contact");
    await page.getByRole("button", { name: "REVIEW ORDER" }).click();
    await expect(
      page.getByRole("region", { name: "Order review" }),
    ).toContainText("+525512345678");
    await shot("review");
    expect(errors).toEqual([]);
    expect(calls).toEqual([]);
  });
test("reduced motion receives final composition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator(".ref-tradition").scrollIntoViewIfNeeded();
  for (const selector of [
    ".ref-panel",
    ".ref-slice-one",
    ".ref-slice-two",
    ".ref-slice-three",
  ]) {
    await expect(page.locator(selector)).toHaveCSS("opacity", "1");
    await expect(page.locator(selector)).toHaveCSS("transform", "none");
  }
});
