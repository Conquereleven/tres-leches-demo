import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import index from "../../docs/brand/conchas-approved/image-index.json";
import {
  selectedProductMedia,
  approvedMedia,
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
test("each traditional Concha retains exact approved artwork alongside the final batch", () => {
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
    [
      "vainilla",
      "Vainilla",
      "3l-conchas-editorial-concha-tradicional-vainilla",
    ],
    [
      "pistache",
      "Pistache",
      "3l-conchas-editorial-concha-tradicional-pistache",
    ],
    [
      "tricolor",
      "Tricolor",
      "3l-conchas-editorial-concha-tradicional-tricolor-mexico",
    ],
  ] as const)
    assert.equal(
      selectedProductMedia(
        `conchas-traditional--${slug}`,
        "conchas-traditional",
        label,
      )?.sourceId,
      slug === "tricolor" ? undefined : source,
    );
  assert.equal(
    productMediaAssignments.filter(
      (p) =>
        p.productId.startsWith("conchas-traditional--") && p.primarySourceId,
    ).length,
    3,
  );
  for (const a of index.filter((x) => !x.productId)) {
    assert.ok(!existsSync("public/brand/approved/" + a.source));
    assert.ok(a.derivatives.every((d) => !d.file.startsWith("public/")));
  }
});
test("Conchas opens with the three approved final batch frames", () => {
  const frames = categoryEditorialMedia("conchas");
  assert.equal(frames.length, 3);
  assert.ok(frames.every(usesMenuReferencePresentation));
  for (const asset of frames) {
    for (const d of asset.derivatives) {
      assert.equal(readFileSync("public" + d.src).length, d.bytes);
    }
    assert.ok(asset.sourceId.endsWith("-opening-horizontal"));
    assert.equal(asset.width! / asset.height!, 4 / 3);
    assert.ok(asset.derivatives.every((d) => !d.src.includes("-square-v2-")));
    assert.ok(
      !productMediaAssignments.some(
        (p) => p.primarySourceId === asset.sourceId,
      ),
    );
  }
  assert.equal(categoryEditorialMedia("pan").length, 4);
  assert.equal(categoryEditorialMedia("cakes").length, 0);
});

test("final batch maps filled Pistache and both packs exactly, retaining original and derivative bytes", async () => {
  const { default: batch } =
    await import("../../docs/brand/conchas-final-approved/image-index.json");
  for (const item of batch) {
    assert.equal(
      createHash("sha256")
        .update(
          readFileSync(
            `docs/brand/conchas-final-approved/originals/${item.source}`,
          ),
        )
        .digest("hex"),
      item.sha256,
    );
    const assignment = productMediaAssignments.find(
      (p) => p.productId === item.productId,
    );
    assert.equal(assignment?.primarySourceId, item.sourceId);
    const asset = approvedMedia.find((a) => a.sourceId === item.sourceId);
    assert.ok(asset);
    assert.ok(asset.width && asset.height);
    assert.equal(asset.width, 1254);
    assert.equal(asset.height, 1254);
    for (const d of item.derivatives) {
      const data = readFileSync("public" + d.src);
      assert.equal(data.length, d.bytes);
      assert.equal(createHash("sha256").update(data).digest("hex"), d.sha256);
      assert.equal(d.width, d.height);
      assert.ok(d.src.includes("-square-v2-"));
    }
  }
});

test("all seven Conchas reuse the Pan presentation without a separate frame system", () => {
  const products = [
    ["conchas-traditional--chocolate", "conchas-traditional", "Chocolate"],
    ["conchas-traditional--vainilla", "conchas-traditional", "Vainilla"],
    ["conchas-traditional--pistache", "conchas-traditional", "Pistache"],
    ["conchas-traditional--tricolor", "conchas-traditional", "Tricolor"],
    ["conchas-filled--pistache", "conchas-filled", "Pistache"],
    ["conchas-traditional-pack", "conchas-traditional-pack", ""],
    ["conchas-filled-pack", "conchas-filled-pack", ""],
  ];
  for (const [id, family, variant] of products) {
    const asset = selectedProductMedia(id, family!, variant!);
    if (id === "conchas-traditional--tricolor") { assert.equal(asset, undefined); continue; }
    assert.ok(asset);
    assert.ok(usesMenuReferencePresentation(asset));
  }
  assert.equal(
    usesMenuReferencePresentation(categoryEditorialMedia("pan")[0]),
    true,
  );
});
