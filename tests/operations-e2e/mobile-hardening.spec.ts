import { test, expect, devices, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { omsWorkspace } from "../fixtures/oms";

const orderUrl = "/operations/orders/TL-FIX00001";
const snapshot = () => omsWorkspace();
async function serve(page: Page) {
  const data = snapshot();
  await page.route("**/api/**", (r) => r.fulfill({ json: data }));
  return data;
}

test("HTTP 401 expires the session independently of server message language", async ({
  page,
}) => {
  let expired = false;
  await page.route("**/api/**", (r) =>
    r.fulfill(
      expired
        ? { status: 401, json: { error: "Session expired" } }
        : { json: snapshot() },
    ),
  );
  await page.goto(orderUrl);
  await expect(page.locator(".oms-details")).toBeVisible();
  expired = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".oms-details")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(orderUrl + "$"));
});

test("successful refresh clears a failed read without losing order or filters", async ({
  page,
}) => {
  let fail = false;
  await page.route("**/api/**", (r) =>
    fail ? r.abort("failed") : r.fulfill({ json: snapshot() }),
  );
  await page.goto("/operations/orders?q=layla");
  await expect(page.locator(".oms-table tbody tr")).toHaveCount(1);
  fail = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toHaveValue("layla");
});

test("a pending workspace read is shared by refresh triggers", async ({
  page,
}) => {
  let reads = 0,
    holdNext = false;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/**", async (r) => {
    reads++;
    if (holdNext) {
      holdNext = false;
      await gate;
    }
    await r.fulfill({ json: snapshot() }).catch(() => {});
  });
  await page.goto(orderUrl);
  await expect(page.locator(".oms-details")).toBeVisible();
  const initial = reads;
  holdNext = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.poll(() => reads).toBe(initial + 1);
  // Deterministic repeated lifecycle event, no wall-clock polling race.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  expect(reads).toBe(initial + 1);
  release();
});

test("an older read cannot overwrite a completed order transition", async ({
  page,
}) => {
  const data = snapshot();
  let reads = 0,
    posts = 0,
    holdNext = false;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let completed!: () => void;
  const oldCompleted = new Promise<void>((r) => {
    completed = r;
  });
  await page.route("**/api/**", async (r) => {
    if (r.request().method() === "POST") {
      posts++;
      expect(r.request().postDataJSON()).toMatchObject({
        type: "transition",
        version: data.orders[0]!.version,
      });
      expect(r.request().headers()["idempotency-key"]).toBeTruthy();
      data.orders[0]!.state = "Production";
      data.orders[0]!.version++;
      return r.fulfill({ json: { ok: true } });
    }
    const frozen = structuredClone(data);
    reads++;
    const held = holdNext;
    if (held) {
      holdNext = false;
      await gate;
    }
    await r.fulfill({ json: frozen }).catch(() => {});
    if (held) completed();
  });
  await page.goto(orderUrl);
  await expect(page.locator(".oms-details")).toHaveAttribute(
    "data-state",
    "Confirmed",
  );
  const initial = reads;
  holdNext = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.poll(() => reads).toBe(initial + 1);
  await page
    .getByRole("button", { name: "Start preparation", exact: true })
    .click();
  await expect(page.locator(".oms-details")).toHaveAttribute(
    "data-state",
    "Production",
  );
  release();
  await oldCompleted;
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(page.locator(".oms-details")).toHaveAttribute(
    "data-state",
    "Production",
  );
  expect(posts).toBe(1);
});

test("workspace works without AbortSignal.timeout", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(AbortSignal, "timeout", {
      value: undefined,
      configurable: true,
    }),
  );
  await serve(page);
  await page.goto(orderUrl);
  await expect(page.locator(".oms-details")).toBeVisible();
});

test("lost command response is not retried automatically; explicit retry keeps its idempotency key", async ({
  page,
}) => {
  const data = snapshot();
  const keys: string[] = [];
  await page.route("**/api/**", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: data });
    keys.push(r.request().headers()["idempotency-key"]!);
    if (keys.length === 1) return r.abort("failed");
    return r.fulfill({
      status: 409,
      json: { error: "Versión desactualizada" },
    });
  });
  await page.goto(orderUrl);
  await page
    .getByRole("button", { name: "Start preparation", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".oms-details")).toHaveAttribute(
    "data-state",
    "Confirmed",
  );
  expect(keys).toHaveLength(1);
  await page
    .getByRole("button", { name: "Start preparation", exact: true })
    .click();
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".oms-details")).toHaveAttribute(
    "data-state",
    "Confirmed",
  );
});

test("slow command times out visibly without a second mutation", async ({
  page,
}) => {
  await page.clock.install();
  let posts = 0;
  await page.route("**/api/**", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: snapshot() });
    posts++;
    // Deliberately leave transport pending; the client owns the bounded timeout.
  });
  await page.goto(orderUrl);
  await page
    .getByRole("button", { name: "Start preparation", exact: true })
    .click();
  await expect.poll(() => posts).toBe(1);
  await page.clock.fastForward(15001);
  await expect(page.getByRole("alert")).toContainText("Request timed out");
  await expect(page.locator(".oms-details")).toHaveAttribute(
    "data-state",
    "Confirmed",
  );
  expect(posts).toBe(1);
});

test("same-event rapid taps issue one versioned command", async ({ page }) => {
  let posts = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/**", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: snapshot() });
    posts++;
    await gate;
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto(orderUrl);
  const button = page.getByRole("button", {
    name: "Start preparation",
    exact: true,
  });
  await button.evaluate((el) => {
    (el as HTMLButtonElement).click();
    (el as HTMLButtonElement).click();
  });
  await expect.poll(() => posts).toBe(1);
  await expect(button).toBeDisabled();
  release();
  await expect(button).toBeEnabled();
  expect(posts).toBe(1);
});

test("login rejects duplicate submits and returns to the same filtered route", async ({
  page,
}) => {
  let signedIn = false,
    logins = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/**", async (r) => {
    if (r.request().url().endsWith("/login")) {
      logins++;
      await gate;
      signedIn = true;
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill(
      signedIn
        ? { json: snapshot() }
        : { status: 401, json: { error: "Expired" } },
    );
  });
  await page.goto("/operations/orders?q=layla");
  await page
    .getByRole("textbox", { name: "Agent", exact: true })
    .fill("fixture");
  await page.getByLabel("Password", { exact: true }).fill("fictional-password");
  await page.locator("form").evaluate((el) => {
    (el as HTMLFormElement).requestSubmit();
    (el as HTMLFormElement).requestSubmit();
  });
  await expect.poll(() => logins).toBe(1);
  release();
  await expect(page.getByRole("searchbox")).toHaveValue("layla");
  await expect(page).toHaveURL(/q=layla/);
  expect(logins).toBe(1);
});

test("offline, reconnect and background resume preserve navigation and avoid writes", async ({
  page,
  context,
}) => {
  let reads = 0,
    writes = 0;
  await page.route("**/api/**", (r) => {
    if (r.request().method() !== "GET") writes++;
    reads++;
    return r.fulfill({ json: snapshot() });
  });
  await page.goto("/operations/orders?q=layla");
  await expect(page.locator(".oms-table tbody tr")).toHaveCount(1);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(
    page.getByRole("status").filter({ hasText: "Offline" }),
  ).toBeVisible();
  await context.setOffline(false);
  const before = reads;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(
    page.getByRole("status").filter({ hasText: "Offline" }),
  ).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toHaveValue("layla");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenReads = reads;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  expect(reads).toBe(hiddenReads);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => reads).toBeGreaterThan(hiddenReads);
  expect(writes).toBe(0);
});

for (const width of [320, 375, 390, 430, 768, 1440, 412]) {
  test(`${width}px: order details, touch navigation, focus and viewport resize`, async ({
    page,
  }, info) => {
    await serve(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(orderUrl);
    await expect(page.locator(".oms-details")).toBeVisible();
    mkdirSync("docs/operations/mobile-hardening/sprint02", { recursive: true });
    await page.screenshot({
      path: `docs/operations/mobile-hardening/sprint02/details-${info.project.name}-${width}.png`,
      fullPage: true,
    });
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(await overflow()).toBe(false);
    if (width < 768) {
      const menu = page.getByRole("button", { name: "Open menu", exact: true });
      const box = (await menu.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await menu.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
      await menu.click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Orders", exact: true })
        .click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(page.locator(".oms-table")).toBeVisible();
      await page.getByRole("searchbox").fill("layla");
      // Layout probe only: not a physical virtual-keyboard validation.
      await page.setViewportSize({ width, height: 420 });
      await expect(page.getByRole("searchbox")).toBeInViewport();
      expect(await overflow()).toBe(false);
      await page.setViewportSize({ width, height: 900 });
    }
    expect(
      await page
        .locator(".oms-tabs button")
        .evaluateAll((buttons) =>
          buttons.every((button) => button.scrollWidth <= button.clientWidth),
        ),
    ).toBe(true);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({
      path: `test-results/mobile-hardening/${info.project.name}-${width}.png`,
      fullPage: true,
    });
  });
}

for (const profile of [
  "iPhone 13",
  "iPhone 17 Pro",
  "Galaxy S24",
  "Galaxy S Ultra layout",
]) {
  test(`touch profile ${profile}: list, order and mobile navigation (simulation)`, async ({
    browser,
  }, info) => {
    const device =
      devices[profile === "Galaxy S Ultra layout" ? "Galaxy S24" : profile]!;
    const context = await browser.newContext({
      ...device,
      ...(profile === "Galaxy S Ultra layout"
        ? { viewport: { width: 412, height: 915 } }
        : {}),
      baseURL: info.project.use.baseURL,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await serve(page);
      await page.goto("/operations/orders?q=layla");
      await page.getByRole("link", { name: "#012", exact: true }).tap();
      await expect(page.locator(".oms-details")).toHaveAttribute(
        "data-state",
        "Confirmed",
      );
      await expect(page.locator(".oms-details")).toContainText("Paid");
      await page
        .getByRole("button", { name: "Back to orders", exact: true })
        .tap();
      await expect(page.getByRole("searchbox")).toHaveValue("layla");
      await page.getByRole("button", { name: "Open menu", exact: true }).tap();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/mobile-hardening/${info.project.name}-${profile.replaceAll(" ", "-")}.png`,
      });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
