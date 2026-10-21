import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import selection from "../../docs/media/3l-media-002/selection.json";
import uploads from "../../docs/media/3l-media-002/hub-uploads.json";
import plan from "../../docs/media/3l-media-002/publication-plan.json";
import {
  categoryEditorialMedia,
  selectedMedia,
  usesMenuReferencePresentation,
} from "../../src/brand/media";
import { storefrontProducts } from "../../src/brand/menu";
import {
  inspectImage,
  MAX_UPLOAD_BYTES,
} from "../../server/catalog/product-hub";

const metadataFree = (bytes: Buffer) =>
  !/Exif|EXIF|XMP |GPS/.test(bytes.toString("latin1"));

test("category galleries keep their approved opening frames and add only the reviewed photographs", () => {
  const ids = (c: string) => categoryEditorialMedia(c).map((a) => a.sourceId);
  for (const [category, retained, added] of [
    ["pan", 4, 3],
    ["conchas", 2, 3],
    ["bakery", 0, 2],
  ] as const) {
    const gallery = categoryEditorialMedia(category);
    assert.equal(gallery.length, retained + added, category);
    assert.ok(
      ids(category)
        .slice(0, retained)
        .every((id) => !id.startsWith("3l-media-002-")),
    );
    const expected = selection
      .filter((s) => s.kind === "editorial" && s.target === category)
      .map((s) => `3l-media-002-${category}-${s.assetId.toLowerCase()}`);
    assert.deepEqual(ids(category).slice(retained), expected);
    for (const asset of gallery.slice(retained)) {
      // A category frame is never resolvable as a product, flavour or pack image.
      assert.equal(asset.family, null);
      assert.ok(usesMenuReferencePresentation(asset));
      // Whole-pixel crops: 3:2 within rounding.
      assert.ok(Math.abs(asset.width! / asset.height! - 1.5) < 0.005);
      for (const d of asset.derivatives) {
        const bytes = readFileSync("public" + d.src);
        assert.equal(bytes.length, d.bytes);
        assert.ok(Math.abs(d.width / d.height - 1.5) < 0.005);
        assert.ok(metadataFree(bytes), d.src);
      }
    }
  }
  assert.deepEqual(categoryEditorialMedia("cakes"), []);
  // The withdrawn Conchas frame stays withdrawn.
  assert.ok(
    !ids("conchas").some((id) => id.includes("pistache_sobre_tabla_de_madera")),
  );
  assert.equal(selectedMedia("bakery", ""), undefined);
});

test("Product Hub uploads are the reviewed 1200 px photographs, hashed and metadata-free", () => {
  for (const upload of uploads) {
    const bytes = readFileSync("docs/media/3l-media-002/" + upload.file);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      upload.sha256,
    );
    assert.ok(bytes.length <= MAX_UPLOAD_BYTES);
    assert.deepEqual(inspectImage(bytes), {
      ...inspectImage(bytes),
      type: "image/webp",
      width: 1200,
      height: 1200,
    });
    assert.ok(metadataFree(bytes), upload.file);
  }
});

test("publication plan targets only live products, one primary first, and leaves unmatched photos out", () => {
  const live = new Set(storefrontProducts.map((p) => p.id));
  const planned = plan.products.map((p) => p.productId);
  assert.deepEqual(
    [...new Set(uploads.map((u) => u.productId))].sort(),
    [...planned].sort(),
  );
  for (const item of plan.products) {
    assert.ok(live.has(item.productId), item.productId);
    assert.equal(item.uploads[0]!.role, "primary");
    assert.ok(item.uploads.slice(1).every((u) => u.role === "gallery"));
    // Every current image is kept after the new photographs for rollback.
    assert.deepEqual(
      [...item.retainPrevious].sort(),
      item.before.map((b) => b.assetId).sort(),
    );
  }
  // Flagged for approval or without a sellable product: never staged.
  for (const id of [
    "conchas-traditional--tricolor",
    "conchas-tricolor-pack",
    "conchas-traditional-pack",
  ])
    assert.ok(!planned.includes(id));
  const used = new Set(selection.map((s) => s.source.split("/")[0]));
  assert.ok(!used.has("MANTECADAS"));
  assert.ok(
    !selection.some(
      (s) => s.kind === "product" && s.source.startsWith("CONCHAS COLORES/"),
    ),
  );
});
