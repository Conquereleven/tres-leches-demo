import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
await build({
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
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  target: "node22",
  outdir: "dist/node",
});
