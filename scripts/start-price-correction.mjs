import { spawnSync } from "node:child_process";
// Explicit one-release gate: the corrected catalog is ready before HTTP starts.
// No full import, provider calls, automatic historic reconciliation or price rollback.
if (process.env.PAN_PRICE_CORRECTION_20261013 === "true") {
  const result = spawnSync(
    process.execPath,
    ["dist/node/update-pan-prices.js", "apply-oct13"],
    { stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await import("../dist/node/server.mjs");
