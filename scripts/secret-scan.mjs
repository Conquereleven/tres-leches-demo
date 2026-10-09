import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
// Local heuristic scan, not a claim of credential revocation or an external security assessment.
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const signatures = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b/,
  /\bsk_live_[A-Za-z0-9]{20,}\b/,
  /\bEAA[A-Za-z0-9]{70,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
];
let findings = 0;
for (const file of files) {
  if (
    !existsSync(file) ||
    statSync(file).size > 2_000_000 ||
    !/\.(?:ts|tsx|js|mjs|json|md|env|example|yml|yaml)$/.test(file)
  )
    continue;
  const source = readFileSync(file, "utf8");
  if (signatures.some((pattern) => pattern.test(source))) {
    console.error("Potential credential pattern in " + file);
    findings++;
  }
}
const assets = "dist/client/assets";
if (existsSync(assets))
  for (const file of readdirSync(assets).filter((f) => f.endsWith(".js"))) {
    const source = readFileSync(join(assets, file), "utf8");
    if (
      /AI_API_KEY|META_ACCESS_TOKEN|META_APP_SECRET|PAYMENNT_API_SECRET|PAYMENNT_WEBHOOK_SECRET_FILE|X-Paymennt-Api-Secret/.test(
        source,
      )
    ) {
      console.error(
        "Server credential configuration leaked into frontend bundle",
      );
      findings++;
    }
  }
console.log(
  JSON.stringify({
    scanned: files.length,
    findings,
    scope: "tracked/unignored source plus client bundle; heuristic",
  }),
);
process.exitCode = findings ? 1 : 0;
