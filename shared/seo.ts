/**
 * Technical SEO rules shared by the build (prerendered head, robots.txt,
 * sitemap.xml) and the server (indexing headers, trailing-slash redirect).
 * Pure functions, no brand or catalog imports: nothing here knows a product,
 * a price or an availability. See SEO_AEO_FOUNDATION_REPORT.md.
 */

/**
 * Canonical production origin (`APP_ORIGIN` in Production, see
 * docs/order-experience/rc1-release-plan.md). Canonical URLs are baked into
 * the static HTML at build time so that every other host serving the same
 * build (Railway hostname, test deployments) points search engines here.
 */
export const SITE_ORIGIN = "https://www.3ldubai.ae";

/** Routes that must never be indexed: staff workspace, cart, payment, API. */
const PRIVATE_PREFIXES = ["/operations", "/cart", "/checkout", "/api"] as const;

export const isPrivatePath = (path: string) =>
  PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

/** Runtime environments (`runtimeConfig`, reported by /api/health) that are never the public site. */
const NON_PUBLIC_ENVIRONMENTS = new Set(["test", "development", "staging"]);

export const NOINDEX = "noindex, nofollow";

/**
 * `X-Robots-Tag` value for a path, or null when the page may be indexed.
 * Private routes are excluded everywhere; a test, development or staging
 * deployment is excluded as a whole.
 */
export function robotsDirective(
  path: string,
  environment: string,
): string | null {
  if (NON_PUBLIC_ENVIRONMENTS.has(environment)) return NOINDEX;
  return isPrivatePath(path) ? NOINDEX : null;
}

/**
 * Target for a permanent redirect when a page is requested with trailing
 * slashes, or null. Never returns a protocol-relative target and never
 * touches the API, where a path is an exact contract.
 */
export function trailingSlashTarget(path: string, search = ""): string | null {
  if (path.length < 2 || !path.endsWith("/") || isPrivatePath(path))
    return null;
  const target = path.replace(/\/+$/, "");
  if (!/^\/[^/\\]/.test(target)) return null;
  return target + search;
}

export type SeoPage = {
  /** Path without trailing slash; "/" for the home page. */
  path: string;
  title: string;
  description: string;
  /** ISO date (YYYY-MM-DD) only when a real revision date is known. */
  lastmod?: string;
  /** JSON-LD objects describing verified facts for this page. */
  jsonLd?: unknown[];
};

export const absoluteUrl = (origin: string, path: string) =>
  origin.replace(/\/+$/, "") + (path === "/" ? "/" : path);

const attr = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** JSON inside a script element: `<` must not be able to close the element. */
export const jsonLdScript = (value: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;

export type SocialImage = {
  path: string;
  width: number;
  height: number;
  alt: string;
};

/** Title, description, canonical, Open Graph, Twitter card and JSON-LD. */
export function headTags(
  page: SeoPage,
  site: { origin: string; name: string; image: SocialImage },
): string {
  const url = absoluteUrl(site.origin, page.path);
  const image = absoluteUrl(site.origin, site.image.path);
  return [
    `<title>${attr(page.title)}</title>`,
    `<meta name="description" content="${attr(page.description)}" />`,
    `<link rel="canonical" href="${attr(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${attr(site.name)}" />`,
    `<meta property="og:locale" content="en_AE" />`,
    `<meta property="og:url" content="${attr(url)}" />`,
    `<meta property="og:title" content="${attr(page.title)}" />`,
    `<meta property="og:description" content="${attr(page.description)}" />`,
    `<meta property="og:image" content="${attr(image)}" />`,
    `<meta property="og:image:width" content="${site.image.width}" />`,
    `<meta property="og:image:height" content="${site.image.height}" />`,
    `<meta property="og:image:alt" content="${attr(site.image.alt)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${attr(page.title)}" />`,
    `<meta name="twitter:description" content="${attr(page.description)}" />`,
    `<meta name="twitter:image" content="${attr(image)}" />`,
    ...(page.jsonLd ?? []).map(jsonLdScript),
  ].join("\n    ");
}

/**
 * Replaces the shell's own title/description/Open Graph tags with the page's
 * complete head. Tolerates the multi-line formatting of `index.html`.
 */
export function applyHead(shell: string, tags: string): string {
  if (!shell.includes("</head>")) throw new Error("HTML shell has no head");
  const cleaned = shell
    .replace(/[ \t]*<title>[^<]*<\/title>\n?/, "")
    .replace(
      /[ \t]*<meta\s+(?:name="(?:description|twitter:[^"]*)"|property="og:[^"]*")[^>]*>\n?/g,
      "",
    )
    .replace(/[ \t]*<link\s+rel="canonical"[^>]*>\n?/g, "");
  return cleaned.replace(/\s*<\/head>/, () => `\n    ${tags}\n  </head>`);
}

/** Head content of the shell as authored (the home page's approved wording). */
export function shellMeta(shell: string): {
  title: string;
  description: string;
} {
  const decode = (s: string) =>
    s
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  const title = /<title>([^<]*)<\/title>/.exec(shell)?.[1];
  const description = /<meta\s+name="description"\s+content="([^"]*)"/.exec(
    shell,
  )?.[1];
  if (!title || !description)
    throw new Error("HTML shell is missing its title or description");
  return { title: decode(title), description: decode(description) };
}

/**
 * Everything public is crawlable, including `/api/`: the menu is rendered in
 * the browser from `/api/checkout/config`, so blocking the API would hide the
 * menu from crawlers that execute JavaScript. Private pages are excluded with
 * `X-Robots-Tag` (which a crawler can only see if it may fetch the page).
 */
export const robotsTxt = (origin: string) =>
  [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${absoluteUrl(origin, "/sitemap.xml")}`,
    "",
  ].join("\n");

export function sitemapXml(pages: SeoPage[], origin: string): string {
  for (const page of pages)
    if (isPrivatePath(page.path))
      throw new Error(`Private route in sitemap: ${page.path}`);
  const urls = pages.map((page) =>
    [
      "  <url>",
      `    <loc>${attr(absoluteUrl(origin, page.path))}</loc>`,
      ...(page.lastmod ? [`    <lastmod>${page.lastmod}</lastmod>`] : []),
      "  </url>",
    ].join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
