import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const baseline = "e2a82387549d5861e110178d6b9c8b8ae7f84f10";
const css = ["brand", "storefront", "checkout"].map(
  (n) => `src/brand/${n}.css`,
);
const old = (path: string) =>
  execFileSync("git", ["show", `${baseline}:${path}`], { encoding: "utf8" });
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
function geometry(s: string) {
  return [...stripComments(s).matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)]
    .filter(
      ([, p]) =>
        !p!.startsWith("--") &&
        !/^(color|background.*|border(?:-(?:top|bottom|left|right|inline-start|inline-end|block|inline))?(?:-color)?|box-shadow|text-shadow|outline(?:-color)?|text-decoration-color|accent-color|fill|stroke)$/.test(
          p!,
        ),
    )
    .map(([, p, v]) => [p, v!.trim()]);
}
test("public colour refresh preserves geometry, typography, motion and media CSS declarations", () => {
  for (const f of css)
    assert.deepEqual(geometry(readFileSync(f, "utf8")), geometry(old(f)), f);
});
test("operations and global theme stay byte-identical to the verified baseline", () => {
  for (const f of ["src/styles.css", "src/commerce/operations-shell.css"])
    assert.equal(readFileSync(f, "utf8"), old(f));
});
test("public colour literals remove legacy brown/cream UI and preserve semantic statuses", () => {
  const s = css.map((f) => readFileSync(f, "utf8")).join("\n");
  assert.ok(s.includes(".brand-experience,\n.b-modal,\n.b-return"));
  assert.doesNotMatch(
    s,
    /#(?:fbf7ef|f8f4ed|fffdf8|f6efe3|33241a|372c27|2b1b16|805b36)\b/i,
  );
  assert.ok(s.includes("--surface-primary: var(--v2-blush)"));
  assert.ok(s.includes("--surface-paper: var(--v2-white)"));
  assert.ok(s.includes("--co-danger: #8a3b3b"));
  assert.ok(s.includes("--co-success: #5b6e4a"));
});
