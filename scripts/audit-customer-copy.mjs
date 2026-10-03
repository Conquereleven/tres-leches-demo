import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const root = "src/brand";
const index = JSON.parse(
  readFileSync(join(root, "locales/source-index.json"), "utf8"),
);
const known = new Set(
  Object.keys(index).map((s) =>
    s.replace(/\s+/g, " ").trim().toLocaleLowerCase("en"),
  ),
);
const excludedFiles = {
  "PaymentFrame.tsx":
    "Inactive historical Drop-In adapter; not part of current hosted customer journey",
  "localization.tsx":
    "Locale engine/navigation source dictionaries and intentional EN/ES/العربية labels",
  "menu.ts":
    "Canonical catalog identifiers and presentation composition; catalog labels separately covered",
  "cart.ts": "Locale-independent state/config transport",
  "business.ts":
    "Canonical merchant/legal/contact/community data, audited separately",
  "content.ts":
    "Canonical media/data boundary; visible strings tested in browser",
  "useEditorialMotion.ts": "Motion selectors and event names",
  "useReveal.ts": "Motion selectors and event names",
};
const unresolved = [];
let checked = 0;
const technicalNames = new Set([
  "className",
  "id",
  "href",
  "src",
  "srcSet",
  "sizes",
  "rel",
  "autoComplete",
  "name",
  "type",
  "role",
  "value",
  "key",
  "media",
  "family",
  "variant",
  "data-testid",
]);
for (const file of readdirSync(root).filter(
  (f) => /\.tsx?$/.test(f) && !excludedFiles[f],
)) {
  const ast = ts.createSourceFile(
    file,
    readFileSync(join(root, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const add = (value, n) => {
    value = value.replace(/\s+/g, " ").trim();
    if (!/[a-z][a-z]+ [a-z]/i.test(value)) return;
    let p = n;
    while (p && !ts.isJsxElement(p)) {
      if (ts.isJsxAttribute(p) && technicalNames.has(p.name.getText(ast)))
        return;
      p = p.parent;
    }
    if (
      /^[#.\/]|\bb-|\bco-|\bref-|https?:|\.(webp|avif|mp4)|^--|^AD AE AF|^\(max-width|^data-|^auto|^billing |^\{0\}-|^noopener noreferrer$/.test(
        value,
      )
    )
      return;
    checked++;
    // Stored state is a domain identifier, distinct from the customer timeline label.
    if (file === "checkout-states.ts" && value === "Out for Delivery") return;
    if (!known.has(value.toLocaleLowerCase("en")))
      unresolved.push({
        file,
        line: ast.getLineAndCharacterOfPosition(n.getStart()).line + 1,
        value,
      });
  };
  const visit = (n) => {
    if (ts.isStringLiteral(n)) add(n.text, n);
    if (ts.isTemplateExpression(n)) {
      let value = n.head.text;
      n.templateSpans.forEach(
        (span, i) => (value += "{" + i + "}" + span.literal.text),
      );
      add(value, n);
    }
    if (ts.isJsxText(n) && n.text.trim()) {
      const parent = n.parent;
      const tag = ts.isJsxElement(parent)
        ? parent.openingElement.tagName.getText(ast)
        : "";
      if (tag !== "CustomerCopy" && /[A-Za-z]/.test(n.text))
        unresolved.push({
          file,
          line: ast.getLineAndCharacterOfPosition(n.getStart()).line + 1,
          value: n.text.trim(),
          reason: "Unlocalized JSX text",
        });
    }
    ts.forEachChild(n, visit);
  };
  visit(ast);
}
console.log(
  JSON.stringify(
    {
      checked,
      unexplained: unresolved.length,
      unresolved,
      explicitScopeExceptions: excludedFiles,
    },
    null,
    2,
  ),
);
if (unresolved.length) process.exitCode = 1;
