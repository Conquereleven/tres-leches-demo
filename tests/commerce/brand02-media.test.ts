import { PAN_OCT13_CORRECTION } from "../../server/domain/pan-price-correction";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  selectedProductMedia,
  categoryEditorialMedia,
} from "../../src/brand/media";
import products from "../../shared/storefront-products.json";
import plan from "../../docs/brand/brand02/replacement-manifest.json";
const baseline = "5d47c9d09b629bec73d47b34026848ca9ccca72a";
test("BRAND02 accounts for seven interim products and independent editorial replacements", () => {
  const current = products.filter(
    (p) => p.familyId.startsWith("conchas") && p.id !== "conchas-tricolor-pack",
  );
  assert.equal(current.length, 7);
  assert.equal(plan.products.length, 7);
  for (const p of current) {
    const row = plan.products.find((r) => r.productId === p.id)!;
    assert.ok(row);
    assert.deepEqual(row.skuIds, p.optionIds);
    assert.equal(row.replacementStatus, "AWAITING FOUNDER-APPROVED IMAGES");
    const asset = selectedProductMedia(p.id, p.familyId, p.variant)!;
    if (p.id === "conchas-traditional--tricolor") {
      assert.equal(asset, undefined);
      continue;
    }
    assert.equal(row.currentSourceId, asset.sourceId);
    assert.equal(asset.width, asset.height);
    for (const d of row.currentDerivatives)
      assert.ok(existsSync("public" + d.src), d.src);
  }
  const gallery = categoryEditorialMedia("conchas");
  // 3L-MEDIA-002 photographs open the gallery; BRAND02 frames follow them.
  const editorial = gallery.filter(
    (a) => !a.sourceId.startsWith("3l-media-002-"),
  );
  assert.deepEqual(gallery.slice(-editorial.length), editorial);
  // The previously planned third frame was explicitly withdrawn.
  assert.equal(editorial.length, 2);
  assert.ok(
    editorial.every((a) =>
      plan.editorial.some((p) => p.sourceId === a.sourceId),
    ),
  );
  assert.ok(
    editorial.every(
      (a) => !a.sourceId.includes("conchas_de_pistache_sobre_tabla_de_madera"),
    ),
  );
  for (const a of editorial)
    assert.ok(!plan.products.some((p) => p.currentSourceId === a.sourceId));
});
test("BRAND02 leaves commercial identifiers, prices, availability, translations and checkout behavior untouched", () => {
  for (const path of [
    "data-imports/liza-current-menu.json",
    "shared/storefront-products.json",
    "shared/commerce-policy.ts",
    "src/brand/menu-data.json",
    "src/brand/Shop.tsx",
    "src/brand/cart.ts",
    "src/brand/locales/en/menu.json",
    "src/brand/locales/es/menu.json",
    "src/brand/locales/ar/menu.json",
  ]) {
    const old = execFileSync("git", ["show", `${baseline}:${path}`]);
    if (
      [
        "data-imports/liza-current-menu.json",
        "src/brand/menu-data.json",
      ].includes(path)
    ) {
      const current = JSON.parse(readFileSync(path, "utf8"));
      if (current.items)
        current.items = current.items.filter(
          (i: { id: string }) => !i.id.startsWith("conchas-tricolor-pack-3-"),
        );
      if (current.families)
        current.families = current.families.filter(
          (f: { id: string }) => f.id !== "conchas-tricolor-pack",
        );
      const undoPrices = (value: unknown): void => {
        if (Array.isArray(value)) value.forEach(undoPrices);
        else if (value && typeof value === "object") {
          const row = value as Record<string, unknown>;
          const pair = PAN_OCT13_CORRECTION[String(row.id)];
          if (pair) {
            if ("priceFils" in row) {
              assert.equal(row.priceFils, pair[1]);
              row.priceFils = pair[0];
            } else if ("priceAed" in row) {
              assert.equal(Number(row.priceAed) * 100, pair[1]);
              row.priceAed = (pair[0] / 100).toFixed(2);
            }
          }
          Object.values(row).forEach(undoPrices);
        }
      };
      undoPrices(current);
      assert.deepEqual(current, JSON.parse(old.toString()), path);
    } else {
      // The BRAND02 release must remain free of commerce changes. PACK-001
      // subsequently extends cart/checkout under its own behavioral regressions;
      // compare the historical visual release for these two implementation files.
      const current = ["src/brand/Shop.tsx", "src/brand/cart.ts"].includes(path)
        ? execFileSync("git", [
            "show",
            `a75a0fa1637f4511ed0237e2b4fff621489e619a:${path}`,
          ])
        : readFileSync(path);
      if (path === "shared/storefront-products.json")
        assert.deepEqual(
          JSON.parse(current.toString()).filter(
            (p: { id: string }) => p.id !== "conchas-tricolor-pack",
          ),
          JSON.parse(old.toString()),
          path,
        );
      else if (/src\/brand\/locales\/(en|es|ar)\/menu.json/.test(path)) {
        const now = JSON.parse(current.toString()),
          previous = JSON.parse(old.toString());
        const expected = path.includes("/en/")
          ? "Tricolor Concha · 1 piece"
          : path.includes("/es/")
            ? "Concha Tricolor · 1 pieza"
            : "كونشا تريكولور · قطعة واحدة";
        assert.equal(now.copy_8ac93f91a21b40c3, expected);
        now.copy_8ac93f91a21b40c3 = previous.copy_8ac93f91a21b40c3;
        // Conversion UX translations are additive to the historic BRAND02
        // visual release; keep this guard focused on prior catalog copy.
        for (const key of Object.keys(now))
          if (key.startsWith("conversion_") || key.startsWith("pack_v2_"))
            delete now[key];
        assert.deepEqual(now, previous, path);
      } else assert.deepEqual(current, old, path);
    }
  }
});
