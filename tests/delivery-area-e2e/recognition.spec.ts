import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { bluewatersFixture } from "../fixtures/delivery-areas";
import AxeBuilder from "@axe-core/playwright";

const zoneId = bluewatersFixture.id;
const index = JSON.parse(
  readFileSync("src/brand/locales/source-index.json", "utf8"),
);
function copy(locale: string, source: string): string {
  const [ns, key] = index[source].split(":");
  return JSON.parse(
    readFileSync(`src/brand/locales/${locale}/${ns}.json`, "utf8"),
  )[key];
}
async function open(
  page: Page,
  locale = "en",
  quantity = 6,
  restoredId?: string,
) {
  await page.addInitScript(
    ({ quantity, restoredId }) => {
      localStorage.setItem(
        "3l-cart",
        JSON.stringify([{ productId: "pan-de-muerto", quantity }]),
      );
      if (restoredId)
        sessionStorage.setItem(
          "3l-checkout-draft",
          JSON.stringify({ delivery: { zoneId: restoredId } }),
        );
    },
    { quantity, restoredId },
  );
  await page.goto(`/checkout?lang=${locale}`);
  await expect(
    page.getByRole("combobox", {
      name: copy(locale, "Delivery area"),
      exact: true,
    }),
  ).toBeVisible();
}
function noPayment(page: Page) {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      !/\/api\/checkout\/(quote|address)$/.test(new URL(r.url()).pathname)
    )
      writes.push(new URL(r.url()).pathname);
  });
  return writes;
}
async function screenshot(page: Page, name: string, project: string) {
  mkdirSync("work/qa/delivery-area", { recursive: true });
  await page.screenshot({
    path: join("work/qa/delivery-area", `${project}-${name}.png`),
    fullPage: true,
  });
}

for (const locale of ["en", "es", "ar"]) {
  test(`${locale}: neutral no-match, canonical Bluewaters selection, minimum and persistence`, async ({
    page,
  }, info) => {
    const writes = noPayment(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page, locale);
    const area = page.getByRole("combobox", {
      name: copy(locale, "Delivery area"),
      exact: true,
    });
    const status = page.locator('.b-area-field [role="status"]');
    await area.fill("Sharrjah");
    await expect(status).toHaveText(
      copy(
        locale,
        "We couldn't find that area. Try another spelling or contact us.",
      ),
    );
    await expect(
      page.getByText(
        copy(locale, "Try another spelling, contact 3L or choose pickup."),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText(copy(locale, "We don't currently deliver to this area."), {
        exact: true,
      }),
    ).toHaveCount(0);
    await screenshot(page, `${locale}-no-match`, info.project.name);
    for (const query of [
      "Bluewaters",
      "Blue Waters",
      "Bluewaters Island",
      "Blue Waters Island",
    ]) {
      // Switching between aliases of the same canonical id intentionally does
      // not issue duplicate quotes. Clear first to exercise each resolution.
      await area.fill("");
      await expect(
        page.getByRole("button", {
          name: copy(locale, "CONTINUE TO DETAILS"),
          exact: true,
        }),
      ).toBeDisabled();
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/api/checkout/quote"),
      );
      await area.fill(query);
      const q = await (await response).json();
      expect(q.zoneId).toBe(zoneId);
      expect(q.minOrderAed).toBe(137);
      expect(q.eligible).toBe(true);
      expect(q.feeFils).toBe(0);
      expect(q.totalFils).toBe(q.subtotalFils);
      const option = page.getByRole("option", { name: /^Bluewaters Island / });
      await expect(option).toBeVisible();
      await option.click();
      await expect(area).toHaveValue("Bluewaters Island");
      await expect(status).toContainText("137");
    }
    // A fuzzy hint is only a suggestion until explicitly chosen, including on touch.
    await area.fill("Blue Watr");
    await expect(
      page.getByRole("option", { name: /^Bluewaters Island / }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: copy(locale, "CONTINUE TO DETAILS"),
        exact: true,
      }),
    ).toBeDisabled();
    if (info.project.name.includes("desktop")) await area.press("Enter");
    else await page.getByRole("option", { name: /^Bluewaters Island / }).tap();
    await expect(area).toHaveValue("Bluewaters Island");
    await expect(status).toContainText("137");
    await screenshot(page, `${locale}-selected`, info.project.name);
    await page.reload();
    await expect(area).toHaveValue("Bluewaters Island");
    const draft = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("3l-checkout-draft")!),
    );
    expect(draft.delivery.zoneId).toBe(zoneId);
    expect(await page.evaluate(() => document.documentElement.dir)).toBe(
      locale === "ar" ? "rtl" : "ltr",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
  });
}

