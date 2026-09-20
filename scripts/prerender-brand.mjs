// Render approved storefront content into the static shell; interactions progressively enhance it.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
mkdirSync("work/brand", { recursive: true });
await build({
  stdin: {
    contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {BrandExperience} from './src/brand/Experience'; import {PolicyPage, pages} from './src/brand/Policies'; import {business, pendingBusinessFacts} from './src/brand/business';
export const html = renderToStaticMarkup(React.createElement(BrandExperience,{onManage:()=>{},onDemo:()=>{}}));
export const policyPages = Object.entries(pages).map(([path, page]) => ({ path, title: page.metaTitle + ' — ' + business.tradingName + ' Dubai', description: page.description, html: renderToStaticMarkup(React.createElement(PolicyPage,{path})) }));
export const pending = pendingBusinessFacts();`,
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
const { html, policyPages, pending } = await import(
  pathToFileURL(resolve("work/brand/prerender.mjs")).href
);
const path = "dist/client/index.html";
const shell = readFileSync(path, "utf8");
if (!shell.includes('<div id="root"></div>'))
  throw new Error("Static storefront root is missing");
const escape = (s) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
// Customer policy pages: same shell and bundle, own title/description and content.
for (const page of policyPages) {
  const doc = shell
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(page.title)}</title>`)
    .replace(
      /<meta name="description" content="[^"]*"/,
      `<meta name="description" content="${escape(page.description)}"`,
    )
    .replace(
      /<meta property="og:title" content="[^"]*"/,
      `<meta property="og:title" content="${escape(page.title)}"`,
    )
    .replace('<div id="root"></div>', `<div id="root">${page.html}</div>`);
  writeFileSync(`dist/client${page.path}.html`, doc);
}
writeFileSync(
  path,
  shell.replace('<div id="root"></div>', `<div id="root">${html}</div>`),
);
console.log(
  `Prerendered approved brand content and ${policyPages.length} customer pages for no-JavaScript access.`,
);
if (pending.length)
  console.warn(
    `PENDING BUSINESS INFORMATION (src/brand/business.ts): ${pending.join(", ")}`,
  );
