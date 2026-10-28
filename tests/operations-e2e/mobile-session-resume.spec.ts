import { test, expect } from "@playwright/test";
import { omsWorkspace } from "../fixtures/oms";

test("login completed in the background resumes the retained order route", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let authenticated = false;
  let release!: () => void;
  const loginResponse = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/**", async (route) => {
    if (route.request().url().endsWith("/login")) {
      await loginResponse;
      authenticated = true;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill(
      authenticated
        ? { json: omsWorkspace() }
        : { status: 401, json: { error: "Session expired" } },
    );
  });
  await page.goto("/operations/orders/TL-FIX00001");
  await page.getByLabel("Password", { exact: true }).fill("fictional-password");
  const request = page.waitForRequest((r) => r.url().endsWith("/api/login"));
  await page
    .getByRole("button", { name: "Sign in to workspace", exact: true })
    .click();
  await request;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const response = page.waitForResponse((r) => r.url().endsWith("/api/login"));
  release();
  expect(await (await response).finished()).toBeNull();
  await expect
    .poll(async () => {
      const submit = page.getByRole("button", {
        name: "Sign in to workspace",
        exact: true,
      });
      return (await submit.count()) === 0 || (await submit.isEnabled());
    })
    .toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".oms-details")).toHaveAttribute(
    "data-order",
    "TL-FIX00001",
  );
  await expect(page).toHaveURL(/\/operations\/orders\/TL-FIX00001$/);
  expect(errors).toEqual([]);
});
