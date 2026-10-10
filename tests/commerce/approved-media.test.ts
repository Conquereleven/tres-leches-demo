import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import manifest from "../../src/brand/media-manifest.json";
import { menuFamilies } from "../../src/brand/menu";
import { selectedMedia } from "../../src/brand/media";
test("all curated media match actual catalog variants and ship responsive derivatives, never originals", () => {
  assert.equal(manifest.assets.length, 81);
  const assigned = manifest.assets.filter((a) => a.status === "assigned");
  assert.equal(assigned.length, 36);
  for (const a of assigned) {
    const family = menuFamilies.find((f) => f.id === a.family);
    assert.ok(family);
    assert.ok(
      family.options.some(
        (o) => o.variant === a.variant && (!a.size || o.size === a.size),
      ),
    );
    assert.equal(a.derivatives.length, 6);
    for (const d of a.derivatives) {
      assert.ok(existsSync("public" + d.src));
      assert.equal(statSync("public" + d.src).size, d.bytes);
      assert.ok(Math.abs(d.width / d.height - a.width! / a.height!) < 0.01);
    }
  }
  assert.ok(!selectedMedia("tres-leches-premium", "Tiramisu"));
  assert.notEqual(
    selectedMedia("milk", "", "190 ml")?.sourceId,
    selectedMedia("milk", "", "350 ml")?.sourceId,
  );
});
test("browser video derivatives preserve approved duration/aspect while staying far below original weight", () => {
  for (const file of ["packaging-540.mp4", "packaging-720.mp4"])
    assert.ok(
      statSync("public/brand/approved/" + file).size <
        manifest.video.originalBytes * 0.12,
    );
  assert.ok(
    statSync("public/brand/approved/packaging-poster.webp").size < 100000,
  );
  assert.equal(existsSync("public/brand/approved/hero-original.mp4"), false);
});
