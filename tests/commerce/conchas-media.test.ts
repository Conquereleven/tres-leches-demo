import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import index from "../../docs/brand/conchas-approved/image-index.json";
import {
  selectedProductMedia,
  productMediaAssignments,
} from "../../src/brand/media";
import { localizedSource } from "../../src/brand/locales/engine";
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
test("only chocolate receives the digital art; filled pistache and packs keep existing assets", () => {
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
  assert.equal(
    productMediaAssignments.filter((p) =>
      p.primarySourceId?.startsWith("3l-ai-concha"),
    ).length,
    1,
  );
  for (const a of index.filter((x) => !x.productId)) {
    assert.ok(!existsSync("public/brand/approved/" + a.source));
    assert.ok(a.derivatives.every((d) => !d.file.startsWith("public/")));
  }
});
test("digital artwork label and descriptive alt are translated in every locale", () => {
  for (const locale of ["en", "es", "ar"] as const)
    for (const text of [
      "Digital illustration",
      "Digital illustration of a traditional chocolate concha on a wooden board",
    ] as const) {
      const translated = localizedSource(text, locale);
      assert.notEqual(translated, "Translation pending");
      assert.notEqual(translated, "Traducción pendiente");
      assert.notEqual(translated, "الترجمة قيد الإعداد");
      if (locale !== "en") assert.notEqual(translated, text);
    }
});
