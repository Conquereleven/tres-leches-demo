import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
let revision = process.env.BUILD_SOURCE_SHA;
if (!revision) {
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    revision = "unknown";
  }
}
if (revision !== "unknown" && !/^[a-f0-9]{40}$/.test(revision))
  throw new Error("Invalid build source revision");
await build({
  define: { "process.env.BUILD_SOURCE_SHA": JSON.stringify(revision) },
  entryPoints: ["server/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  target: "node22",
  outfile: "dist/node/server.mjs",
});
mkdirSync("dist/node", { recursive: true });
copyFileSync("server/db/schema.sql", "dist/node/schema.sql");

await build({
  entryPoints: [
    "scripts/catalog-import.ts",
    "scripts/register-paymennt-webhook.ts",
    "scripts/send-test-email.ts",
    "scripts/update-pan-prices.ts",
    "scripts/activate-conchas.ts",
    "scripts/catalog-foundation.ts",
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  target: "node22",
  outdir: "dist/node",
});
