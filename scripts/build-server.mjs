import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
await build({
  entryPoints: ["server/http.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  target: "node22",
  outfile: "dist/node/server.mjs",
});
mkdirSync("dist/node", { recursive: true });
copyFileSync("server/db/schema.sql", "dist/node/schema.sql");
