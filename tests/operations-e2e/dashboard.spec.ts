import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { workspace } from "../fixtures/ux-states";
import { readFileSync } from "node:fs";
const resources = Object.fromEntries(
  ["en", "tl"].map((l) => [
    l,
    JSON.parse(readFileSync(`src/commerce/locales/${l}.json`, "utf8")),
  ]),
);
const tr = (language: string, key: string) => resources[language][key] ?? key;
// Isolated snapshot; JVC rule mirrors the existing approved fixture (not a live update).
const snapshot = () => ({
  ...workspace(),
  zones: [
    {
      id: "jvc",
      name: "JVC",
      aliases: ["Jumeirah Village Circle"],
      minOrderAed: 100,
      deliveryFeeAed: 0,
      freeDelivery: true,
      active: true,
      priority: 10,
      version: 1,
    },
  ],
});
const screens = [
  "overview",
  "orders",
  "production",
  "delivery",
  "inbox",
  "zones",
  "products",
  "print",
  "settings",
];
for (const width of [390, 768, 1440])
  for (const language of ["en", "tl"] as const)
    test(`${language} ${width}: workspace, RBAC and preview`, async ({
      page,
    }, info) => {
      // Nine full pages, axe scans and desktop evidence screenshots share one
      // test budget. Keep per-assertion timeouts unchanged; Linux CI exceeded
      // the default 30s cumulative budget at the final routes/reload.
      test.setTimeout(90_000);
      const data = snapshot();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.route("**/api/**", async (r) => {
        if (r.request().method() !== "GET")
          throw Error("Unexpected mutation during read-only visual QA");
        await r.fulfill({ json: data });
      });
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        ({ id, language }) =>
          !localStorage.getItem(
            `3l-operations-language:${encodeURIComponent(id)}`,
          ) &&
          localStorage.setItem(
            `3l-operations-language:${encodeURIComponent(id)}`,
            language,
          ),
        { id: data.actor.id, language },
      );
      for (const screen of screens) {
        await page.goto(`/operations/${screen}`);
        await expect(page.locator(".ops-shell")).toHaveAttribute(
          "lang",
          language,
        );
        await expect(page.locator(".ops-topbar")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          await page
            .locator("img")
            .evaluateAll((images) =>
              images.every(
                (image) =>
                  (image as HTMLImageElement).complete &&
                  (image as HTMLImageElement).naturalWidth > 0,
              ),
            ),
        ).toBe(true);
        const results = await new AxeBuilder({ page }).analyze();
        expect(
          results.violations,
          JSON.stringify(results.violations),
        ).toEqual([]);
        if (screen === "print") {
          await expect(
            page.getByText(tr(language, "Printer connection not configured"), {
              exact: true,
            }),
          ).toHaveCount(2);
          await page
            .getByRole("combobox", { name: tr(language, "Order"), exact: true })
            .selectOption(data.orders[0].id);
          await expect(page.locator(".ops-ticket")).toContainText(
            tr(language, "PREVIEW"),
          );
          expect(
            await page
              .getByRole("button", { name: /^Print$|^Reprint$/ })
              .count(),
          ).toBe(0);
        }
        if (screen === "orders") {
          await page.getByLabel(tr(language, "Search orders")).fill("Omar");
          await expect(
            page.locator(".ops-order-list").first().locator(".ops-order-card"),
          ).toHaveCount(1);
          await page.getByLabel(tr(language, "Search orders")).fill("");
        }
        if (info.project.name === "chromium")
          await page.screenshot({
            path: `docs/operations/d1/screenshots/${language}-${screen}-${width}.png`,
            fullPage: true,
          });
      }
      expect(errors).toEqual([]);
      await page.goto("/operations/overview");
      await page
        .getByLabel(tr(language, "Dashboard language"))
        .selectOption(language === "en" ? "tl" : "en");
      await page.reload();
      await expect(page.locator(".ops-shell")).toHaveAttribute(
        "lang",
        language === "en" ? "tl" : "en",
      );
    });
test("agent cannot use settings or a fake product editor", async ({ page }) => {
  const data = snapshot();
  data.actor.role = "agent";
  await page.route("**/api/**", (r) => r.fulfill({ json: data }));
  await page.goto("/operations/settings");
  await expect(
    page.getByText("Settings access is restricted", { exact: true }),
  ).toBeVisible();
  await page.goto("/operations/products");
  await expect(
    page.getByText("Product Hub access is restricted", { exact: true }),
  ).toBeVisible();
  expect(await page.locator(".ops-content input").count()).toBe(0);
});
for (const language of ["en", "tl"] as const)
  test(`${language}: transition uses canonical state, version and idempotency`, async ({
    page,
  }) => {
    const data = snapshot();
    const requests: Record<string, unknown>[] = [];
    await page.addInitScript(
      ({ id, language }) =>
        localStorage.setItem(
          `3l-operations-language:${encodeURIComponent(id)}`,
          language,
        ),
      { id: data.actor.id, language },
    );
    await page.route("**/api/**", async (r) => {
      if (r.request().method() === "POST") {
        requests.push(r.request().postDataJSON());
        expect(r.request().headers()["idempotency-key"]).toBeTruthy();
        await r.fulfill({ json: { ok: true } });
      } else await r.fulfill({ json: data });
    });
    await page.goto("/operations/orders");
    await expect(page.locator(".ops-shell")).toHaveAttribute("lang", language);
    await page
      .getByRole("button", {
        name: tr(language, "Empezar preparación"),
        exact: true,
      })
      .first()
      .click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toEqual({
      type: "transition",
      id: data.orders[0].id,
      version: data.orders[0].version,
      state: "Production",
    });
  });

for (const language of ["en", "tl"] as const) {
  for (const scenario of [
    "missing",
    "incomplete",
    "duplicate",
    "changed catalog",
  ] as const) {
    test(`${language}: historical ticket ${scenario}`, async ({ page }) => {
      const data = snapshot();
      const order = data.orders[0];
      const originalName = order.catalogSnapshot[0].name;
      if (scenario === "missing")
        Reflect.deleteProperty(order, "catalogSnapshot");
      if (scenario === "incomplete") order.catalogSnapshot = [];
      if (scenario === "duplicate")
        order.catalogSnapshot.push({ ...order.catalogSnapshot[0] });
      data.catalog[0].name = "Current catalog must never replace history";
      data.catalog[0].priceFils = 99900;
      await page.route("**/api/**", async (route) => {
        expect(route.request().method()).toBe("GET");
        await route.fulfill({ json: data });
      });
      await page.addInitScript(
        ({ id, language }) =>
          localStorage.setItem(
            `3l-operations-language:${encodeURIComponent(id)}`,
            language,
          ),
        { id: data.actor.id, language },
      );
      await page.goto("/operations/print");
      await page
        .getByRole("combobox", { name: tr(language, "Order"), exact: true })
        .selectOption(order.id);
      if (scenario === "changed catalog") {
        await expect(page.locator(".ops-ticket")).toContainText(originalName);
        await expect(page.locator(".ops-ticket")).not.toContainText(
          data.catalog[0].name,
        );
      } else {
        await expect(page.getByRole("alert")).toHaveText(
          tr(
            language,
            "Review required: the stored order catalog snapshot is missing or inconsistent. Ticket preview is unavailable.",
          ),
        );
        await expect(page.locator(".ops-ticket")).toHaveCount(0);
      }
      await expect(
        page.getByRole("button", { name: /^(Print|Reprint)$/ }),
      ).toHaveCount(0);
    });
  }
}
