import test from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import official from "../../src/brand/official-pan-media.json";
import { storefrontProducts, productFamily } from "../../src/brand/menu";
import { selectedProductMedia } from "../../src/brand/media";

test("official shoot is fully inventoried and unconfirmed images stay unpublished", () => {
  assert.equal(official.inventory.length, 50);
  assert.equal(official.inventory.filter((p) => p.cutout).length, 23);
  assert.equal(
    official.inventory.filter((p) => p.status === "review-required").length,
    42,
  );
  assert.equal(official.assets.length, 8);
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
