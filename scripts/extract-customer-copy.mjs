/** Translation inventory. No translations are generated; existing reviewed entries are preserved. */
import ts from "typescript";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../src/brand/", import.meta.url));
const target = join(root, "locales/customer-copy.json");
const existing = existsSync(target)
  ? JSON.parse(readFileSync(target, "utf8"))
  : {};
const entries = new Map();
for (const file of readdirSync(root).filter(
  (f) => f.endsWith(".tsx") && f !== "PaymentFrame.tsx",
)) {
  const source = readFileSync(join(root, file), "utf8");
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function add(value, pos) {
    value = value.replace(/\s+/g, " ").trim();
    if (value.length < 2 || !/[A-Za-z]/.test(value)) return;
    const entry = entries.get(value) || {
      english: value,
      arabic: existing[value]?.arabic ?? null,
      review: existing[value]?.arabic
        ? "Approved translation"
        : "Arabic approval required",
      sources: [],
    };
    entry.sources.push(
      file + ":" + (ast.getLineAndCharacterOfPosition(pos).line + 1),
    );
    entries.set(value, entry);
  }
  function expressions(n) {
    if (ts.isTemplateExpression(n)) {
      let value = n.head.text;
      n.templateSpans.forEach(
        (span, index) => (value += "{" + index + "}" + span.literal.text),
      );
      add(value, n.pos);
    }
    if (
      ts.isStringLiteral(n) &&
      (/\s/.test(n.text) || /^[A-Z][a-z]+$/.test(n.text)) &&
      !/[{}]|https?:|\/api\/|^b-|^co-/.test(n.text)
    )
      add(n.text, n.pos);
    ts.forEachChild(n, expressions);
  }
  function visit(n) {
    if (ts.isJsxText(n)) add(n.text, n.pos);
    if (
      ts.isJsxAttribute(n) &&
      n.initializer &&
      ts.isStringLiteral(n.initializer) &&
      ["label", "title", "placeholder", "aria-label", "alt"].includes(
        n.name.getText(ast),
      )
    )
      add(n.initializer.text, n.pos);
    if (ts.isJsxExpression(n) && n.parent && ts.isJsxElement(n.parent))
      expressions(n);
    ts.forEachChild(n, visit);
  }
  visit(ast);
}
// Catalog names/options remain a single source; translators receive a keyed inventory, never another catalog.
const menu = JSON.parse(readFileSync(join(root, "menu-data.json"), "utf8"));
function catalog(value, key) {
  if (Array.isArray(value)) value.forEach((v, i) => catalog(v, key + "." + i));
  else if (value && typeof value === "object")
    Object.entries(value).forEach(([k, v]) => {
      if (
        typeof v === "string" &&
        [
          "name",
          "description",
          "variant",
          "size",
          "label",
          "advanceOrder",
        ].includes(k)
      ) {
        const entry = entries.get(v) || {
          english: v,
          arabic: existing[v]?.arabic ?? null,
          review: "Arabic approval required",
          sources: [],
        };
        entry.sources.push("menu-data.json:" + key + "." + k);
        entries.set(v, entry);
      } else catalog(v, key + "." + k);
    });
}
catalog(menu, "catalog");
mkdirSync(join(root, "locales"), { recursive: true });
writeFileSync(
  target,
  JSON.stringify(Object.fromEntries([...entries.entries()].sort()), null, 2) +
    "\n",
);
console.log(
  `Customer translation inventory: ${entries.size} entries; no translations generated.`,
);
