// Render approved storefront content into the static shell; interactions progressively enhance it.
// Also writes each public page's search metadata, robots.txt and sitemap.xml (shared/seo.ts).
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
mkdirSync("work/brand", { recursive: true });
await build({
  stdin: {
    contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {VisualV32} from './src/brand/visual-v32/VisualV32'; import {LocalizationProvider} from './src/brand/localization'; import {pages} from './src/brand/Policies'; import {pendingBusinessFacts} from './src/brand/business'; import {seoPages, siteName, socialImage} from './src/seo/pages';
export * from './shared/seo';
export {seoPages, siteName, socialImage, pages as policyMeta};
export const renderPage = (pathname) => renderToStaticMarkup(
  <LocalizationProvider><VisualV32 pathname={pathname} staticPage /></LocalizationProvider>);
export const pending = pendingBusinessFacts();`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  jsx: "automatic",
  platform: "node",
  format: "esm",
  packages: "external",
  loader: { ".css": "empty" },
  outfile: "work/brand/prerender.mjs",
});
const {
  renderPage,
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
const fontSheet =
  '<link data-v32-font-sheet="true" rel="stylesheet" referrerpolicy="no-referrer" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&amp;family=Jost:wght@400;500;600&amp;display=swap">';
const withFonts = shell.replace("</head>", () => fontSheet + "</head>");
const withBody = (html, body) =>
  html.replace('<div id="root"></div>', () => `<div id="root">${body}</div>`);
// Cart, checkout and staff routes use the client shell. Product pages get their
// own request-time body from the current catalog rather than bundled prices.
writeFileSync("dist/client/app-shell.html", shell);
writeFileSync(
  "dist/client/product-shell.html",
  withBody(withFonts, renderPage("/menu/product")),
);
const site = { origin: SITE_ORIGIN, name: siteName, image: socialImage };
const pages = seoPages(SITE_ORIGIN, shellMeta(shell), policyMeta);
// Every public page: same shell and bundle, own head and own content.
for (const page of pages) {
  const body = renderPage(page.path);
  writeFileSync(
    page.path === "/" ? path : `dist/client${page.path}.html`,
    withBody(applyHead(withFonts, headTags(page, site)), body),
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
