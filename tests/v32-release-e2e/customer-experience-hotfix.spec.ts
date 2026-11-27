import { test, expect } from "@playwright/test";
import { gotoWithCart } from "../helpers/storefront";

const widths = [320, 375, 390, 414, 430];

for (const width of widths) {
  test(`anchored mobile CornerGlass navigation at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 780 });
    await gotoWithCart(page, "/?lang=en", [
      { productId: "pan-de-muerto-traditional-azucar-mini-40-g", quantity: 7 },
    ]);
    const trigger = page.locator(".mast .mobile-nav");
    const nav = page.locator("#storefront-nav");
    const heading = page.locator(".home-main h1");
    const headingLayout = () =>
      heading.evaluate((element) => {
        const block = element as HTMLElement;
        return [
          block.offsetTop,
          block.offsetLeft,
          block.offsetWidth,
          block.offsetHeight,
        ];
      });
    const before = await headingLayout();
    await trigger.focus();
    await trigger.press("Enter");
    await expect(nav).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Home", exact: true }),
    ).toBeFocused();
    await expect(
      nav.getByRole("link", { name: "Home", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(nav.locator(".mobile-corner-count")).toHaveText("7");
    const header = await page.locator(".mast").boundingBox();
    const dropdown = await nav.boundingBox();
    expect(
      header && dropdown && dropdown.y >= header.y + header.height - 1,
    ).toBeTruthy();
    expect(
      dropdown && dropdown.x >= 0 && dropdown.x + dropdown.width <= width,
    ).toBeTruthy();
    expect(await headingLayout()).toEqual(before);
    const boxes = await nav
      .getByRole("link")
      .evaluateAll((items) =>
        items.map((item) => item.getBoundingClientRect().top),
      );
    expect(boxes).toHaveLength(5);
    expect(boxes.every((top, i) => i === 0 || top > boxes[i - 1]!)).toBe(true);
    await nav.screenshot({ path: info.outputPath(`mobile-nav-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(nav).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await nav.getByLabel("Language").focus();
    await page.keyboard.press("Tab");
    await expect(nav).toBeHidden();
    await expect(trigger).not.toBeFocused();

    await trigger.click();
    await nav.getByRole("button", { name: "Close navigation" }).click();
    await expect(nav).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.locator(".mast .brand").click({ trial: true });
    await page.mouse.click(width - 3, 70);
    await expect(nav).toBeHidden();

    if (width === 390) {
      for (const [label, path] of [
        ["Menu", "/menu"],
        ["Journal", "/journal"],
        ["Contact", "/contact"],
        ["Cart", "/cart"],
        ["Home", "/"],
      ] as const) {
        await trigger.click();
        await nav.getByRole("link", { name: new RegExp("^" + label) }).click();
        await expect(page).toHaveURL((url) => url.pathname === path);
        await expect(nav).toBeHidden();
        await expect(page.locator(".mast .mobile-bag output")).toHaveText("7");
      }
      await trigger.click();
      await nav.getByLabel("Language").selectOption("es");
      await nav.getByLabel("Idioma").selectOption("ar");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(
        nav.getByRole("link", { name: /السلة/ }).locator("bdi"),
      ).toHaveText("٧");
      await nav.screenshot({ path: info.outputPath("mobile-nav-arabic.png") });
      await nav.getByRole("link", { name: "المجلة" }).click();
      await expect(page).toHaveURL(/\/journal\?lang=ar/);
      await expect(nav).toBeHidden();
      expect(
        await page.evaluate(
          () => JSON.parse(localStorage.getItem("3l-cart")!)[0].quantity,
        ),
      ).toBe(7);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await trigger.click();
    expect(
      await nav.evaluate(
        (element) => getComputedStyle(element).transitionDuration,
      ),
    ).toBe("0s");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

  test(`mobile journey and portrait draw real intermediate frames at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 260 : 844 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const journey = page.locator(".home-main .journey");
    const marker = journey.locator(".journey-traveller");
    const route = journey.locator(".journey-line");
    const portrait = page.locator(".v32-family-portrait");
    const sketch = portrait.locator(".ref-scroll-sketch");
    const sample = () =>
      route.evaluate((element) => ({
        drawn: parseFloat(getComputedStyle(element).strokeDashoffset),
        length: (element as unknown as SVGPathElement).getTotalLength(),
      }));
    const checkMotion = async () => {
      await expect(journey).toHaveAttribute("data-route-entrance", "running");
      await expect
        .poll(async () => {
          const { drawn, length } = await sample();
          return drawn > 5 && drawn < length * 0.95;
        })
        .toBe(true);
      const initial = await marker.getAttribute("transform");
      await expect
        .poll(() => marker.getAttribute("transform"))
        .not.toBe(initial);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    };
    await page.goto("/?lang=en", { waitUntil: "domcontentloaded" });
    await checkMotion();
    if (width === 320) {
      expect(
        await portrait.evaluate(
          (element) => element.getBoundingClientRect().top >= innerHeight,
        ),
      ).toBe(true);
      await expect(portrait).toHaveAttribute("data-entrance", "waiting");
      await expect(sketch).toHaveAttribute("data-drawn", "0.0000");
    }
    await page.screenshot({
      path: info.outputPath(`journey-intermediate-${width}.png`),
    });
    await expect(journey).toHaveAttribute("data-route-entrance", "complete");
    expect((await sample()).drawn).toBe(0);
    await expect(marker).toBeHidden();
    if ((await portrait.getAttribute("data-entrance")) === "waiting")
      await portrait.scrollIntoViewIfNeeded();
    if (width === 320)
      await expect
        .poll(async () => {
          const value = Number(await sketch.getAttribute("data-drawn"));
          return value > 0 && value < 1;
        })
        .toBe(true);
    await expect(portrait).toHaveAttribute("data-entrance", /drawing|complete/);
    await expect
      .poll(async () => Number(await sketch.getAttribute("data-drawn")))
      .toBeGreaterThan(0);
    if ((await portrait.getAttribute("data-entrance")) === "drawing")
      await portrait.screenshot({
        path: info.outputPath(`portrait-intermediate-${width}.png`),
      });
    await expect(portrait).toHaveAttribute("data-entrance", "complete");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);

    if (width === 390) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.reload({ waitUntil: "domcontentloaded" });
      await checkMotion();
      const trigger = page.locator(".mast .mobile-nav");
      await trigger.click();
      await page
        .locator("#storefront-nav")
        .getByLabel("Language")
        .selectOption("es");
      await page
        .locator("#storefront-nav")
        .getByLabel("Idioma")
        .selectOption("ar");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      expect(await journey.getAttribute("dir")).toBe("ltr");
      await page
        .locator("#storefront-nav")
        .getByRole("link", { name: "المجلة" })
        .click();
      await expect(page).toHaveURL(/\/journal\?lang=ar/);
      await trigger.click();
      await page
        .locator("#storefront-nav")
        .getByRole("link", { name: "الرئيسية" })
        .click();
      await expect(page).toHaveURL(/\/?\?lang=ar/);
      await checkMotion();
    }

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?lang=ar", { waitUntil: "domcontentloaded" });
    await expect(journey).toHaveAttribute("data-route-entrance", "complete");
    await expect(portrait).toHaveAttribute("data-entrance", "complete");
    expect((await sample()).drawn).toBe(0);
    await expect(marker).toBeHidden();
  });
}

test("desktop navigation and CSS journey remain on their approved path", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".mast .mast-left")).toBeVisible();
  await expect(page.locator(".mast .mast-right")).toBeVisible();
  await expect(page.locator(".mast .mobile-nav")).toBeHidden();
  await expect(page.locator(".home-main .journey")).not.toHaveAttribute(
    "data-route-entrance",
  );
  await expect(page.locator(".home-main .journey-line")).toHaveCSS(
    "animation-name",
    "route-draw",
  );
});
