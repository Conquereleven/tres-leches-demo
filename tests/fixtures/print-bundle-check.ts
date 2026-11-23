/** Verifies bundle-relative asset resolution with the assets emitted by the real build. */
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { orderDocuments } from "../../server/orders/documents";
import { PRINT_AT, printState } from "./print-documents";
const dir = "work/print-bundle-check";
mkdirSync(dir, { recursive: true });
try {
  await build({
    entryPoints: ["server/orders/documents.ts"],
    outfile: `${dir}/documents.mjs`,
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    target: "node22",
  });
  cpSync("dist/node/print-assets", `${dir}/print-assets`, { recursive: true });
  const bundled = await import(
    pathToFileURL(resolve(`${dir}/documents.mjs`)).href
  );
  const state = printState();
  const actor = { id: "fixture-admin", role: "admin" as const };
  for (const kind of [
    "packing-slip",
    "production-bulk",
    "delivery-note",
  ] as const) {
    const source = orderDocuments(state, state.orders, kind, actor, PRINT_AT);
    const compiled = bundled.orderDocuments(
      state,
      state.orders,
      kind,
      actor,
      PRINT_AT,
    );
    assert.ok(source.pdf.equals(compiled.pdf), kind);
  }
  console.log(
    "PASS: bundled module resolves built print assets; PDFs match source bytes for all three kinds",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
