// Render approved storefront content into the static shell; interactions progressively enhance it.
// Also writes each public page's search metadata, robots.txt and sitemap.xml (shared/seo.ts).
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
mkdirSync("work/brand", { recursive: true });
await build({
  stdin: {
    contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {StorefrontCheckoutFrame, VisualV32} from './src/brand/visual-v32/VisualV32'; import {LocalizationProvider} from './src/brand/localization'; import {pages} from './src/brand/Policies'; import {pendingBusinessFacts} from './src/brand/business'; import {seoPages, siteName, socialImage, storefrontLabels, storefrontMetadata} from './src/seo/pages';
export * from './shared/seo';
export {seoPages, siteName, socialImage, storefrontLabels, storefrontMetadata, pages as policyMeta};
export const renderPage = (pathname, language) => renderToStaticMarkup(
  <LocalizationProvider prerenderLocale={language}><VisualV32 pathname={pathname} staticPage /></LocalizationProvider>);
export const renderCheckout = (language) => renderToStaticMarkup(
  <LocalizationProvider prerenderLocale={language}><StorefrontCheckoutFrame /></LocalizationProvider>);
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
  renderCheckout,
  pending,
  policyMeta,
  seoPages,
  siteName,
  socialImage,
  storefrontLabels,
  storefrontMetadata,
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
const withBody = (html, body) =>
  html.replace('<div id="root"></div>', () => `<div id="root">${body}</div>`);
const site = { origin: SITE_ORIGIN, name: siteName, image: socialImage };
function shellFor(language) {
  if (language === "en") return shell;
  return shell
    .replace('<html lang="en">', `<html lang="${language}" dir="${language === "ar" ? "rtl" : "ltr"}">`)
    .replace(/Enable JavaScript for interactive selections\.[\s\S]*?on WhatsApp at \+971 58 594 3319\./,
      () => storefrontLabels[language].javascript);
}
function siteFor(language) {
  return { ...site, image: { ...site.image, alt: storefrontLabels[language].wordmark } };
}
// Transactions and product pages share the same first-paint navigation.
writeFileSync("dist/client/app-shell.html", shell);
for (const language of ["en", "ar", "es"]) {
  const directory = language === "en" ? "dist/client" : `dist/client/.localized/${language}`;
  mkdirSync(directory, { recursive: true });
  const localizedShell = shellFor(language);
  writeFileSync(`${directory}/product-shell.html`, withBody(localizedShell, renderPage("/menu/product", language)));
  for (const [route, name, body] of [
    ["/cart", "cart-shell", renderPage("/cart", language)],
    ["/checkout", "checkout-shell", renderCheckout(language)],
    ["/checkout/return", "checkout-return-shell", renderCheckout(language)],
  ]) {
    const meta = { path: route, ...storefrontMetadata(route, language, policyMeta) };
    const html = applyHead(localizedShell, headTags(meta, siteFor(language), language));
    writeFileSync(`${directory}/${name}.html`, withBody(html, body));
  }
}
writeFileSync(
  "dist/client/operations-shell.html",
  shell
    .replace(/<title>[^<]*<\/title>/, "<title>3L · Operations</title>")
    .replace(/<noscript[\s\S]*?<\/noscript>/, "")
    .replace(
      "</head>",
      '<meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/operations-entry.css"></head>',
    )
    .replace(
      '<div id="root"></div>',
      '<div id="root"><main class="operations-entry" aria-busy="true"><span role="status">Loading 3L Operations…</span></main></div>',
    ),
);
const pages = seoPages(SITE_ORIGIN, shellMeta(shell), policyMeta);
// Every public page: same shell and bundle, own head and own content.
for (const page of pages) {
  const body = renderPage(page.path, "en");
  writeFileSync(
    page.path === "/" ? path : `dist/client${page.path}.html`,
    withBody(applyHead(shell, headTags(page, site)), body),
  );
}
for (const language of ["ar", "es"]) {
  for (const page of seoPages(SITE_ORIGIN, shellMeta(shell), policyMeta, language)) {
    const name = page.path === "/" ? "index" : page.path.slice(1);
    writeFileSync(
      `dist/client/.localized/${language}/${name}.html`,
      withBody(applyHead(shellFor(language), headTags(page, siteFor(language), language)), renderPage(page.path, language)),
    );
  }
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
