import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync } from "node:fs";
const cookies = new Map<string, string>();
const resources = Object.fromEntries(
  ["en", "tl"].map((l) => [
    l,
    JSON.parse(readFileSync(`src/commerce/locales/${l}.json`, "utf8")),
  ]),
);
test.beforeAll(async ({ request }) => {
  for (const role of ["admin", "operator"]) {
    const r = await request.post("/api/login", {
      headers: { Origin: "https://127.0.0.1:3339" },
      data: { id: `fixture-${role}`, password: "fictional-password" },
    });
    expect(r.status()).toBe(200);
    cookies.set(role, r.headers()["set-cookie"]!.split(";")[0]!.split("=")[1]!);
  }
});
async function login(page: Page, path: string, role = "admin") {
  await page.context().addCookies([
    {
      name: "tl_session",
      value: cookies.get(role)!,
      url: "https://127.0.0.1:3339",
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    },
  ]);
  await page.goto(path);
}
for (const width of [390, 1440])
  for (const language of ["en", "tl"])
    for (const view of ["overview", "analytics"]) {
      test(`V2 ${view} ${language} ${width}: accessible, responsive, read-only`, async ({
        page,
      }, info) => {
        const errors: string[] = [],
          mutations: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("request", (r) => {
          if (r.method() !== "GET") mutations.push(r.url());
        });
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript(
          (l) =>
            localStorage.setItem("3l-operations-language:fixture-admin", l),
          language,
        );
        await login(
          page,
          `/operations/${view}${view === "analytics" ? "?from=2026-10-01&to=2026-10-19" : ""}`,
        );
        const tr = (key: string) => resources[language][key] ?? key;
        if (view === "overview") {
          await expect(page.locator(".ops-v2-summary button")).toHaveCount(6);
          await expect(page.locator(".ops-v2-finance")).toBeVisible();
          if (width === 1440) {
            const tops = await page
              .locator(".ops-v2-summary button")
              .evaluateAll((nodes) =>
                nodes.map((n) => Math.round(n.getBoundingClientRect().top)),
              );
            expect(new Set(tops).size).toBe(1);
          }
          await expect(
            page.getByRole("heading", {
              name: tr("Current order pipeline"),
              exact: true,
            }),
          ).toBeVisible();
          await expect(page.locator(".ops-v2-priorities > li")).not.toHaveCount(
            0,
          );
        } else {
          await expect(
            page.locator(".an-kpis article").nth(1).locator("strong"),
          ).toHaveText("18");
          await expect(
            page.locator("#an-products table tbody tr"),
          ).not.toHaveCount(0);
          await expect(page.getByLabel(tr("Trend grouping"))).toBeVisible();
        }
        await page.evaluate(() => document.fonts.ready);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        const directory = "work/qa/operations-experience-v2";
        mkdirSync(directory, { recursive: true });
        await page.screenshot({
          path: `${directory}/${view}-${language}-${width}-${info.project.name}.png`,
          fullPage: true,
        });
        expect(errors).toEqual([]);
        expect(mutations).toEqual([]);
      });
    }
test("V2 overview precise filters; operator never requests financial API", async ({
  page,
}) => {
  const finance: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/analytics/")) finance.push(r.url());
  });
  await login(page, "/operations/overview", "operator");
  await expect(page.locator(".ops-v2-summary button")).toHaveCount(6);
  await expect(page.locator(".ops-v2-finance")).toHaveCount(0);
  await page.getByRole("button", { name: /Awaiting preparation/ }).click();
  await expect(page).toHaveURL(/orders\?status=confirmed$/);
  await expect(page.locator("tr[data-order]")).toHaveCount(5);
  expect(finance).toEqual([]);
});
test("V2 today financial read failure is recoverable without fabricated figures", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/analytics/summary?**", async (r) =>
    fail
      ? r.fulfill({ status: 503, json: { error: "fixture outage" } })
      : r.continue(),
  );
  await login(page, "/operations/overview");
  await expect(
    page.getByText("Financial summary unavailable", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".ops-v2-finance")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".ops-v2-finance")).toBeVisible();
});
test("V2 weekly/monthly aggregation preserves captured totals and applied export range", async ({
  page,
}) => {
  await login(page, "/operations/analytics?from=2026-10-01&to=2026-10-19");
  await expect(page.locator(".an-kpis")).toBeVisible();
  const kpis = await page.locator(".an-kpis").innerText();
  const first = page.getByRole("region", {
    name: "Daily report table",
    exact: true,
  });
  const sum = async () =>
    first
      .locator("tbody tr")
      .evaluateAll((rows) =>
        rows.reduce((a, r) => a + Number(r.children[1]!.textContent), 0),
      );
  expect(await sum()).toBe(18);
  const fils = await first
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.reduce(
        (a, r) =>
          a +
          Math.round(
            Number(r.children[2]!.textContent!.replace(/[^0-9.]/g, "")) * 100,
          ),
        0,
      ),
    );
  expect(fils).toBe(132500);
  await page.getByLabel("Trend grouping").selectOption("week");
  expect(await sum()).toBe(18);
  await expect(first.locator("tbody tr")).toHaveCount(4);
  await page.getByLabel("Trend grouping").selectOption("month");
  await expect(first.locator("tbody tr")).toHaveCount(1);
  expect(await sum()).toBe(18);
  expect(await page.locator(".an-kpis").innerText()).toBe(kpis);
  const href = await page
    .getByRole("link", { name: "Export CSV" })
    .first()
    .getAttribute("href");
  await page.getByLabel("From", { exact: true }).fill("2020-01-01");
  await expect(page.getByRole("status")).toContainText(
    "Date changes are not applied",
  );
  expect(
    await page
      .getByRole("link", { name: "Export CSV" })
      .first()
      .getAttribute("href"),
  ).toBe(href);
  await expect(page.locator(".ops-v2-comparisons > div")).toHaveCount(3);
});
