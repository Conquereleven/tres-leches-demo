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
  assert.equal(shown.length, official.assets.length);
  assert.equal(official.assets.length, 29);
  assert.equal(new Set(official.assets.map((a) => a.sourceId)).size, 29);
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
  assert.equal(asset("official-pan-13").fit, "contain");
  assert.equal(official.products.length, 8);
  const boards = categoryEditorialMedia("pan");
  assert.equal(boards.length, 4);
  for (const board of boards)
    assert.equal(board.family, "pan-de-muerto-category");
  assert.deepEqual(categoryEditorialMedia("cakes"), []);
  // Packs and chocolate-covered fillings have no photograph of their own.
  for (const product of storefrontProducts.filter(
    (p) =>
      p.familyId.endsWith("-pack") ||
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
      assert.equal(asset.variant, product.variant);
    }
    assert.equal(
      new Set([mapping.primarySourceId, ...mapping.gallerySourceIds]).size,
      1 + mapping.gallerySourceIds.length,
    );
    for (const id of mapping.gallerySourceIds)
      assert.equal(
        official.assets.find((a) => a.sourceId === id)?.variant,
        product.variant,
      );
  }
  for (const asset of official.assets) {
    assert.equal(asset.derivatives.length, 6);
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
