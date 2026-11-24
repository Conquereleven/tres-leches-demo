/** Real browser + disposable HTTP fixture. No production/runtime seeding. */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const resources = Object.fromEntries(
  ["en", "tl"].map((language) => [
    language,
    JSON.parse(
      readFileSync(
        new URL(`../../src/commerce/locales/${language}.json`, import.meta.url),
        "utf8",
      ),
    ) as Record<string, string>,
  ]),
);
const translateOps = (
  language: string,
  key: string,
  values?: { count: number },
) =>
  (resources[language]?.[key] ?? key).replace(
    "{{count}}",
    String(values?.count ?? ""),
  );
const out = process.env.PRINT_EVIDENCE_DIR;
if (!out) throw new Error("PRINT_EVIDENCE_DIR required");
async function noPageOverflow(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflowing: [
      ...document.querySelectorAll<HTMLElement>(
        ".oms button, .oms section, .oms-card, .oms-bulk-actions, .oms-head-actions",
      ),
    ]
      .map((e) => {
        const r = e.getBoundingClientRect(),
          s = getComputedStyle(e);
        return {
          tag: e.tagName,
          className: e.className,
          text: e.textContent?.slice(0, 160),
          left: r.left,
          right: r.right,
          width: r.width,
          scrollWidth: e.scrollWidth,
          whiteSpace: s.whiteSpace,
          maxWidth: s.maxWidth,
        };
      })
      .filter(
        (e) =>
          e.width > 0 && (e.right > innerWidth || e.scrollWidth > e.width + 1),
      ),
  }));
  writeFileSync(
    join(out!, `${name}-geometry.json`),
    JSON.stringify(geometry, null, 2),
  );
  expect(geometry.scrollWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(
    geometry.width,
  );
}
async function saveDownload(page: Page, label: string, name: string) {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: label, exact: true }).click();
  const download = await waiting;
  expect(await download.failure()).toBeNull();
  const path = join(out!, name);
  await download.saveAs(path);
  const bytes = readFileSync(path);
  expect(bytes.length).toBeGreaterThan(100);
  return bytes;
}

