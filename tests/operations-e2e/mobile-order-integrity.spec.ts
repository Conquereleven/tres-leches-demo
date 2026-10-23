import { test, expect } from "@playwright/test";
import { omsWorkspace } from "../fixtures/oms";
import { PACK_SPECS, componentName } from "../../shared/pack-composition";
import type { Line } from "../../server/domain/model";
import { mkdirSync, readFileSync } from "node:fs";
import { validateCatalog } from "../../server/domain/catalog";

function frozenOrderFixture() {
  const traditional = PACK_SPECS.find(
    (p) => p.family === "traditional" && p.capacity === 6 && p.size === "mini",
  )!;
  const filled = PACK_SPECS.find(
    (p) =>
      p.family === "filled" && p.capacity === 12 && p.size === "individuales",
  )!;
  const sugar = traditional.components[0]!.componentSkuId;
  const sesame = traditional.components[1]!.componentSkuId;
  const covering = traditional.components[2]!.componentSkuId;
  const box = (
    spec: typeof traditional,
    quantity: number,
    entries: [string, number][],
  ): Line => ({
    productId: spec.packSkuId,
    quantity,
    composition: entries.map(([componentSkuId, units]) => ({
      componentSkuId,
      units,
    })),
    packSnapshot: {
      version: 1,
      revision: `catalog-v1-${"a".repeat(64)}`,
      capacity: spec.capacity,
      components: entries.map(([componentSkuId, units]) => ({
        componentSkuId,
        units,
        name: componentName(componentSkuId, "en"),
      })),
    },
  });
  const lines: Line[] = [
    { productId: "conchas-traditional-chocolate-individual-70-g", quantity: 2 },
    box(traditional, 2, [
      [sugar, 4],
      [covering, 2],
    ]),
    box(traditional, 1, [[sesame, 6]]),
    box(filled, 1, [[filled.components[0]!.componentSkuId, 12]]),
  ];
  const source = validateCatalog(
    JSON.parse(readFileSync("data-imports/liza-current-menu.json", "utf8")),
  );
  const catalogSnapshot = source.filter((p) =>
    lines.some((l) => l.productId === p.id),
  );
  const amountFils = lines.reduce(
    (sum, l) =>
      sum +
      catalogSnapshot.find((p) => p.id === l.productId)!.priceFils * l.quantity,
    0,
  );
  return {
    lines,
    catalogSnapshot,
    amountFils,
    instructions:
      "ALLERGY: peanuts — call before preparation.\nKeep the mixed boxes separate. Gracias — شكراً.",
  };
}

for (const width of [390, 412])
  for (const language of ["en", "tl"]) {
    test(`${language} ${width}: frozen boxes, payments and original preparation notes survive refresh`, async ({
      page,
    }, info) => {
      const data = omsWorkspace();
      const frozen = frozenOrderFixture();
      Object.assign(data.orders[0], {
        lines: frozen.lines,
        catalogSnapshot: frozen.catalogSnapshot,
        quote: {
          ...data.orders[0].quote,
          subtotalFils: frozen.amountFils,
          totalFils: frozen.amountFils,
        },
        customerDetails: {
          ...data.orders[0].customerDetails,
          instructions: frozen.instructions,
        },
      });
      data.payments[0].amountFils = frozen.amountFils;
      data.catalog = structuredClone(frozen.catalogSnapshot);
      const writes: string[] = [];
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        ({ id, language }) =>
          localStorage.setItem(
            `3l-operations-language:${encodeURIComponent(id)}`,
            language,
          ),
        { id: data.actor.id, language },
      );
      await page.route("**/api/**", (route) => {
        if (route.request().method() !== "GET")
          writes.push(route.request().url());
        return route.fulfill({ json: data });
      });
      await page.goto("/operations/orders/TL-FIX00001");
      await expect(page.locator(".oms-details")).toBeVisible();
      const rows = page.locator(".oms-items tbody tr");
      await expect(rows).toHaveCount(4);
      await expect(rows.nth(1)).toContainText(
        "Per box (6 pieces): Sugar × 4, Sugar with chocolate covering × 2",
      );
      await expect(rows.nth(1)).toContainText("× 2");
      await expect(rows.nth(2)).toContainText("Per box (6 pieces): Sesame × 6");
      await expect(rows.nth(1).locator("td").first()).toHaveText("AED 60.00");
      await expect(rows.nth(1).locator("td").last()).toHaveText("AED 120.00");
      const notes = page.locator(".oms-note");
      await expect(notes).toContainText([
        frozen.instructions,
        "Leave with reception",
      ]);
      const before = await page.locator(".oms-items").innerText();
      for (const product of data.catalog) {
        product.priceFils = 99900;
        product.name = "Mutable catalog must not replace the accepted order";
      }
      const refresh = page.waitForResponse((r) =>
        r.url().endsWith("/api/workspace"),
      );
      await page
        .getByRole("button", {
          name: language === "en" ? "Refresh" : "I-refresh",
          exact: true,
        })
        .click();
      expect((await refresh).status()).toBe(200);
      await expect(page.locator(".oms-items")).toHaveText(before, {
        useInnerText: true,
      });
      await expect(page.locator(".oms-details")).toContainText(
        `AED ${(frozen.amountFils / 100).toFixed(2)}`,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
      mkdirSync("docs/operations/mobile-hardening/sprint02", {
        recursive: true,
      });
      await page.screenshot({
        path: `docs/operations/mobile-hardening/sprint02/frozen-order-${info.project.name}-${language}-${width}.png`,
        fullPage: true,
      });
    });
  }