test("keyboard selection never submits and blur preserves the canonical choice", async ({
  page,
}) => {
  const writes = noPayment(page);
  await open(page);
  const area = page.getByRole("combobox", {
    name: "Delivery area",
    exact: true,
  });
  await area.fill("Blue Watr");
  await area.press("Escape");
  await expect(area).toHaveAttribute("aria-expanded", "false");
  await area.press("ArrowDown");
  const active = await area.getAttribute("aria-activedescendant");
  expect(active).toContain(zoneId);
  await area.press("Enter");
  await area.press("Tab");
  await expect(area).toHaveValue("Bluewaters Island");
  await expect(
    page.getByRole("heading", { name: "Delivery details", exact: true }),
  ).toBeAttached();
  expect(writes).toEqual([]);
});

test("minimum comes from backend and unmet minimum blocks; empty search never selects", async ({
  page,
}) => {
  await open(page, "en", 5);
  const area = page.getByRole("combobox", {
    name: "Delivery area",
    exact: true,
  });
  await area.fill("Bluewaters");
  await expect(
    page.getByText(
      /minimum order for Bluewaters Island is AED 137.*Add AED 12/,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS", exact: true }),
  ).toBeDisabled();
  await area.fill("");
  await expect(page.locator('.b-area-field [role="status"]')).toBeEmpty();
  expect(await area.evaluate((e: HTMLInputElement) => e.validity.valid)).toBe(
    false,
  );
});

test("ambiguous aliases do not auto-select; frontend-only id is rejected by actual server", async ({
  page,
}) => {
  await page.route("**/api/checkout/config", async (route) => {
    const response = await route.fetch();
    const d = await response.json();
    d.zones.push({
      ...d.zones.find((z: { id: string }) => z.id === zoneId),
      id: "fixture-client-only",
      name: "Bluewaters Residences",
      aliases: ["Bluewaters"],
    });
    await route.fulfill({ response, json: d });
  });
  await open(page);
  const area = page.getByRole("combobox", {
    name: "Delivery area",
    exact: true,
  });
  await area.fill("Bluewaters");
  await expect(
    page
      .getByRole("listbox", { name: "Delivery area", exact: true })
      .getByRole("option"),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS", exact: true }),
  ).toBeDisabled();
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/api/checkout/quote"),
  );
  await page.getByRole("option", { name: /^Bluewaters Residences / }).click();
  expect((await response).status()).toBe(400);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS", exact: true }),
  ).toBeDisabled();
});

test("stale restored id and inactive/pending zones cannot enable delivery", async ({
  page,
}) => {
  await open(page, "en", 6, "fixture-inactive");
  const area = page.getByRole("combobox", {
    name: "Delivery area",
    exact: true,
  });
  await expect(area).toHaveValue("");
  await area.focus();
  await expect(
    page.getByRole("option", { name: /Inactive Fixture|Pending Fixture/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS", exact: true }),
  ).toBeDisabled();
  await area.fill("Blue Waters");
  await page.getByRole("option", { name: /^Bluewaters Island / }).click();
  await expect(page.locator('.b-area-field [role="status"]')).toContainText(
    "137",
  );
});

test("delayed configuration cannot expose stale areas or discard the cart", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/checkout/config", async (route) => {
    await gate;
    await route.continue();
  });
  const writes = noPayment(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "3l-cart",
      JSON.stringify([{ productId: "pan-de-muerto", quantity: 6 }]),
    ),
  );
  await page.goto("/checkout");
  await expect(
    page.getByText("Preparing checkout…", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Delivery area", exact: true }),
  ).toHaveCount(0);
  release();
  const area = page.getByRole("combobox", {
    name: "Delivery area",
    exact: true,
  });
  await expect(area).toBeVisible();
  await area.fill("Blue Waters");
  await expect(page.locator('.b-area-field [role="status"]')).toContainText(
    "137",
  );
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("3l-cart")!)),
  ).toEqual([{ productId: "pan-de-muerto", quantity: 6 }]);
  expect(writes).toEqual([]);
});

