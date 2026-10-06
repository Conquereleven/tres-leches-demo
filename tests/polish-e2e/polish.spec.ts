import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
for (const width of [390, 768, 1024, 1440])
  for (const locale of ["en", "es", "ar"]) {
    test(`${locale} scroll drawing, journey, pink contrast ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/?lang=${locale}`);
      mkdirSync("work/qa/final-polish", { recursive: true });
      await page.screenshot({
        path: `work/qa/final-polish/${locale}-home-${width}.png`,
      });
      for (const selector of [".ref-journey", ".ref-family"]) {
        const section = page.locator(selector);
        await section.evaluate((el) =>
          window.scrollTo(
            0,
            window.scrollY + el.getBoundingClientRect().top - innerHeight * 0.8,
          ),
        );
        const path = page.locator(
          selector === ".ref-journey" ? ".ref-route-ink" : ".ref-pencil-mask",
        );
        await expect
          .poll(() =>
            path.evaluate((el) =>
              (el as SVGElement).dataset.drawn !== undefined
                ? 1 - Number((el as SVGElement).dataset.drawn)
                : parseFloat(getComputedStyle(el).strokeDashoffset),
            ),
          )
          .toBeGreaterThan(0.5);
        const start = await path.evaluate((el) =>
          (el as SVGElement).dataset.drawn !== undefined
            ? 1 - Number((el as SVGElement).dataset.drawn)
            : parseFloat(getComputedStyle(el).strokeDashoffset),
        );
        await section.evaluate((el) =>
          window.scrollTo(
            0,
            window.scrollY +
              el.getBoundingClientRect().top -
              innerHeight * 0.35,
          ),
        );
        await expect
          .poll(() =>
            path.evaluate((el) =>
              (el as SVGElement).dataset.drawn !== undefined
                ? 1 - Number((el as SVGElement).dataset.drawn)
                : parseFloat(getComputedStyle(el).strokeDashoffset),
            ),
          )
          .toBeLessThan(start);
        await page.screenshot({
          path: `work/qa/final-polish/${locale}-${selector === ".ref-journey" ? "journey" : "journal"}-${width}.png`,
        });
        await section.evaluate((el) =>
          window.scrollTo(
            0,
            window.scrollY + el.getBoundingClientRect().top - innerHeight * 0.8,
          ),
        );
        await expect
          .poll(() =>
            path.evaluate((el) =>
              (el as SVGElement).dataset.drawn !== undefined
                ? 1 - Number((el as SVGElement).dataset.drawn)
                : parseFloat(getComputedStyle(el).strokeDashoffset),
            ),
          )
          .toBeGreaterThan(0.5);
      }
      expect(
        await page
          .locator(".ref-scroll-sketch")
          .evaluate((el) => el.getBoundingClientRect().width),
      ).toBeGreaterThan(120);
      expect(
        await page
          .locator(".ref-route-motion")
          .evaluate((el) => el.getBoundingClientRect().height),
      ).toBeGreaterThan(60);
      const metrics = await page.locator(".ref-family").evaluate(async (el) => {
        const initial = el.getBoundingClientRect();
        const top = window.scrollY + initial.top;
        const shifts: number[] = [];
        const observer = new PerformanceObserver((list) =>
          list.getEntries().forEach((e) => {
            const shift = e as PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            };
            if (!shift.hadRecentInput) shifts.push(shift.value);
          }),
        );
        observer.observe({ type: "layout-shift" });
        const frames: number[] = [];
        let previous = performance.now();
        for (let i = 0; i < 45; i++) {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => {
              window.scrollTo(0, top - innerHeight * (0.8 - (0.7 * i) / 44));
              const at = performance.now();
              frames.push(at - previous);
              previous = at;
              resolve();
            }),
          );
        }
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        observer.disconnect();
        const final = el.getBoundingClientRect();
        frames.sort((a, b) => a - b);
        return {
          scrollLayoutShift: shifts.reduce((a, b) => a + b, 0),
          widthChange: final.width - initial.width,
          heightChange: final.height - initial.height,
          frameP95Ms: frames[Math.floor(frames.length * 0.95)],
        };
      });
      expect(metrics.widthChange).toBe(0);
      expect(metrics.heightChange).toBe(0);
      expect(metrics.scrollLayoutShift).toBeLessThan(0.1);
      writeFileSync(
        `work/qa/final-polish/${locale}-performance-${width}.json`,
        JSON.stringify(metrics, null, 2),
      );
      const cities = await page
        .locator(".ref-city")
        .evaluateAll(
          (els, w) =>
            els.map((el) =>
              w < 640
                ? el.getBoundingClientRect().y
                : el.getBoundingClientRect().x,
            ),
          width,
        );
      expect(cities[0]).toBeLessThan(cities[1]!);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect
        .poll(() =>
          page
            .locator(".ref-pencil-mask")
            .evaluate((el) =>
              (el as SVGElement).dataset.drawn !== undefined
                ? 1 - Number((el as SVGElement).dataset.drawn)
                : parseFloat(getComputedStyle(el).strokeDashoffset),
            ),
        )
        .toBe(0);
      await expect(page.locator(".ref-route-tracer")).toBeHidden();
      const axe = await new AxeBuilder({ page }).include("main").analyze();
      expect(axe.violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
for (const method of ["delivery", "pickup"])
  test(`${method} UI reflects server cutoff without device timezone`, async ({
    page,
    context,
  }) => {
    await page.goto("/menu?product=conchas-filled--pistache");
    await page.locator("main select").selectOption("Mini");
    await page
      .getByRole("textbox", { name: "Quantity", exact: true })
      .fill("3");
    await page.locator("main .b-product-page .b-button").last().click();
    await page.goto("/checkout");
    if (method === "pickup")
      await page.getByRole("radio", { name: "PICKUP", exact: true }).check();
    const date = page.getByLabel(
      method === "pickup" ? "Pickup date" : "Delivery date",
      { exact: true },
    );
    await expect(date).toHaveAttribute("min", "2026-10-08");
    await expect(page.locator("main")).toContainText(
      "Next-day ordering is closed.",
    );
    await date.fill("2026-10-07");
    const slot = page.getByRole("combobox", {
      name: method === "pickup" ? "Pickup time" : "Delivery time",
      exact: true,
    });
    expect(
      await slot
        .locator('option:not([value=""])')
        .evaluateAll((els) =>
          els.every((el) => (el as HTMLOptionElement).disabled),
        ),
    ).toBe(true);
    await date.fill("2026-10-08");
    expect(
      await slot
        .locator('option:not([value=""])')
        .evaluateAll((els) =>
          els.some((el) => !(el as HTMLOptionElement).disabled),
        ),
    ).toBe(true);
    void context;
  });
for (const locale of ["en", "ar"])
  test(`${locale} journey travels Mexico to Dubai and the portrait is drawn in stages`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?lang=${locale}`);
    const place = (selector: string, from: number, to: number, at: number) =>
      page.evaluate(
        async ([selector, from, to, at]) => {
          const box = document
            .querySelector(selector as string)!
            .getBoundingClientRect();
          const centre =
            (from as number) -
            (at as number) * ((from as number) - (to as number));
          window.scrollTo({
            top: scrollY + box.top + box.height / 2 - innerHeight * centre,
            behavior: "instant",
          });
          await new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done)),
          );
        },
        [selector, from, to, at],
      );
    const bridge = page.locator(".ref-bridge");
    const marker = () =>
      page
        .locator(".ref-route-dot")
        .evaluate((el) => el.getBoundingClientRect().x);
    await place(".ref-route-motion", 0.92, 0.4, 0.1);
    await expect(bridge).toHaveAttribute("data-journey", "mexico");
    const departed = await marker();
    await place(".ref-route-motion", 0.92, 0.4, 0.5);
    await expect(bridge).toHaveAttribute("data-journey", "travel");
    const midway = await marker();
    // Physical west-to-east travel, regardless of document direction.
    expect(midway).toBeGreaterThan(departed + 100);
    expect(
      await page
        .locator(".ref-route-dot")
        .evaluate((el) => el.getBoundingClientRect().width),
    ).toBeGreaterThan(12);
    await place(".ref-route-motion", 0.92, 0.4, 1);
    await expect(bridge).toHaveAttribute("data-journey", "dubai");
    const drawn = (stage: string) =>
      page
        .locator(`.ref-pencil-${stage}`)
        .evaluate((el) => Number((el as SVGElement).dataset.drawn));
    const final = () =>
      page
        .locator(".ref-sketch-final")
        .evaluate((el) => parseFloat(getComputedStyle(el).opacity));
    await place(".ref-scroll-sketch", 0.9, 0.4, 0.2);
    expect(await drawn("contour")).toBeGreaterThan(0.5);
    expect(await drawn("detail")).toBe(0);
    expect(await final()).toBe(0);
    await place(".ref-scroll-sketch", 0.9, 0.4, 0.5);
    expect(await drawn("contour")).toBe(1);
    expect(await drawn("detail")).toBeGreaterThan(0.4);
    expect(await drawn("shade")).toBe(0);
    // Just past the nominal end: scroll positions land on whole pixels.
    await place(".ref-scroll-sketch", 0.9, 0.4, 1.05);
    expect(await final()).toBe(1);
    // The pink hierarchy must resolve: an empty token silently removes the accent.
    for (const token of ["--3l-pink-soft", "--3l-pink", "--3l-pink-strong"])
      expect(
        await page
          .locator(".brand-experience")
          .evaluate(
            (el, name) => getComputedStyle(el).getPropertyValue(name).trim(),
            token,
          ),
      ).toMatch(/^#[0-9a-f]{6}$/);
  });
