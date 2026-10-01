import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { validateCatalog } from "../../server/domain/catalog";
import {
  menuFamilies,
  menuCategories,
  selectMenuOption,
} from "../../src/brand/menu";

const catalog = validateCatalog(
  JSON.parse(readFileSync("data-imports/liza-current-menu.json", "utf8")),
);
test("approved full menu has 218 unique authoritative SKUs and retires AED25 Pan de Muerto", () => {
  assert.equal(catalog.length, 218);
  assert.equal(new Set(catalog.map((item) => item.id)).size, 218);
  assert.equal(menuFamilies.length, 29);
  assert.equal(menuCategories.length, 8);
  assert.ok(!catalog.some((item) => item.id === "pan-de-muerto"));
  for (const family of menuFamilies) {
    if (family.image) assert.ok(existsSync(`public${family.image}`));
    for (const option of family.options) {
      const item = catalog.find((item) => item.id === option.id)!;
      assert.equal(item.priceFils, option.priceFils);
      assert.equal(
        item.name,
        [family.name, option.variant, option.size].filter(Boolean).join(" · "),
      );
      assert.equal(item.active, true);
      assert.equal(
        selectMenuOption(family, option.variant, option.size).id,
        item.id,
      );
    }
  }
});
test("latest images override old bakery prices and weights without inventing pack assortments", () => {
  for (const prefix of ["pan-de-muerto", "conchas"]) {
    const traditional = menuFamilies.find(
      (family) => family.id === `${prefix}-traditional`,
    )!;
    const filled = menuFamilies.find(
      (family) => family.id === `${prefix}-filled`,
    )!;
    assert.deepEqual(
      [
        ...new Set(
          traditional.options.map((option) =>
            [option.size, option.priceFils].join(":"),
          ),
        ),
      ],
      ["Mini · 40 g:1100", "Individual · 70 g:1300"],
    );
    assert.deepEqual(
      [...new Set(filled.options.map((option) => option.variant))],
      [
        "Crema diplomática (vainilla)",
        "Chocolate",
        "Mascarpone y cajeta",
        "Mascarpone y fresas",
      ],
    );
    assert.deepEqual(
      [...new Set(filled.options.map((option) => option.priceFils))],
      [1800, 2100],
    );
    for (const [type, prices] of [
      ["traditional", [6000, 11500, 7200, 14000]],
      ["filled", [10000, 19000, 12000, 23500]],
    ] as const) {
      const pack = menuFamilies.find(
        (family) => family.id === `${prefix}-${type}-pack`,
      )!;
      assert.deepEqual(
        pack.options.map((option) => option.priceFils),
        prices,
      );
      assert.ok(pack.options.every((option) => option.variant === ""));
    }
  }
  assert.ok(
    menuFamilies
      .find((family) => family.id === "cake-jar-bundle")!
      .options.every((option) => option.variant === ""),
  );
});
test("PDF size labels, extras and explicit advance-order scope are preserved", () => {
  assert.deepEqual(
    menuFamilies
      .filter((family) => family.advanceOrder)
      .map((family) => family.id),
    [
      "tres-leches-mango",
      "jelly-gelatina-fruits",
      "jelly-gelatina-dulce-de-leche",
      "jelly-gelatina-yogurt-strawberry",
      "rosca-de-reyes",
    ],
  );
  const special = menuFamilies.find(
    (family) => family.id === "special-flavours-cake",
  )!;
  assert.deepEqual(
    [...new Set(special.options.map((option) => option.size))],
    ["Mini", "Small", "Big"],
  );
  assert.deepEqual(
    [...new Set(special.options.map((option) => option.priceFils))],
    [9500, 26000, 42000],
  );
  for (const id of ["cake-topper", "candles"]) {
    const option = menuFamilies.find((family) => family.id === id)!.options[0]!;
    assert.equal(option.size, "");
    assert.equal(option.variant, "");
    assert.equal(option.priceFils, 2500);
  }
  assert.throws(() => selectMenuOption(special, "Berries", "14–16 personas"));
});