for (const width of [1440, 390])
  for (const language of ["en", "tl"] as const)
    test(`RT01 ${width}/${language}: >25 selection, filters, held detail/PrintCenter and accepted schedule`, async ({
      page,
    }, info) => {
      mkdirSync(out!, { recursive: true });
      await page.setViewportSize({ width, height: 1000 });
      await page.clock.setFixedTime(new Date("2026-11-04T06:00:00Z"));
      await page.addInitScript(
        (lang) =>
          localStorage.setItem("3l-operations-language:fixture-admin", lang),
        language,
      );
      expect(
        (
          await page.request.post("/api/login", {
            headers: { Origin: "http://127.0.0.1:5174" },
            data: { id: "fixture-admin", password: "fictional-password" },
          })
        ).status(),
      ).toBe(200);
      await page.goto("/operations/orders");
      await expect(page.locator(".oms-table tbody tr")).toHaveCount(25);
      const prefix = `${info.project.name}-${width}-${language}`;
      await noPageOverflow(page, `${prefix}-list`);
      await page
        .getByRole("button", {
          name:
            language === "en"
              ? /^Select all \d+ matching orders$/
              : /^Piliin ang lahat ng \d+ tugmang order$/,
        })
        .click();
      const bulk = page.locator(".oms-bulk");
      await expect(bulk).toBeVisible();
      expect(
        Number((await bulk.locator("strong").innerText()).match(/\d+/)![0]),
      ).toBeGreaterThan(25);
      const selectedText = await bulk.locator("strong").innerText();
      await page
        .locator(".oms-pagination")
        .getByRole("button", {
          name: translateOps(language, "Next"),
          exact: true,
        })
        .click();
      await expect(bulk.locator("strong")).toHaveText(selectedText);
      await expect(
        page.locator('.oms-table tbody input[type="checkbox"]:checked'),
      ).toHaveCount(25);
      await page.screenshot({
        path: join(
          out!,
          `${info.project.name}-${width}-${language}-selection.png`,
        ),
        fullPage: true,
      });
      await noPageOverflow(page, `${prefix}-selected`);
      const count = Number(selectedText.match(/\d+/)![0]);
      for (const [label, kind, ext] of [
        [translateOps(language, "Export orders CSV"), "orders", "csv"],
        [translateOps(language, "Delivery notes (PDF)"), "delivery-a4", "pdf"],
        [translateOps(language, "Delivery notes (ZIP)"), "delivery-a4", "zip"],
        [
          `${translateOps(language, "Delivery note · A5 candidate")} (PDF)`,
          "delivery-a5",
          "pdf",
        ],
        [
          `${translateOps(language, "Delivery notes · A4 two-up candidate")} (PDF)`,
          "delivery-two-up",
          "pdf",
        ],
      ]) {
        const bytes = await saveDownload(
          page,
          label!,
          `${prefix}-bulk-${kind}.${ext}`,
        );
        if (ext === "csv")
          expect(bytes.toString().trim().split("\r\n")).toHaveLength(count + 1);
        if (ext === "pdf")
          expect(bytes.toString("latin1").startsWith("%PDF-1.7")).toBe(true);
        if (ext === "zip") {
          const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
          expect(end).toBeGreaterThan(0);
          expect(bytes.readUInt16LE(end + 10)).toBe(count);
        }
      }
      await page.getByRole("searchbox").fill("TL-RT01-HELD0");
      await expect(page.locator(".oms-table tbody tr")).toHaveCount(1);
      await expect(bulk.locator("strong")).toHaveText(
        translateOps(language, "{{count}} selected", { count: 0 }),
      );
      await page.locator('.oms-table tbody input[type="checkbox"]').check();
      for (const [label, ext] of [
        ["Export orders CSV", "csv"],
        ["Delivery notes (ZIP)", "zip"],
      ]) {
        const waiting = page.waitForEvent("download");
        await page
          .getByRole("button", {
            name: translateOps(language, label!),
            exact: true,
          })
          .click();
        const download = await waiting;
        expect(await download.failure()).toBeNull();
        const path = join(
          out!,
          `${info.project.name}-${width}-${language}-held-single.${ext}`,
        );
        await download.saveAs(path);
        if (ext === "csv") {
          const text = readFileSync(path, "utf8");
          expect(text).toContain("FULFILLMENT REVIEW REQUIRED");
          expect(text).not.toContain("2026-11-05");
          expect(text).not.toContain("4:00 PM");
        }
      }
      await page.goto("/operations/orders/TL-RT01-HELD0");
      await expect(
        page
          .getByRole("region", {
            name: translateOps(language, "Fulfillment"),
            exact: true,
          })
          .getByRole("alert"),
      ).toBeVisible();
      await noPageOverflow(page, `${prefix}-held-detail`);
      await expect(page.locator(".oms-details")).not.toContainText("4:00 PM");
      await expect(page.locator(".oms-steps")).toHaveCount(0);
      await page.screenshot({
        path: join(out!, `${info.project.name}-${width}-${language}-hold.png`),
        fullPage: true,
      });
      await page.goto("/operations/print");
      await page
        .locator(".ops-print select")
        .first()
        .selectOption("TL-RT01-HELD0");
      await expect(page.locator('.ops-print [role="alert"]')).toBeVisible();
      await expect(page.locator(".ops-ticket")).toHaveCount(0);
      await page
        .locator(".ops-print select")
        .first()
        .selectOption("TL-RT01-delivery-auto-rescheduled");
      await expect(page.locator(".ops-ticket")).toContainText("5 Nov 2026");
      await expect(page.locator(".ops-ticket")).toContainText("4:00 PM");
      await page.screenshot({
        path: join(
          out!,
          `${info.project.name}-${width}-${language}-accepted-ticket.png`,
        ),
        fullPage: true,
      });
      for (const method of ["delivery", "pickup"]) {
        await page
          .locator(".ops-print select")
          .first()
          .selectOption(`TL-RT01-RESIDUAL-${method}`);
        await expect(page.locator(".ops-ticket")).toContainText("5 Nov 2026");
        await expect(page.locator(".ops-ticket")).toContainText("4:00 PM");
        await expect(page.locator(".ops-ticket")).not.toContainText(
          "9 Nov 2026",
        );
        await expect(page.locator(".ops-ticket")).not.toContainText("8:00 AM");
        await page.screenshot({
          path: join(out!, `${prefix}-residual-${method}-ticket.png`),
          fullPage: true,
        });
      }
      await page.goto("/operations/orders/TL-RT01-RESIDUAL-delivery");
      await expect(page.locator(".oms-details")).toContainText("4:00 PM");
      await expect(page.locator(".oms-details")).not.toContainText("8:00 AM");
      await noPageOverflow(page, `${prefix}-accepted-detail`);
      await page.goto("/operations/overview");
      const held = page.locator(".ops-v2-priorities > li").filter({
        has: page.getByRole("link", { name: "TL-RT01-HELD0", exact: true }),
      });
      await expect(held).toContainText(
        translateOps(language, "Fulfillment pending confirmation"),
      );
      await expect(held).not.toContainText("4:00 PM");
      await expect(held).not.toContainText("2026-11-05");
      await page.screenshot({
        path: join(out!, `${prefix}-overview-hold.png`),
        fullPage: true,
      });
      // Isolate the two explicit residual-block fixtures for the accepted
      // overview presentation; all downloads above used the real fixture HTTP API.
      const snapshot = await (await page.request.get("/api/workspace")).json();
      const acceptedOverview = {
        ...snapshot,
        orders: snapshot.orders.filter((o: { id: string }) =>
          o.id.startsWith("TL-RT01-RESIDUAL-"),
        ),
      };
      await page.route("**/api/workspace", (r) =>
        r.fulfill({ json: acceptedOverview }),
      );
      await page.clock.setFixedTime(new Date("2026-11-05T06:00:00Z"));
      await page.goto("/operations/overview");
      await expect(
        page.locator(".ops-overview .ops-table-scroll tbody tr"),
      ).toHaveCount(2);
      await expect(page.locator(".ops-overview")).not.toContainText(
        "2026-11-09",
      );
      await expect(page.locator(".ops-overview")).not.toContainText("8:00 AM");
      await expect(
        page
          .locator(".ops-summary-card")
          .filter({ hasText: translateOps(language, "Scheduled today") })
          .locator("strong"),
      ).toHaveText("2");
      await page.screenshot({
        path: join(out!, `${prefix}-overview-accepted-residual.png`),
        fullPage: true,
      });
    });