test("network error retries with cart retained", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/checkout/config", async (route) => {
    attempts++;
    if (attempts === 1)
      return route.fulfill({
        status: 503,
        json: { error: "isolated fixture outage" },
      });
    return route.continue();
  });
  const writes = noPayment(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "3l-cart",
      JSON.stringify([{ productId: "pan-de-muerto", quantity: 6 }]),
    ),
  );
  await page.goto("/checkout");
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const area = page.getByRole("combobox", {
    name: "Delivery area",
    exact: true,
  });
  await expect(area).toBeVisible();
  await area.fill("Blue Waters");
  await expect(page.locator('.b-area-field [role="status"]')).toContainText(
    "137",
  );
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("3l-cart")!)),
  ).toEqual([{ productId: "pan-de-muerto", quantity: 6 }]);
  expect(writes).toEqual([]);
});

test("Bluewaters persists into review, without creating orders/payments; area field passes axe", async ({
  page,
  request,
}, info) => {
  const writes = noPayment(page);
  await open(page);
  const area = page.getByRole("combobox", {
    name: "Delivery area",
    exact: true,
  });
  await area.fill("Blue Waters Island");
  await page.getByRole("option", { name: /^Bluewaters Island / }).click();
  const results = await new AxeBuilder({ page })
    .include(".b-area-field")
    .analyze();
  expect(results.violations).toEqual([]);
  await page
    .getByLabel("Street address and community")
    .fill("Synthetic Bluewaters fixture street");
  await page.getByLabel("Building or villa").fill("Synthetic fixture tower");
  await page.getByLabel("Delivery date").fill("2026-10-28");
  await page
    .getByRole("combobox", { name: "Delivery time", exact: true })
    .selectOption("4:00 PM – 9:00 PM");
  await page
    .getByRole("button", { name: "CONTINUE TO DETAILS", exact: true })
    .click();
  await page.getByLabel("First name", { exact: true }).fill("Synthetic");
  await page.getByLabel("Last name", { exact: true }).fill("Reviewer");
  await page
    .getByLabel("Email for payment receipt")
    .fill("delivery@example.invalid");
  await page.getByLabel("Mobile number").fill("0500000000");
  await page.getByRole("button", { name: "REVIEW ORDER", exact: true }).click();
  const review = page.getByRole("region", { name: "Order review" });
  await expect(review).toContainText("Bluewaters Island");
  await expect(
    page.getByRole("button", { name: "PAY AED 150", exact: true }),
  ).toBeVisible();
  await screenshot(page, "review", info.project.name);
  const data = await (await request.get("/api/workspace")).json();
  expect(data.orders).toEqual([]);
  expect(data.payments).toEqual([]);
  expect(writes).toEqual([]);
});

test("no-match retains a useful support link and pickup can recover without area", async ({
  page,
}) => {
  const writes = noPayment(page);
  await open(page);
  await page
    .getByRole("combobox", { name: "Delivery area", exact: true })
    .fill("zzzzzz");
  await expect(
    page.getByRole("link", { name: "ASK ABOUT COVERAGE", exact: true }),
  ).toHaveAttribute("href", /wa\.me\//);
  await page.getByRole("radio", { name: "PICKUP", exact: true }).check();
  await expect(
    page.getByRole("combobox", { name: "Delivery area", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Pickup date").fill("2026-10-28");
  await page
    .getByRole("combobox", { name: "Pickup time", exact: true })
    .selectOption("4:00 PM – 9:00 PM");
  await expect(
    page.getByRole("button", { name: "CONTINUE TO DETAILS", exact: true }),
  ).toBeEnabled();
  expect(writes).toEqual([]);
});
