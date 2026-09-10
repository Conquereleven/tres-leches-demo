import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const widths = [320, 375, 390, 430, 768, 1024, 1280, 1440];
const sections = [
  "home",
  "bridge",
  "collection",
  "tradition",
  "story",
  "discovery",
  "bakery",
  "jars",
  "custom",
  "occasions",
  "voices",
  "community",
  "promotion",
  "dubai",
  "newsletter",
];
test("TL19–21 responsive matrix, content integrity, layout and console", async ({
  page,
}) => {
  test.setTimeout(120000);
  mkdirSync("work/qa/brand", { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (["warning", "error"].includes(m.type())) errors.push(m.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const report = [];
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("#collection article")).toHaveCount(3);
  await expect(
    page.getByText("MEXICO CITY SINCE 1982", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".brand-experience")).not.toContainText("1992");
  await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
  const order = await page
    .locator("main > section")
    .evaluateAll((els) => els.map((e) => e.id));
  expect(order).toEqual(sections);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = [];
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `work/qa/brand/${width}-hero-with-header.png`,
    });
    for (const id of sections) {
      const section = page.locator("#" + id);
      await section.scrollIntoViewIfNeeded();
      expect(
        await section.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        `${id} internal overflow at ${width}`,
      ).toBeTruthy();
      const bad = await section.evaluate((el) =>
        Array.from(el.querySelectorAll("h1,h2,h3,button,a"))
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
          })
          .map((e) => e.textContent),
      );
      overflow.push(...bad);
      await section.screenshot({ path: `work/qa/brand/${width}-${id}.png` });
    }
    expect(overflow, `overflow at ${width}`).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page
      .locator("footer.b-footer")
      .screenshot({ path: `work/qa/brand/${width}-footer.png` });
    report.push({ width, sections: sections.length, overflow: 0 });
  }
  writeFileSync(
    "work/qa/brand/responsive.json",
    JSON.stringify({ report, console: errors }, null, 2),
  );
  expect(errors).toEqual([]);
});
test("TL20 editorial selections, modal keyboard, newsletter and safe unavailable links", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const id of ["bakery", "jars", "custom"]) {
    const section = page.locator("#" + id);
    const second = section.locator(".b-product-list button").nth(1);
    await second.click();
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await expect(
      section.locator(".b-selected-product .b-caption"),
    ).toContainText("-2");
  }
  await page.getByRole("button", { name: "Weddings", exact: true }).click();
  await expect(page.locator("#occasions [aria-live]")).toContainText(
    "Weddings",
  );
  await page.locator(".b-door-jars").focus();
  await expect(page.locator(".b-door-jars")).toHaveClass(/b-selected/);
  await page.locator(".b-door-jars").click();
  await expect(page).toHaveURL(/#jars$/);
  const cta = page.getByRole("button", { name: "ORDER THIS JAR", exact: true });
  await cta.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("official WhatsApp contact");
  await expect(
    dialog.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => !!document.activeElement?.closest("dialog")),
    ).toBeTruthy();
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(cta).toBeFocused();
  await page
    .getByRole("button", { name: "Discover more", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Approved promotional image",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "SUBSCRIBE", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("valid email");
  await page.getByLabel("Your email here").fill("test@example.invalid");
  await page.getByRole("button", { name: "SUBSCRIBE", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("confirm your consent");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "SUBSCRIBE", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("not available yet");
  await expect(page.getByRole("status")).not.toContainText("confirmed");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "MENU", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/#collection$/);
  expect(
    await page
      .locator(".b-ticker > div")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
});
test("TL21 preloader cannot block content when video is unavailable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".b-preloader")).toHaveCount(0, { timeout: 4500 });
  await expect(page.locator(".b-hero-fallback")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "WATCH OUR STORY" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".b-preloader")).toHaveCount(0);
  await page.getByRole("button", { name: "WATCH OUR STORY" }).click();
  await expect(page.getByRole("dialog")).toContainText("original film");
});

test("TL21 approved content remains readable without JavaScript", async ({
  browser,
}) => {
  test.skip(
    !process.env.E2E_BUILD,
    "Static shell is generated by the production build",
  );
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5174/");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toContainText("SOAKED IN");
  await expect(page.locator("#dubai")).toContainText("Same sweetness");
  await expect(page.locator("#jars")).toContainText("CAKE JARS");
  await context.close();
});

test("TL21 accessibility checks on mobile, desktop and modal", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    writeFileSync(
      `work/qa/brand/axe-${width}.json`,
      JSON.stringify(result.violations, null, 2),
    );
    expect(result.violations).toEqual([]);
  }
  await page
    .getByRole("button", { name: "Discover more", exact: true })
    .click();
  const modal = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(modal.violations).toEqual([]);
});

test("TL21 layout stability and local font delivery", async ({ page }) => {
  await page.addInitScript(() => {
    const metrics = { cls: 0 };
    (window as Window & { brandMetrics?: { cls: number } }).brandMetrics =
      metrics;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const shift = e as PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
        };
        if (!shift.hadRecentInput) metrics.cls += shift.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/");
  await expect(page.locator(".b-preloader")).toHaveCount(0, { timeout: 4500 });
  await page.evaluate(() => document.fonts.ready);
  const metrics = await page.evaluate(() => ({
    cls: (window as Window & { brandMetrics?: { cls: number } }).brandMetrics
      ?.cls,
    font: document.fonts.check('16px "3L Abril"'),
    resources: performance
      .getEntriesByType("resource")
      .filter((e) => e.name.includes("/brand/")).length,
  }));
  writeFileSync(
    "work/qa/brand/performance.json",
    JSON.stringify(metrics, null, 2),
  );
  expect(metrics.cls).toBeLessThan(0.1);
  expect(metrics.font).toBe(true);
});
