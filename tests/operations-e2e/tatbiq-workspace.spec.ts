import { expect, test } from "@playwright/test";
import { workspace } from "../fixtures/ux-states";

const modules = [
  ["Analytics & Reports", "analytics"],
  ["Orders", "orders"],
  ["Kitchen / Production", "production"],
  ["Products", "products"],
  ["Deliveries", "delivery"],
  ["Inbox", "inbox"],
  ["Print Center", "print"],
  ["Delivery areas", "zones"],
  ["Settings", "settings"],
  ["Diagnostics / UAT", "readiness"],
  ["Overview", "overview"],
] as const;

for (const width of [390, 768, 1440]) {
  test(`Tatbiq at ${width}px navigates the authorized merchant modules`, async ({
    page,
  }, info) => {
    const fixture = { ...workspace(), environment: "staging" };
    await page.route("**/api/**", async (route) => {
      expect(route.request().method()).toBe("GET");
      if (
        new URL(route.request().url()).pathname === "/api/analytics/summary"
      ) {
        await route.fulfill({
          status: 503,
          json: { error: "Synthetic report unavailable" },
        });
        return;
      }
      await route.fulfill({ json: fixture });
    });
    await page.setViewportSize({ width, height: 930 });
    await page.goto("/operations/overview");
    const shell = page.locator(".tatbiq-workspace");
    await expect(shell).toBeVisible();
    await expect(page.locator(".ops-summary-card")).toHaveCount(6);
    await expect(page.locator(".ops-v2-priorities > li").first()).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`overview-${width}.png`),
      fullPage: true,
    });
    for (const [label, path] of modules) {
      const nav =
        width === 390 ? page.getByRole("dialog") : page.locator(".ops-sidebar");
      if (width === 390) {
        await page
          .locator(".tatbiq-bottom-nav")
          .getByRole("button", { name: "Operations menu" })
          .click();
        await expect(nav).toBeVisible();
        if (path === "analytics")
          await page.screenshot({
            path: info.outputPath("navigation-390.png"),
          });
      }
      await nav.getByRole("button", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/operations/${path}$`));
      await expect(page.locator("h1")).toBeVisible();
      if (["orders", "products", "production", "analytics"].includes(path))
        await page.screenshot({
          path: info.outputPath(`${path}-${width}.png`),
        });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
  });
}

test("mobile navigation hides unauthorized modules and preserves the existing role guards", async ({
  page,
}) => {
  const fixture = workspace();
  fixture.actor.role = "agent";
  await page.route("**/api/**", (route) => route.fulfill({ json: fixture }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/operations/overview");
  await page
    .locator(".tatbiq-bottom-nav")
    .getByRole("button", { name: "Operations menu" })
    .click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  for (const name of ["Settings", "Analytics & Reports", "Diagnostics / UAT"])
    await expect(drawer.getByRole("button", { name })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(
    page
      .locator(".tatbiq-bottom-nav")
      .getByRole("button", { name: "Operations menu" }),
  ).toBeFocused();
  await page.goto("/operations/settings");
  await expect(
    page.getByText("Settings access is restricted", { exact: true }),
  ).toBeVisible();
  await page.goto("/operations/products");
  await expect(
    page.getByText("Product Hub access is restricted", { exact: true }),
  ).toBeVisible();
});
