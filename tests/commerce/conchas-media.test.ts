import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import index from "../../docs/brand/conchas-approved/image-index.json";
import {
  selectedProductMedia,
  productMediaAssignments,
  categoryEditorialMedia,
  usesMenuReferencePresentation,
} from "../../src/brand/media";

test("approved original bytes and responsive derivatives retain source hashes", () => {
  for (const asset of index) {
    const source = readFileSync(
      "docs/brand/conchas-approved/originals/" + asset.source,
    );
    assert.equal(
      createHash("sha256").update(source).digest("hex"),
      asset.sha256,
    );
    for (const d of asset.derivatives) {
      const bytes = readFileSync(d.file);
      assert.equal(bytes.length, d.bytes);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), d.sha256);
      assert.equal(d.width, d.height);
    }
  }
});
test("each traditional Concha receives exact approved artwork, filled pistache and packs unchanged", () => {
  const chocolate = selectedProductMedia(
    "conchas-traditional--chocolate",
    "conchas-traditional",
    "Chocolate",
  );
  assert.equal(
    chocolate?.sourceId,
    "3l-ai-concha-traditional-chocolate-20261010",
  );
  assert.ok(
    chocolate &&
      "mediaKind" in chocolate &&
      chocolate.mediaKind === "digital-illustration",
  );
  for (const [id, family, variant] of [
    ["conchas-filled--pistache", "conchas-filled", "Pistache"],
    ["conchas-traditional-pack", "conchas-traditional-pack", ""],
    ["conchas-filled-pack", "conchas-filled-pack", ""],
  ] as const) {
    assert.ok(
      !selectedProductMedia(id, family, variant)?.sourceId.startsWith(
        "3l-ai-concha",
      ),
    );
  }
  for (const [slug, label, source] of [
    ["vainilla", "Vainilla", "3l-conchas-editorial-concha-tradicional-vainilla"],
    ["pistache", "Pistache", "3l-conchas-editorial-concha-tradicional-pistache"],
    ["tricolor", "Tricolor", "3l-conchas-editorial-concha-tradicional-tricolor-mexico"],
  ] as const) assert.equal(selectedProductMedia(`conchas-traditional--${slug}`, "conchas-traditional", label)?.sourceId, source);
  assert.equal(productMediaAssignments.filter((p) => p.productId.startsWith("conchas-traditional--") && p.primarySourceId).length, 4);
  for (const a of index.filter((x) => !x.productId)) {
    assert.ok(!existsSync("public/brand/approved/" + a.source));
    assert.ok(a.derivatives.every((d) => !d.file.startsWith("public/")));
  }
});
test("Conchas uses the menu reference pipeline with four category-only frames", () => {
  const frames = categoryEditorialMedia("conchas");
  assert.equal(frames.length, 4);
  assert.ok(frames.every(usesMenuReferencePresentation));
  for (const asset of frames) {
    for (const d of asset.derivatives) {
      assert.equal(readFileSync("public" + d.src).length, d.bytes);
    }
    assert.ok(productMediaAssignments.some(p => p.primarySourceId === asset.sourceId));
  }
  assert.equal(categoryEditorialMedia("pan").length, 4);
  assert.equal(categoryEditorialMedia("cakes").length, 0);
});
