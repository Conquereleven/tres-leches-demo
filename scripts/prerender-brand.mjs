// Render approved storefront content into the static shell; interactions progressively enhance it.
// Also writes each public page's search metadata, robots.txt and sitemap.xml (shared/seo.ts).
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
mkdirSync("work/brand", { recursive: true });
await build({
  stdin: {
    contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {BrandExperience} from './src/brand/Experience'; import {PolicyPage, pages} from './src/brand/Policies'; import {HowToOrder} from './src/brand/StorePages'; import {MenuShell} from './src/seo/MenuShell'; import {pendingBusinessFacts} from './src/brand/business'; import {seoPages, siteName, socialImage} from './src/seo/pages';
export * from './shared/seo';
export {seoPages, siteName, socialImage, pages as policyMeta};
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
export const bodies = {
  '/': render(BrandExperience, {onManage:()=>{},onDemo:()=>{}}),
  '/menu': render(MenuShell),
  '/how-to-order': render(HowToOrder),
  ...Object.fromEntries(Object.keys(pages).map((path) => [path, render(PolicyPage, {path})])),
};
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
const {
  bodies,
  pending,
  policyMeta,
  seoPages,
  siteName,
  socialImage,
  SITE_ORIGIN,
  applyHead,
  headTags,
  shellMeta,
  robotsTxt,
  sitemapXml,
} = await import(pathToFileURL(resolve("work/brand/prerender.mjs")).href);
const path = "dist/client/index.html";
const shell = readFileSync(path, "utf8");
if (!shell.includes('<div id="root"></div>'))
  throw new Error("Static storefront root is missing");
const site = { origin: SITE_ORIGIN, name: siteName, image: socialImage };
const pages = seoPages(SITE_ORIGIN, shellMeta(shell), policyMeta);
// Every public page: same shell and bundle, own head and own content.
for (const page of pages) {
  const body = bodies[page.path];
  if (!body) throw new Error(`No prerendered content for ${page.path}`);
  writeFileSync(
    page.path === "/" ? path : `dist/client${page.path}.html`,
    applyHead(shell, headTags(page, site)).replace(
      '<div id="root"></div>',
      () => `<div id="root">${body}</div>`,
    ),
  );
}
writeFileSync("dist/client/robots.txt", robotsTxt(SITE_ORIGIN));
writeFileSync("dist/client/sitemap.xml", sitemapXml(pages, SITE_ORIGIN));
console.log(
  `Prerendered approved brand content and ${pages.length - 1} customer pages for no-JavaScript access; wrote robots.txt and sitemap.xml for ${SITE_ORIGIN}.`,
);
if (pending.length)
  console.warn(
    `PENDING BUSINESS INFORMATION (src/brand/business.ts): ${pending.join(", ")}`,
  );
