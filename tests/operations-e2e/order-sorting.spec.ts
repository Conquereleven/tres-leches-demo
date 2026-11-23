import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { omsWorkspace } from "../fixtures/oms";
import type { Workspace } from "../../src/commerce/api";

// Test-loader-safe locale reads, as in product-language.spec.ts. Never import
// the app's JSX/i18n instance into Playwright's native ESM discovery process.
const locales = {
  en: JSON.parse(
    readFileSync("src/commerce/locales/en.json", "utf8"),
  ) as Record<string, string>,
  tl: JSON.parse(
    readFileSync("src/commerce/locales/tl.json", "utf8"),
  ) as Record<string, string>,
};
const translateOps = (language: "en" | "tl", key: string) => {
  const value = locales[language][key];
  if (typeof value !== "string")
    throw new Error(`Missing Operations test locale: ${language}/${key}`);
  return value;
};
// Stable per-user browser preference contract; fixture-local, no app import.
const preferenceKey = (user: string) =>
  `3l-operations-language:${encodeURIComponent(user)}`;

const SHOTS = process.env.P1_EVIDENCE_DIR ?? "work/qa/order-sorting";
function fixture() {
  const data = omsWorkspace() as unknown as Workspace;
  const base = structuredClone(data.orders[0]!);
  const numbers = [
    200,
    199,
    1000,
    999,
    400,
    399,
    ...Array.from({ length: 22 }, (_, i) => 300 + i),
  ];
  data.orders = numbers.map((number, i) => ({
    ...structuredClone(base),
    id: `TL-P1-${i}`,
    publicOrderNumber: number,
    paymentId: `p1-payment-${i}`,
    state:
      i === 2 || i === 3
        ? "Ready"
        : i === 4 || i === 5
          ? "Production"
          : "Confirmed",
    audit: [
      {
        at: i % 2 ? "2026-11-13T12:00:00.000Z" : "2026-11-12T10:38:00.000Z",
        actor: "synthetic",
        action: "created",
      },
    ],
    paidAt: "2026-11-13T12:51:00.000Z",
  }));
  data.orders.push({
    ...structuredClone(base),
    id: "TL-P1-UNPAID",
    publicOrderNumber: undefined,
    paymentId: "p1-unpaid",
    state: "Awaiting Payment",
    paidAt: undefined,
    audit: [
      { at: "2026-11-15T12:00:00.000Z", actor: "synthetic", action: "created" },
    ],
  });
  data.orders.push({
    ...structuredClone(base),
    id: "TL-P1-HISTORICAL",
    publicOrderNumber: undefined,
    paymentId: "p1-historical",
    state: "Confirmed",
    paidAt: undefined,
    audit: [],
  });
  data.payments = data.orders.map((o) => ({
    ...structuredClone(data.payments[0]!),
    id: o.paymentId!,
    orderId: o.id,
    status: o.state === "Awaiting Payment" ? "pending" : "paid",
    paidAt: o.paidAt,
  }));
  return data;
}
for (const language of ["en", "tl"] as const)
  for (const width of [390, 1440])
    test(`P1 numeric All, creation filters and stored paid facts ${language} ${width}`, async ({
      page,
      browserName,
    }) => {
      const data = fixture();
      const writes: string[] = [];
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        ({ key, language }) => localStorage.setItem(key, language),
        { key: preferenceKey(data.actor.id), language },
      );
      await page.route("**/api/**", (r) => {
        if (r.request().method() !== "GET") writes.push(r.request().url());
        return r.fulfill({ json: data });
      });
      await page.goto("/operations/orders");
      const rows = page.locator(".oms-table tbody tr");
      await expect(rows).toHaveCount(25);
      await expect(rows.nth(0)).toHaveAttribute("data-order", "TL-P1-2");
      await expect(rows.nth(1)).toHaveAttribute("data-order", "TL-P1-3");
      await expect(
        page.getByRole("columnheader", {
          name: translateOps(language, "Created at"),
          exact: true,
        }),
      ).toHaveText(translateOps(language, "Created at"));
      await expect(rows.first()).toContainText(
        translateOps(language, "Paid at (3L recognition)"),
      );
      await page
        .getByRole("button", {
          name: translateOps(language, "Next"),
          exact: true,
        })
        .click();
      await expect(rows).toHaveCount(5);
      const pageIds = await rows.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-order")),
      );
      expect(pageIds.indexOf("TL-P1-0")).toBeLessThan(
        pageIds.indexOf("TL-P1-1"),
      );
      await expect(page.locator('[data-order="TL-P1-UNPAID"]')).toContainText(
        translateOps(language, "Unnumbered"),
      );
      await expect(
        page.locator('[data-order="TL-P1-HISTORICAL"]'),
      ).toContainText(translateOps(language, "Not stored"));
      await page.screenshot({
        path: `${SHOTS}/${browserName}-${language}-${width}-all.png`,
        fullPage: true,
      });

      await page.goto(
        "/operations/orders?placedFrom=2026-11-12&placedTo=2026-11-12",
      );
      await expect(rows).toHaveCount(14);
      await expect(rows.first()).toHaveAttribute("data-order", "TL-P1-2");
      await page.goto("/operations/orders?q=%23200");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toHaveAttribute("data-order", "TL-P1-0");
      await rows.first().getByRole("link").click();
      await expect(page).toHaveURL(/\/operations\/orders\/TL-P1-0$/);
      await expect(
        page.getByRole("region", {
          name: translateOps(language, "Payment summary"),
          exact: true,
        }),
      ).toContainText(translateOps(language, "Paid at (3L recognition)"));
      await expect(page.locator(".oms-page-heading")).toContainText("2026");
      await page.screenshot({
        path: `${SHOTS}/${browserName}-${language}-${width}-detail.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(writes).toEqual([]);
    });

for (const width of [390, 1440])
  test(`P1 Preparing and Ready keep creation priority ${width}`, async ({
    page,
  }) => {
    const data = fixture();
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/api/**", (r) => r.fulfill({ json: data }));
    for (const [status, expected] of [
      ["ready", ["TL-P1-3", "TL-P1-2"]],
      ["preparing", ["TL-P1-5", "TL-P1-4"]],
    ] as const) {
      await page.goto(`/operations/orders?status=${status}`);
      const rows = page.locator(".oms-table tbody tr");
      await expect(rows).toHaveCount(2);
      expect(
        await rows.evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute("data-order")),
        ),
      ).toEqual(expected);
    }
  });
