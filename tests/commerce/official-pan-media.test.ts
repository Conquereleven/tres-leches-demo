import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import official from "../../src/brand/official-pan-media.json";
import { storefrontProducts, productFamily } from "../../src/brand/menu";
import {
  categoryEditorialMedia,
  selectedProductMedia,
} from "../../src/brand/media";

test("all 50 official photos are accounted for and only reviewed ones are public", () => {
  const map = readFileSync("docs/brand/pan-de-muerto-photo-map.csv", "utf8")
    .trim()
    .split("\n")
    .slice(1);
  assert.equal(map.length, 50);
  const shown = map.filter((line) => /,yes,official-pan-[^,]+,/.test(line));
  // 29 originals are published. Five more assets reuse them in another frame:
  // the filled pack's square board and the four whole boards of the banner.
  assert.equal(shown.length, 29);
  assert.equal(official.assets.length, 34);
  assert.equal(new Set(official.assets.map((a) => a.sourceId)).size, 34);
  // A photo and its cutout are one composition: published together only where
  // Joel approved it (Crema diplomática, 9 October 2026).
  assert.deepEqual(
    official.assets
      .filter((asset) =>
        official.assets.some((o) => o.sourceId === `${asset.sourceId}-cutout`),
      )
      .map((asset) => asset.sourceId),
    ["official-pan-14", "official-pan-16", "official-pan-18"],
  );
  const crema = official.products.find(
    (p) => p.productId === "pan-de-muerto-filled--crema-diplomatica-vainilla",
  )!;
  assert.deepEqual(
    [crema.primarySourceId, ...crema.gallerySourceIds],
    ["official-pan-14", "official-pan-14-cutout", "official-pan-13"],
  );
  const chocolate = official.products.find(
    (p) => p.productId === "pan-de-muerto-filled--chocolate",
  )!;
  assert.deepEqual(
    [chocolate.primarySourceId, ...chocolate.gallerySourceIds],
    [
      "official-pan-16",
      "official-pan-18",
      "official-pan-16-cutout",
      "official-pan-18-cutout",
      "official-pan-29",
    ],
  );
  const asset = (id: string) => official.assets.find((a) => a.sourceId === id)!;
  assert.equal(asset("official-pan-14-cutout").transparent, true);
  assert.equal(official.products.length, 10);
  // Packs show illustrative groups, never one flavour's gallery.
  const pack = (id: string) => {
    const m = official.products.find((p) => p.productId === id)!;
    return [m.primarySourceId, ...m.gallerySourceIds];
  };
  assert.deepEqual(pack("pan-de-muerto-traditional-pack"), [
    "official-pan-02",
    "official-pan-01",
    "official-pan-03",
    "official-pan-04",
  ]);
  assert.deepEqual(pack("pan-de-muerto-filled-pack"), ["official-pan-13-pack"]);
  // Restored category banner: the four boards, whole, in their original 3:2 frame.
  const boards = categoryEditorialMedia("pan");
  assert.deepEqual(
    boards.map((b) => b.sourceId),
    ["01", "02", "03", "04"].map((n) => `official-pan-banner-${n}`),
  );
  for (const board of boards) assert.equal(board.width! / board.height!, 1.5);
  for (const other of ["cakes", "jars"])
    assert.deepEqual(categoryEditorialMedia(other), []);
  // Chocolate-covered fillings have no photograph of their own.
  for (const product of storefrontProducts.filter((p) =>
    /filled--.*chocolate-covering|ajonjoli-chocolate-covering/.test(p.id),
  ))
    assert.ok(!official.products.some((m) => m.productId === product.id));
  for (const mapping of official.products) {
    const product = storefrontProducts.find((p) => p.id === mapping.productId)!;
    assert.ok(product);
    const family = productFamily(product);
    for (const option of family.options) {
      const asset = selectedProductMedia(
        product.id,
        family.id,
        product.variant,
        option.size,
      )!;
      assert.equal(asset.sourceId, mapping.primarySourceId);
      if (!product.familyId.endsWith("-pack"))
        assert.equal(asset.variant, product.variant);
    }
    assert.equal(
      new Set([mapping.primarySourceId, ...mapping.gallerySourceIds]).size,
      1 + mapping.gallerySourceIds.length,
    );
    for (const id of product.familyId.endsWith("-pack")
      ? []
      : mapping.gallerySourceIds)
      assert.equal(
        official.assets.find((a) => a.sourceId === id)?.variant,
        product.variant,
      );
  }
  for (const asset of official.assets) {
    // Every product photograph is square and never enlarged; only the banner is 3:2.
    if (asset.family !== "pan-de-muerto-category")
      assert.equal(asset.width, asset.height);
    assert.ok([4, 6].includes(asset.derivatives.length));
    for (const derivative of asset.derivatives) {
      assert.equal(statSync("public" + derivative.src).size, derivative.bytes);
      assert.ok(
        Math.abs(
          derivative.width / derivative.height - asset.width / asset.height,
        ) < 0.01,
      );
    }
  }
});
