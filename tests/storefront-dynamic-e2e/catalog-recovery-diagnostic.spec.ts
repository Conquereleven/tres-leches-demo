import { test, expect } from "@playwright/test";
import type { LiveCatalog } from "../../src/brand/live-catalog";

// TPL-16 diagnostic: the exact "catalog unavailable retries" scenario, instrumented.
// Each iteration prints one `DIAG {...}` line (no customer data) and then makes the
// original assertion, so a failing iteration carries its own evidence.
for (const width of [390, 1440]) {
  test(`diagnostic: catalog recovery after TRY AGAIN ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const catalog: LiveCatalog = await (
      await page.request.get("/api/storefront/catalog")
    ).json();
    const t0 = Date.now();
    const at = () => Date.now() - t0;
    const net: string[] = [];
    let failed = true;
    await page.route("**/api/storefront/catalog", (route) => {
      const answer = failed ? 503 : 200;
      net.push(`${at()}:route:${answer}`);
      return failed
        ? route.fulfill({ status: 503, json: { error: "fixture unavailable" } })
        : route.fulfill({ json: catalog });
    });
    page.on("requestfailed", (r) => {
      if (r.url().includes("/api/storefront/catalog"))
        net.push(`${at()}:requestfailed:${r.failure()?.errorText}`);
    });
    page.on("response", (r) => {
      if (r.url().includes("/api/storefront/catalog"))
        net.push(`${at()}:response:${r.status()}`);
    });
    await page.addInitScript(() => {
      const log: string[] = [];
      (window as unknown as { __diag: string[] }).__diag = log;
      const t = () => Math.round(performance.now());
      addEventListener("focus", () => log.push(`${t()}:focus`));
      document.addEventListener("visibilitychange", () =>
        log.push(`${t()}:visibility:${document.visibilityState}`),
      );
      const tryAgain = () =>
        [...document.querySelectorAll("button")]
          .filter((b) => /try again/i.test(b.textContent ?? ""))
          .map((b) => (b.textContent ?? "").trim());
      for (const type of ["pointerdown", "click"])
        document.addEventListener(
          type,
          (e) => {
            const el = e.target as HTMLElement;
            const button = el.closest("button");
            log.push(
              `${t()}:${type}:${el.tagName}:${(button?.textContent ?? "").trim().slice(0, 30)}:buttons=${JSON.stringify(tryAgain())}`,
            );
          },
          true,
        );
      new MutationObserver(() => {
        const s = [...document.querySelectorAll("[data-catalog-status]")]
          .map((n) => n.getAttribute("data-catalog-status"))
          .join(",");
        if (
          log.at(-1) !== `status:${s}` &&
          !log.at(-1)?.endsWith(`:status:${s}`)
        )
          log.push(`${t()}:status:${s}`);
      }).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-catalog-status"],
      });
    });
    await page.goto("/menu?category=cakes");
    await expect(
      page.locator('[data-catalog-status="unavailable"]'),
    ).toBeVisible();
    await expect(page.locator(".b-menu-card")).toHaveCount(0);
    failed = false;
    const candidates = page
      .locator('[data-catalog-status] > [role="status"]')
      .getByRole("button", { name: "TRY AGAIN", exact: true });
    net.push(`${at()}:click-start`);
    let outcome = "live";
    try {
      await candidates.click({ timeout: 5000 });
      net.push(`${at()}:click-done`);
    } catch (e) {
      outcome = /strict mode/.test(String(e))
        ? "strict-ambiguous"
        : "click-error";
    }
    if (outcome === "live")
      try {
        await expect(
          page.locator('[data-catalog-status="live"]'),
        ).toBeVisible();
      } catch {
        outcome = "stuck";
      }
    const browser = await page.evaluate(
      () => (window as unknown as { __diag: string[] }).__diag,
    );
    console.log(
      "DIAG " +
        JSON.stringify({
          width,
          outcome,
          buttonsAfter: await page
            .getByRole("button", { name: /try again/i })
            .allInnerTexts(),
          net,
          browser,
        }),
    );
    expect(outcome).toBe("live");
    await expect(page.locator(".b-menu-card").first()).toBeVisible();
  });
}
