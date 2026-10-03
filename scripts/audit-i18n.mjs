/** Release gate: every canonical copy key must exist in all customer locales. */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve("src/brand/locales");
const index = JSON.parse(
  readFileSync(resolve(root, "source-index.json"), "utf8"),
);
const report = {};
for (const locale of ["en", "es", "ar"]) {
  const bundles = Object.fromEntries(
    readdirSync(resolve(root, locale))
      .filter((f) => f.endsWith(".json"))
      .map((file) => [
        file.slice(0, -5),
        JSON.parse(readFileSync(resolve(root, locale, file), "utf8")),
      ]),
  );
  const missing = [],
    invalidInterpolation = [];
  for (const [source, fullKey] of Object.entries(index)) {
    const [ns, key] = fullKey.split(":");
    const value = bundles[ns]?.[key];
    if (typeof value !== "string") {
      missing.push(fullKey);
      continue;
    }
    const tokens = (s) =>
      [...new Set([...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]))]
        .sort()
        .join(",");
    if (tokens(source) !== tokens(value)) invalidInterpolation.push(fullKey);
  }
  report[locale] = {
    total: Object.keys(index).length,
    translated: Object.keys(index).length - missing.length,
    missing,
    invalidInterpolation,
  };
}
console.log(JSON.stringify(report, null, 2));
if (
  Object.values(report).some(
    (r) => r.missing.length || r.invalidInterpolation.length,
  )
)
  process.exitCode = 1;
