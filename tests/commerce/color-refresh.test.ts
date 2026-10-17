import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const baseline = "5d47c9d09b629bec73d47b34026848ca9ccca72a";
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
  for (const f of css) {
    const previous = old(f).replace(
      "margin: 0 auto 40px; overflow: hidden; background: #f6efe3;",
      "margin: 0 auto 40px; overflow: hidden; border-radius: var(--radius-panel); background: #f6efe3;",
    );
    assert.deepEqual(geometry(readFileSync(f, "utf8")), geometry(previous), f);
  }
});
test("global theme stays byte-identical; Operations preserves geometry except approved OPS-006 mobile hardening", () => {
  assert.equal(readFileSync("src/styles.css", "utf8"), old("src/styles.css"));
  // Preserve the original geometry guard. OPS-006 explicitly authorizes only
  // these touch/viewport adjustments; unrelated layout changes still fail.
  const shell = "src/commerce/operations-shell.css";
  let approved = old(shell);
  const adjustments = [
    ["  min-height: 100dvh;", "  min-height: 100vh;\n  min-height: 100dvh;"],
    [
      "  height: 100dvh;",
      "  height: 100vh;\n  height: 100dvh;\n  overflow-y: auto;\n  overscroll-behavior: contain;",
    ],
    [
      "  padding: 25px 16px 16px;",
      "  padding: calc(25px + env(safe-area-inset-top, 0px)) 16px\n    calc(16px + env(safe-area-inset-bottom, 0px));",
    ],
    ["    min-width: 38px;", "    min-width: 44px;"],
    [
      "    height: 58px;\n    padding: 0 14px;",
      "    min-height: 58px;\n    height: auto;\n    padding: env(safe-area-inset-top, 0px)\n      max(14px, env(safe-area-inset-right, 0px)) 0\n      max(14px, env(safe-area-inset-left, 0px));",
    ],
    [
      "    padding: 24px 16px;",
      "    padding: 24px max(16px, env(safe-area-inset-right, 0px))\n      max(24px, env(safe-area-inset-bottom, 0px))\n      max(16px, env(safe-area-inset-left, 0px));",
    ],
    [
      ".commerce.ops-shell button {\n  min-height: 44px;\n}",
      ".commerce.ops-shell button {\n  min-height: 44px;\n  min-width: 44px;\n}\n@media (max-width: 767px) {\n  .commerce.ops-shell input,\n  .commerce.ops-shell select,\n  .commerce.ops-shell textarea {\n    font-size: 16px;\n  }\n}",
    ],
  ] as const;
  for (const [before, after] of adjustments) {
    assert.ok(
      approved.includes(before),
      `Missing geometry baseline: ${before}`,
    );
    approved = approved.replace(before, after);
  }
  assert.deepEqual(geometry(readFileSync(shell, "utf8")), geometry(approved));
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
