/** Synthetic actual HTTP/mock settlement → real UI/downloads. Never a live payment. */
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  integratedServer,
  checkoutBody,
} from "../fixtures/rt01-integrated-client";
for (const width of [390, 1440])
  for (const language of ["en", "tl"] as const)
    test(`integrated checkout/settlement/documents ${width}/${language}`, async ({
      page,
      browser,
    }, info) => {
      const f = await integratedServer();
      const out = process.env.PRINT_EVIDENCE_DIR!;
      if (!out) throw new Error("PRINT_EVIDENCE_DIR required");
      mkdirSync(out, { recursive: true });
      const prefix = `${info.project.name}-${width}-${language}`;
      writeFileSync(
        join(out, prefix + "-engine.json"),
        JSON.stringify({ version: browser.version(), synthetic: true }),
      );
      const resources = JSON.parse(
        readFileSync(`src/commerce/locales/${language}.json`, "utf8"),
      );
      const t = (s: string) => resources[s] ?? s;
      try {
        const configResponse = await page.request.get(
          f.base + "/api/checkout/config",
        );
        expect(configResponse.status()).toBe(200);
        const config = await configResponse.json();
        expect(config.catalog.dynamic).toBe(true);
        expect(config.catalog.revision).toBeTruthy();
        expect(config.catalogAvailable).toBe(true);
        expect(config.enabled).toBe(true);
        await page.setViewportSize({ width, height: 1000 });
        await page.clock.setFixedTime(new Date("2026-11-15T12:51:00Z"));
        await page.addInitScript(
          (lang) =>
            localStorage.setItem("3l-operations-language:fixture-admin", lang),
          language,
        );
        const post = (path: string, data: unknown, key = randomUUID()) =>
          page.request.post(f.base + path, {
            headers: { Origin: f.base, "Idempotency-Key": key },
            data,
          });
        const ids: Array<{ id: string; held: boolean }> = [];
        for (const pickup of [true, false])
          for (const held of [false, true]) {
            await f.control("pending");
            await f.control("clock", { now: "2026-11-12T10:38:00Z" });
            const key = randomUUID();
            const created = await post(
              "/api/checkout/web",
              checkoutBody(pickup),
              key,
            );
            expect(created.status(), await created.text()).toBe(200);
            const { orderId } = await created.json();
            ids.push({ id: orderId, held });
            if (held) await f.control("hold", { orderId });
            await f.control("clock", { now: "2026-11-15T12:51:00Z" });
            await f.control("paid");
            expect(
              (await post("/api/checkout/reconcile", { key })).status(),
            ).toBe(200);
            expect(
              (await post("/api/checkout/reconcile", { key })).status(),
            ).toBe(200);
          }
        expect(
          (
            await post("/api/login", {
              id: "fixture-admin",
              password: "fictional-password",
            })
          ).status(),
        ).toBe(200);
        await page.goto(f.base + "/operations/orders");
        await expect(page.locator(".oms-table tbody tr")).toHaveCount(4);
        for (const { id, held } of ids) {
          await page.goto(f.base + "/operations/orders/" + id);
          const region = page.getByRole("region", {
            name: t("Fulfillment"),
            exact: true,
          });
          if (held) {
            await expect(region.getByRole("alert")).toBeVisible();
            await expect(region).not.toContainText("4:00 PM");
          } else {
            await expect(region).toContainText("4:00 PM");
            await expect(region).not.toContainText("14 Nov");
          }
          const geometry = await page.evaluate(() => ({
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
          }));
          expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
          if (!held) {
            for (const [label, suffix] of [
              [t("Delivery note · A5 candidate") + " (PDF)", "a5.pdf"],
              [
                t("Delivery notes · A4 two-up candidate") + " (PDF)",
                "two-up.pdf",
              ],
            ]) {
              // Labels are shared with the reviewed Orders detail consumer.
              const button = page.getByRole("button", {
                name: label,
                exact: true,
              });
              if ((await button.count()) === 0)
                throw new Error(`Missing actual download button ${label}`);
              const waiting = page.waitForEvent("download");
              await button.click();
              const d = await waiting;
              expect(await d.failure()).toBeNull();
              await d.saveAs(join(out, `${prefix}-${id}.${suffix}`));
            }
          }
          await page.screenshot({
            path: join(out, `${prefix}-${id}.png`),
            fullPage: true,
          });
        }
        await page.goto(f.base + "/operations/orders");
        await page
          .getByRole("button", {
            name:
              language === "en"
                ? /^Select all \d+ matching orders$/
                : /^Piliin ang lahat ng \d+ tugmang order$/,
          })
          .click();
        for (const [label, ext] of [
          ["Export orders CSV", "csv"],
          ["Delivery notes (PDF)", "pdf"],
          ["Delivery notes (ZIP)", "zip"],
        ]) {
          await page.locator(".oms-export-trigger").click();
          const waiting = page.waitForEvent("download");
          await page
            .getByRole("button", { name: t(label), exact: true })
            .click();
          const d = await waiting;
          expect(await d.failure()).toBeNull();
          await d.saveAs(join(out, `${prefix}-real-settled-bulk.${ext}`));
        }
        await page.goto(f.base + "/operations/print");
        for (const { id, held } of ids) {
          await page.locator(".ops-print select").first().selectOption(id);
          if (held)
            await expect(page.locator(".ops-print")).toContainText(
              t("Fulfillment pending customer and 3L team confirmation."),
            );
          else
            await expect(page.locator(".ops-print")).toContainText("4:00 PM");
        }
        await page.screenshot({
          path: join(out, prefix + "-printcenter.png"),
          fullPage: true,
        });
      } finally {
        await f.close();
      }
    });
