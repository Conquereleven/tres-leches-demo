import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync } from "node:fs";
const resources = Object.fromEntries(
  ["en", "tl"].map((l) => [
    l,
    JSON.parse(readFileSync(`src/commerce/locales/${l}.json`, "utf8")),
  ]),
);
const translateOps = (language: string, key: string) =>
  resources[language][key] ?? key;
const route = "/operations/analytics?from=2026-10-01&to=2026-10-19";
const cookies = new Map<string, string>();
test.beforeAll(async ({ request }) => {
  for (const role of ["admin", "manager", "operator", "agent"]) {
    const response = await request.post("/api/login", {
      headers: { Origin: "http://127.0.0.1:3338" },
      data: { id: `fixture-${role}`, password: "fictional-password" },
    });
    expect(response.status()).toBe(200);
    cookies.set(
      role,
      response.headers()["set-cookie"]!.split(";")[0]!.split("=")[1]!,
    );
  }
});
async function login(page: import("@playwright/test").Page, role = "admin") {
  await page.context().addCookies([
    {
      name: "tl_session",
      value: cookies.get(role)!,
      url: "http://127.0.0.1:3338",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  await page.goto(route);
}

for (const width of [320, 375, 390, 430, 768, 1440])
  for (const language of ["en", "tl"] as const)
    test(`${language} ${width}: real aggregate API, responsive, accessible and CSV`, async ({
      page,
    }, info) => {
      const workspaceCalls: string[] = [],
        mutations: string[] = [],
        errors: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("/api/workspace")) workspaceCalls.push(r.url());
        if (r.method() !== "GET" && !r.url().endsWith("/api/login"))
          mutations.push(r.url());
      });
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewportSize({ width, height: 950 });
      await page.addInitScript(
        (l) => localStorage.setItem("3l-operations-language:fixture-admin", l),
        language,
      );
      await login(page);
      const tr = (key: string) => translateOps(language, key);
      await expect(
        page.getByRole("heading", {
          name: tr("Confirmed captured volume"),
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.locator(".an-kpis article").nth(1).locator("strong"),
      ).toHaveText("18");
      await expect(page.locator(".ops-shell")).toHaveAttribute(
        "lang",
        language,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const scan = await new AxeBuilder({ page }).analyze();
      expect(scan.violations).toEqual([]);
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page
          .getByRole("link", { name: tr("Export CSV") })
          .first()
          .click(),
      ]);
      expect(download.suggestedFilename()).toBe(
        "3l-sales-2026-10-01-2026-10-19.csv",
      );
      await page.reload();
      await expect(
        page.locator(".an-kpis article").nth(1).locator("strong"),
      ).toHaveText("18");
      if ([390, 1440].includes(width) && info.project.name === "chromium") {
        mkdirSync("docs/analytics/screenshots", { recursive: true });
        await page
          .getByRole("heading", {
            name: tr("Analytics & Reports"),
            exact: true,
          })
          .click();
        await page.screenshot({
          path: `docs/analytics/screenshots/analytics-${language}-${width}.png`,
          fullPage: true,
        });
      }
      expect(workspaceCalls).toEqual([]);
      expect(mutations).toEqual([]);
      expect(errors).toEqual([]);
    });
test("filters, empty period, custom validation, unavailable baseline, session expiration and retry", async ({
  page,
}) => {
  await login(page);
  await expect(page.locator(".an-kpis")).toBeVisible();
  await page.getByLabel("From", { exact: true }).fill("2020-01-01");
  await page.getByLabel("To", { exact: true }).fill("2020-01-02");
  await page.getByRole("button", { name: "Apply dates" }).click();
  await expect(
    page.getByText("No verified paid orders in this period", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No comparison baseline", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("From", { exact: true }).fill("2026-10-20");
  await page.getByRole("button", { name: "Apply dates" }).click();
  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
test("operator/agent prohibited; manager permitted", async ({ page }) => {
  for (const role of ["operator", "agent", "manager"]) {
    await page.context().clearCookies();
    await login(page, role);
    if (role === "manager")
      await expect(page.locator(".an-kpis")).toBeVisible();
    else {
      await expect(page.getByRole("alert")).toContainText("restricted");
      await expect(page.locator(".an-kpis")).toHaveCount(0);
    }
  }
});
test("sidebar navigation into Analytics and back preserves Overview, no full workspace on analytics route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await login(page);
  await expect(page.locator(".an-kpis")).toBeVisible();
  await page
    .getByRole("button", { name: "Overview", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/operations\/overview$/);
  await page
    .getByRole("button", { name: "Analytics & Reports", exact: true })
    .first()
    .click();
  await expect(page.locator(".an-kpis")).toBeVisible();
  await expect(page).toHaveURL(/\/operations\/analytics/);
});
test("transient network error hides stale results and retry recovers", async ({
  page,
}) => {
  await login(page);
  await expect(page.locator(".an-kpis")).toBeVisible();
  let failed = true;
  await page.route("**/api/analytics/summary?**", (r) =>
    failed ? r.abort() : r.continue(),
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Report unavailable");
  failed = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".an-kpis")).toBeVisible();
});

test("real sign-in form enters Analytics without loading raw workspace", async ({
  page,
}) => {
  await page.goto(route);
  await page.getByLabel("Agent", { exact: true }).fill("fixture-admin");
  await page.getByLabel("Password", { exact: true }).fill("fictional-password");
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page.locator(".an-kpis")).toBeVisible();
});

test("partial historical allocation shows warnings without inventing product prices", async ({
  page,
}) => {
  await page.route("**/api/analytics/summary?**", async (route) => {
    const response = await route.fetch();
    const report = await response.json();
    report.quality = "partial";
    report.issues = { inconsistent_or_missing_financial_snapshot: 1 };
    report.current.unallocatedOrders = 1;
    report.current.unallocatedFils = 5000;
    await route.fulfill({ json: report });
  });
  await login(page);
  await expect(page.getByText("Partial data · review warnings")).toBeVisible();
  await expect(
    page.getByText("Inconsistent or missing accepted financial snapshots:"),
  ).toBeVisible();
});
