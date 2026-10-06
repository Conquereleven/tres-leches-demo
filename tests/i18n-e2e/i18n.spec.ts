import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync } from "node:fs";
const sourceIndex: Record<string, string> = JSON.parse(
  readFileSync("src/brand/locales/source-index.json", "utf8"),
);
const shots = "work/qa/i18n";
const copy = (s: string, l: "en" | "es" | "ar") =>
  l === "en"
    ? s
    : (() => {
        const [ns, key] = sourceIndex[s]!.split(":");
        return JSON.parse(
          readFileSync(`src/brand/locales/${l}/${ns}.json`, "utf8"),
        )[key!];
      })();
async function switchTo(page: Page, locale: string) {
  await page.locator(".b-language:visible").first().click();
  await page
    .locator(`.b-language-menu:visible [data-locale="${locale}"]`)
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}
for (const locale of ["en", "es", "ar"] as const)
  for (const width of [390, 768, 1440])
    test(`${locale} customer journey and visual QA ${width}`, async ({
      page,
      context,
    }) => {
      mkdirSync(shots, { recursive: true });
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const providers: string[] = [];
      page.on("request", (r) => {
        if (/api\.(?:test\.)?paymennt\.com|graph\.facebook/.test(r.url()))
          providers.push(r.url());
      });
      const shot = async (name: string) => {
        if (name !== "guide") await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
        await page.screenshot({
          path: `${shots}/${locale}-${name}-${width}.png`,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const content = await page.locator("body").innerText();
        expect(content, `${locale}/${name}: untranslated copy`).not.toMatch(
          /Traducción pendiente|الترجمة قيد الإعداد/,
        );
        await page.screenshot({
          path: `${shots}/${locale}-${name}-${width}.png`,
        });
        if (
          ["home", "menu", "product", "cart", "checkout", "tracking"].includes(
            name,
          )
        )
          await page.screenshot({
            path: `${shots}/${locale}-${name}-${width}-full.png`,
            fullPage: true,
          });
      };
      await page.goto(`/?lang=${locale}`);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      await shot("home");
      if (width < 900) {
        expect(
          await page.locator(".b-header").evaluate((header) => {
            const language = header
              .querySelector(".b-mobile-language")!
              .getBoundingClientRect();
            const bounds = header.getBoundingClientRect();
            return (
              language.bottom <= bounds.bottom && language.top >= bounds.top
            );
          }),
        ).toBe(true);
        await page
          .getByRole("button", { name: copy("Open menu", locale), exact: true })
          .click();
        await shot("mobile-navigation");
        if (locale === "ar") {
          await expect(page.locator(".b-modal .b-modal-nav")).toHaveCSS(
            "direction",
            "rtl",
          );
          await expect(
            page.locator(".b-modal .b-modal-nav a").first(),
          ).toHaveCSS("text-align", "start");
        }
        await page
          .getByRole("button", {
            name: copy("Close dialog", locale),
            exact: true,
          })
          .click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
      await page.locator("#how-to-order").scrollIntoViewIfNeeded();
      await shot("guide");
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations).toEqual([]);
      await page.goto("/menu?category=conchas");
      await shot("menu");
      await expect(page.locator("[data-product-id]")).toHaveCount(4);
      await page.goto("/menu?product=conchas-filled--pistache");
      await shot("product");
      await page.locator("main select").selectOption("Mini");
      await page
        .getByRole("textbox", { name: copy("Quantity", locale), exact: true })
        .fill("3");
      await page.locator("main .b-product-page .b-button").last().click();
      await page.goto("/cart");
      await shot("cart");
      await expect(page.locator(".b-quantity-input")).toHaveValue("3");
      const cart = await page.evaluate(() => localStorage.getItem("3l-cart"));
      for (const next of ["en", "es", "ar", locale]) {
        await switchTo(page, next);
        expect(await page.evaluate(() => localStorage.getItem("3l-cart"))).toBe(
          cart,
        );
        await expect(page.locator(".b-quantity-input")).toHaveValue("3");
      }
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await page
        .getByRole("link", {
          name: copy("CONTINUE TO FULFILLMENT", locale),
          exact: true,
        })
        .click();
      await page
        .getByRole("combobox", {
          name: copy("Delivery area", locale),
          exact: true,
        })
        .fill("JLT Cluster C");
      await page
        .getByLabel(copy("Street address and community", locale), {
          exact: true,
        })
        .fill("Fixture Street");
      await page
        .getByLabel(copy("Building or villa", locale), { exact: true })
        .fill("Fixture Tower");
      await page
        .getByLabel(copy("Delivery date", locale), { exact: true })
        .fill("2026-10-05");
      await page
        .getByRole("combobox", {
          name: copy("Delivery time", locale),
          exact: true,
        })
        .selectOption("4:00 PM – 9:00 PM");
      await shot("fulfillment");
      await page
        .getByRole("button", {
          name: copy("CONTINUE TO DETAILS", locale),
          exact: true,
        })
        .click();
      await page
        .getByLabel(copy("First name", locale), { exact: true })
        .fill("Fixture");
      await page
        .getByLabel(copy("Last name", locale), { exact: true })
        .fill("Customer");
      await page
        .getByLabel(copy("Email for payment receipt", locale), { exact: true })
        .fill("fixture@example.invalid");
      await page
        .getByLabel(copy("Mobile number", locale), { exact: true })
        .fill("0500000000");
      await page
        .getByLabel(copy("WhatsApp number (optional)", locale), { exact: true })
        .fill("525512345678");
      await page
        .getByRole("button", {
          name: copy("REVIEW ORDER", locale),
          exact: true,
        })
        .click();
      await expect(page.getByRole("alert")).toContainText(
        copy(
          "Please include the country code in your WhatsApp number, for example +52.",
          locale,
        ),
      );
      await page
        .getByLabel(copy("WhatsApp number (optional)", locale), { exact: true })
        .fill("+525512345678");
      for (const next of ["en", "es", "ar", locale]) {
        await switchTo(page, next);
        await expect(
          page.getByLabel(copy("First name", next as typeof locale), {
            exact: true,
          }),
        ).toHaveValue("Fixture");
        await expect(
          page.getByLabel(copy("Last name", next as typeof locale), {
            exact: true,
          }),
        ).toHaveValue("Customer");
      }
      await shot("contact");
      await page
        .getByRole("button", {
          name: copy("REVIEW ORDER", locale),
          exact: true,
        })
        .click();
      await shot("checkout");
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      // Mock-only reconciliation, never a provider call or charge.
      await context.route("https://pay.test.paymennt.com/**", (r) =>
        r.fulfill({
          contentType: "text/html",
          body: "<h1>Mock hosted page</h1>",
        }),
      );
      await page.getByRole("checkbox").check();
      await page.locator("button[type=submit]").click();
      await expect(page).toHaveURL(/pay.test.paymennt.com/);
      await page.goto("http://127.0.0.1:3210/checkout/return");
      await expect(
        page.getByRole("heading", {
          name: new RegExp(copy("Thank you", locale)),
        }),
      ).toBeVisible();
      await shot("tracking");
      expect(errors).toEqual([]);
      expect(providers).toEqual([]);
    });

for (const locale of ["en", "es", "ar"] as const) {
  test(`${locale} localized minimum and pickup validation`, async ({
    page,
  }) => {
    await page.goto(`/?lang=${locale}`);
    await page.goto("/menu?product=conchas-filled--pistache");
    await page.locator("main select").selectOption("Mini");
    await page.locator("main .b-product-page .b-button").last().click();
    await page.goto("/checkout");
    await page
      .getByRole("combobox", {
        name: copy("Delivery area", locale),
        exact: true,
      })
      .fill("JLT Cluster C");
    await expect(
      page.getByRole("button", {
        name: copy("CONTINUE TO DETAILS", locale),
        exact: true,
      }),
    ).toBeDisabled();
    const text = await page.locator("main").innerText();
    expect(text).toContain("30");
    expect(text).toContain("12");
    expect(text).not.toMatch(/Traducción pendiente|الترجمة قيد الإعداد/);
    if (locale !== "en") expect(text).not.toContain("minimum order");
    await page
      .getByRole("radio", { name: copy("PICKUP", locale), exact: true })
      .check();
    await expect(page.getByLabel(copy("Delivery area", locale))).toHaveCount(0);
    await page
      .getByLabel(copy("Pickup date", locale), { exact: true })
      .fill("2026-10-05");
    await page
      .getByRole("combobox", { name: copy("Pickup time", locale), exact: true })
      .selectOption("4:00 PM – 9:00 PM");
    await page
      .getByRole("button", {
        name: copy("CONTINUE TO DETAILS", locale),
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: copy("REVIEW ORDER", locale), exact: true })
      .click();
    const fullName = page.getByLabel(copy("First name", locale), {
      exact: true,
    });
    expect(
      await fullName.evaluate(
        (el) => (el as HTMLInputElement).validationMessage,
      ),
    ).toBe(copy("Please complete this field.", locale));
    await fullName.fill("Pickup");
    await page
      .getByLabel(copy("Last name", locale), { exact: true })
      .fill("Fixture");
    const email = page.getByLabel(copy("Email for payment receipt", locale), {
      exact: true,
    });
    await email.fill("invalid");
    await page
      .getByRole("button", { name: copy("REVIEW ORDER", locale), exact: true })
      .click();
    expect(
      await email.evaluate((el) => (el as HTMLInputElement).validationMessage),
    ).toBe(copy("Enter a valid email address.", locale));
    await email.fill("fixture@example.invalid");
    await page
      .getByLabel(copy("Mobile number", locale), { exact: true })
      .fill("0500000000");
    await page
      .getByLabel(copy("Street address", locale), { exact: true })
      .fill("Fixture street");
    await page.getByLabel(copy("City", locale), { exact: true }).fill("Dubai");
    await expect(
      page.getByLabel(copy("Country", locale), { exact: true }),
    ).toHaveValue(copy("United Arab Emirates", locale));
    await page
      .getByRole("button", { name: copy("REVIEW ORDER", locale), exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: copy("Order review", locale) }),
    ).toContainText(copy("Pickup", locale));
    await expect(page.locator("button[type=submit]")).toContainText("18");
    await page.screenshot({
      path: `${shots}/${locale}-pickup-390.png`,
      fullPage: true,
    });
  });
  test(`${locale} editorial motion and reduced-motion regression`, async ({
    page,
  }) => {
    await page.goto(`/?lang=${locale}`);
    const section = page.locator(".ref-tradition");
    const progress = async (fraction: number) => {
      await section.evaluate(
        (el, f) =>
          window.scrollTo({
            top: el.getBoundingClientRect().top + scrollY - innerHeight * f,
            behavior: "instant",
          }),
        fraction,
      );
      await page.waitForTimeout(300);
      return Number(
        await section.evaluate((el) =>
          (el as HTMLElement).style.getPropertyValue("--editorial-progress"),
        ),
      );
    };
    expect(await progress(0.05)).toBeGreaterThan(await progress(0.7));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    expect(
      await page.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);
    await expect(page.locator(".ref-tradition")).toBeVisible();
  });
}

test("multiple SKUs, option identities and fulfillment draft survive every language", async ({
  page,
}) => {
  await page.goto("/?lang=en");
  for (const [product, qty] of [
    ["conchas-filled--pistache", "3"],
    ["pan-de-muerto-traditional--azucar", "2"],
  ]) {
    await page.goto(`/menu?product=${product}`);
    await page
      .locator("main select")
      .selectOption(product!.startsWith("pan-") ? "Mini · 40 g" : "Mini");
    const values = await page
      .locator("main select option")
      .evaluateAll((options) =>
        options.map((o) => (o as HTMLOptionElement).value),
      );
    for (const lang of ["es", "ar", "en"]) {
      await switchTo(page, lang);
      expect(
        await page
          .locator("main select option")
          .evaluateAll((options) =>
            options.map((o) => (o as HTMLOptionElement).value),
          ),
      ).toEqual(values);
    }
    await page
      .getByRole("textbox", { name: "Quantity", exact: true })
      .fill(qty!);
    await page.locator("main .b-product-page .b-button").last().click();
  }
  await page.goto("/cart");
  const cart = await page.evaluate(() => localStorage.getItem("3l-cart"));
  expect(JSON.parse(cart!)).toHaveLength(2);
  for (const lang of ["es", "ar", "en"]) {
    await switchTo(page, lang);
    expect(await page.evaluate(() => localStorage.getItem("3l-cart"))).toBe(
      cart,
    );
    await expect(page.locator(".b-quantity-input")).toHaveCount(2);
  }
  await page.goto("/checkout");
  await page
    .getByRole("combobox", { name: "Delivery area", exact: true })
    .fill("JLT Cluster C");
  await page
    .getByLabel("Street address and community", { exact: true })
    .fill("Persistent Fixture Street");
  await page
    .getByLabel("Building or villa", { exact: true })
    .fill("Persistent Tower");
  await page.getByLabel("Delivery date", { exact: true }).fill("2026-10-05");
  await page
    .getByRole("combobox", { name: "Delivery time", exact: true })
    .selectOption("4:00 PM – 9:00 PM");
  for (const lang of ["es", "ar", "en"] as const) {
    await switchTo(page, lang);
    await expect(
      page.getByRole("combobox", {
        name: copy("Delivery area", lang),
        exact: true,
      }),
    ).toHaveValue("JLT Cluster C");
    await expect(
      page.getByLabel(copy("Street address and community", lang), {
        exact: true,
      }),
    ).toHaveValue("Persistent Fixture Street");
    await expect(
      page.getByLabel(copy("Building or villa", lang), { exact: true }),
    ).toHaveValue("Persistent Tower");
    await expect(
      page.getByLabel(copy("Delivery date", lang), { exact: true }),
    ).toHaveValue("2026-10-05");
    await expect(
      page.getByRole("combobox", {
        name: copy("Delivery time", lang),
        exact: true,
      }),
    ).toHaveValue("4:00 PM – 9:00 PM");
    expect(await page.evaluate(() => localStorage.getItem("3l-cart"))).toBe(
      cart,
    );
  }
  await page.reload();
  await expect(
    page.getByLabel("Street address and community", { exact: true }),
  ).toHaveValue("Persistent Fixture Street");
});

test("all public policies and contact localize without changing cancellation amounts", async ({
  page,
}) => {
  for (const locale of ["en", "es", "ar"] as const) {
    for (const route of [
      "/terms",
      "/privacy",
      "/refund-policy",
      "/delivery-policy",
      "/contact",
    ]) {
      await page.goto(`${route}?lang=${locale}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      const text = await page.locator("main").innerText();
      expect(text).not.toMatch(/Traducción pendiente|الترجمة قيد الإعداد/);
      if (route === "/terms" || route === "/refund-policy") {
        expect(text).toContain("90%");
        expect(text).toContain("10%");
        expect(text).toContain("12");
      }
      if (locale !== "en")
        expect(text).not.toMatch(
          /Please order early|If the delivery still cannot|A confirmed order may/,
        );
    }
  }
});
