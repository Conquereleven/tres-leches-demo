// Render approved storefront content into the static shell; interactions progressively enhance it.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
mkdirSync("work/brand", { recursive: true });
await build({
  stdin: {
    contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {BrandExperience} from './src/brand/Experience'; export const html = renderToStaticMarkup(React.createElement(BrandExperience,{onManage:()=>{},onDemo:()=>{}}));`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  loader: { ".css": "empty" },
  outfile: "work/brand/prerender.mjs",
});
const { html } = await import(
  pathToFileURL(resolve("work/brand/prerender.mjs")).href
);
const path = "dist/client/index.html";
const shell = readFileSync(path, "utf8");
if (!shell.includes('<div id="root"></div>'))
  throw new Error("Static storefront root is missing");
writeFileSync(
  path,
  shell.replace('<div id="root"></div>', `<div id="root">${html}</div>`),
);
console.log("Prerendered approved brand content for no-JavaScript access.");
