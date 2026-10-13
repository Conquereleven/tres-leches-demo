import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NOINDEX,
  SITE_ORIGIN,
  absoluteUrl,
  applyHead,
  headTags,
  isPrivatePath,
  jsonLdScript,
  robotsDirective,
  robotsTxt,
  shellMeta,
  sitemapXml,
  trailingSlashTarget,
} from "../../shared/seo";
import {
  businessJsonLd,
  isoDate,
  seoPages,
  siteName,
  socialImage,
  storePages,
  type PolicyMeta,
} from "../../src/seo/pages";
import { business, policyRoutes } from "../../src/brand/business";
import { destinations } from "../../src/brand/content";
import { pages as policyPages } from "../../src/brand/Policies";
import { immutableAsset, prerenderedPages } from "../../server/http";

const origin = "https://www.seo-fixture.invalid";
const shell = readFileSync("index.html", "utf8");
const home = shellMeta(shell);
const policyMeta: PolicyMeta = policyPages;
const pages = seoPages(origin, home, policyMeta);
const site = { origin, name: siteName, image: socialImage };

test("private routes and non-public deployments are never indexable", () => {
  for (const path of [
    "/operations",
    "/operations/inbox",
    "/operations/orders/TL-1",
    "/cart",
    "/checkout",
    "/checkout/return",
    "/api/health",
  ]) {
    assert.ok(isPrivatePath(path), path);
    for (const env of ["production", "staging", "test"])
      assert.equal(robotsDirective(path, env), NOINDEX, path);
  }
  for (const path of ["/", "/menu", "/how-to-order", "/contact", "/terms"]) {
    assert.equal(isPrivatePath(path), false);
    // Only the validated runtime environment "production" is indexable.
    assert.equal(robotsDirective(path, "production"), null);
    for (const env of ["test", "development", "staging"])
      assert.equal(robotsDirective(path, env), NOINDEX);
  }
  // A public page that merely starts with the same letters is not private.
  assert.equal(isPrivatePath("/cartography"), false);
  assert.equal(isPrivatePath("/operations-guide"), false);
});

test("trailing slashes redirect to one URL and never off-site", () => {
  assert.equal(trailingSlashTarget("/menu/"), "/menu");
  assert.equal(
    trailingSlashTarget("/contact///", "?lang=ar"),
    "/contact?lang=ar",
  );
  for (const path of ["/", "/menu", "/brand/icon.png"])
    assert.equal(trailingSlashTarget(path), null);
  // The API is an exact contract; private pages keep their existing answers.
  for (const path of ["/api/health/", "/operations/inbox/", "/checkout/"])
    assert.equal(trailingSlashTarget(path), null);
  // Protocol-relative or backslash targets would be open redirects.
  for (const path of ["//evil.example/", "//", "///", "/\\evil.example/"])
    assert.equal(trailingSlashTarget(path), null, path);
});

test("every public page has a unique title, description and canonical URL", () => {
  assert.deepEqual(
    pages.map((p) => p.path),
    ["/", "/menu", "/how-to-order", ...policyRoutes.map((r) => r.path)],
  );
  // The server serves a prerendered file for exactly the non-home pages.
  assert.deepEqual(
    [...prerenderedPages].sort(),
    pages
      .map((p) => p.path)
      .filter((p) => p !== "/")
      .sort(),
  );
  for (const field of ["title", "description"] as const)
    assert.equal(new Set(pages.map((p) => p[field])).size, pages.length, field);
  for (const page of pages) {
    assert.ok(page.title.length >= 10 && page.title.length <= 65, page.title);
    assert.ok(
      page.description.length >= 40 && page.description.length <= 160,
      `${page.path}: ${page.description.length}`,
    );
    const doc = applyHead(shell, headTags(page, site));
    assert.equal(doc.match(/<title>/g)!.length, 1);
    assert.equal(doc.match(/name="description"/g)!.length, 1);
    assert.equal(doc.match(/rel="canonical"/g)!.length, 1);
    assert.equal(doc.match(/property="og:title"/g)!.length, 1);
    assert.equal(doc.match(/property="og:description"/g)!.length, 1);
    assert.ok(
      doc.includes(
        `<link rel="canonical" href="${absoluteUrl(origin, page.path)}" />`,
      ),
    );
    assert.ok(
      doc.includes(
        `<meta property="og:url" content="${absoluteUrl(origin, page.path)}" />`,
      ),
    );
    // The page's own description, not the home page's.
    assert.deepEqual(shellMeta(doc), {
      title: page.title,
      description: page.description,
    });
    // Nothing that loads the app is lost.
    for (const kept of [
      '<div id="root"></div>',
      "abril-fatface.woff2",
      "<noscript",
    ])
      assert.ok(doc.includes(kept), kept);
    assert.doesNotMatch(doc, /noindex/);
  }
  assert.equal(absoluteUrl(origin, "/"), `${origin}/`);
  assert.equal(pages[0]!.title, home.title);
  assert.ok(existsSync(`public${socialImage.path}`));
});

test("head values are escaped and JSON-LD cannot close its script element", () => {
  const tags = headTags(
    { path: "/x", title: 'A & "B" <c>', description: "d".repeat(50) },
    site,
  );
  assert.ok(tags.includes("<title>A &amp; &quot;B&quot; &lt;c&gt;</title>"));
  const script = jsonLdScript({ name: "</script><script>alert(1)" });
  assert.equal(script.match(/<\/script>/g)!.length, 1);
  assert.deepEqual(
    JSON.parse(script.replace(/^<script[^>]*>|<\/script>$/g, "")),
    { name: "</script><script>alert(1)" },
  );
  // A `$` in content is literal text, not a replacement pattern.
  assert.ok(
    applyHead(shell, "<title>$& $1</title>").includes("<title>$& $1</title>"),
  );
});

test("business structured data states only verified facts", () => {
  const data = businessJsonLd(origin, home.description) as Record<
    string,
    unknown
  >;
  assert.equal(data["@type"], "Bakery");
  assert.equal(data.name, business.tradingName);
  assert.equal(data.legalName, business.legalName);
  assert.deepEqual(data.address, {
    "@type": "PostalAddress",
    streetAddress:
      "Golositalia JLT, Jumeirah Lakes Towers, Cluster C, Retail Shop C6/A",
    addressLocality: "Dubai",
    addressCountry: "AE",
  });
  // The address is the confirmed one, only split: nothing added.
  assert.equal(
    `${(data.address as { streetAddress: string }).streetAddress}, ${business.city}, ${business.country}`,
    business.address,
  );
  assert.deepEqual(
    (data.contactPoint as { telephone: string }[]).map((c) => c.telephone),
    business.supportContacts.map((c) => c.phone.replace(/\s+/g, "")),
  );
  assert.deepEqual(data.sameAs, [destinations.instagram]);
  // Facts the owner has not supplied, and anything that would need a catalog,
  // must be absent rather than invented.
  const text = JSON.stringify(pages.map((p) => p.jsonLd));
  for (const absent of [
    "openingHours",
    "aggregateRating",
    "review",
    "priceRange",
    "geo",
    "foundingDate",
    '"Product"',
    '"Offer"',
    '"FAQPage"',
    '"@type":"Menu"',
    "price",
  ])
    assert.ok(!text.includes(absent), absent);
  assert.equal(business.supportHours, null);
  assert.equal("email" in data, business.email !== null);
  // Breadcrumbs on every page except home.
  for (const page of pages.slice(1))
    assert.equal(
      (page.jsonLd as { "@type": string }[])[0]!["@type"],
      "BreadcrumbList",
    );
});

test("store page metadata names no product price and matches approved wording", () => {
  for (const page of Object.values(storePages)) {
    assert.doesNotMatch(page.description, /AED|\d(?!L )/);
    assert.ok(page.description.includes(business.tradingName));
  }
  assert.equal(isoDate("22 September 2026"), "2026-09-22");
  assert.equal(isoDate(business.policiesUpdated), "2026-09-22");
  for (const bad of ["September 2026", "32 May 2026", "1 Smarch 2026", ""])
    assert.equal(isoDate(bad), undefined);
});

test("robots.txt allows public crawling and the sitemap lists public pages only", () => {
  const robots = robotsTxt(origin);
  assert.match(robots, /^User-agent: \*\nAllow: \/\n/);
  // Blocking the API would hide the browser-rendered menu from crawlers.
  assert.doesNotMatch(robots, /Disallow/);
  assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
  const xml = sitemapXml(pages, origin);
  assert.deepEqual(
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]),
    pages.map((p) => absoluteUrl(origin, p.path)),
  );
  assert.equal(xml.match(/<lastmod>2026-09-22<\/lastmod>/g)!.length, 5);
  assert.doesNotMatch(xml, /operations|cart|checkout|api|<loc>[^<]*\?/);
  assert.throws(() =>
    sitemapXml([{ path: "/checkout", title: "t", description: "d" }], origin),
  );
});

test("only content-hashed bundles are cached as immutable", () => {
  assert.ok(immutableAsset("/assets/index-NoR7xVQe.js"));
  assert.ok(immutableAsset("/assets/index-CCWL1fKP.css"));
  for (const path of [
    "/assets/pan-de-muerto.webp",
    "/brand/icon.png",
    "/index.html",
    "/assets/x/index-NoR7xVQe.js",
  ])
    assert.equal(immutableAsset(path), false, path);
});

const built = existsSync("dist/client/index.html");
const doc = (file: string) => readFileSync(`dist/client/${file}`, "utf8");
const visible = (html: string) =>
  html
    .replace(/<head>[\s\S]*<\/head>/, "")
    .replace(/<noscript>[\s\S]*<\/noscript>/, "")
    .replace(/<[^>]+>/g, " ");

test(
  "the build writes each page's own head, content, robots.txt and sitemap.xml",
  { skip: !built && "run npm run build first" },
  () => {
    assert.equal(doc("robots.txt"), robotsTxt(SITE_ORIGIN));
    const production = seoPages(SITE_ORIGIN, home, policyMeta);
    assert.equal(doc("sitemap.xml"), sitemapXml(production, SITE_ORIGIN));
    for (const page of production) {
      const html = doc(
        page.path === "/" ? "index.html" : `${page.path.slice(1)}.html`,
      );
      assert.deepEqual(shellMeta(html), {
        title: page.title,
        description: page.description,
      });
      assert.ok(
        html.includes(
          `<link rel="canonical" href="${absoluteUrl(SITE_ORIGIN, page.path)}" />`,
        ),
        page.path,
      );
      assert.equal(html.match(/<h1/g)!.length, 1, page.path);
      assert.match(html, /<html lang="en">/);
    }
    assert.match(doc("index.html"), /"@type":"Bakery"/);
    assert.match(doc("index.html"), /"@type":"WebSite"/);
    // Menu: site chrome and heading only. No product, price or availability
    // is baked into static HTML; the published catalog is the only source.
    const menu = doc("menu.html");
    assert.match(menu, /<h1[^>]*>Menu<\/h1>/);
    assert.doesNotMatch(
      visible(menu),
      /AED|Pan de Muerto|Concha|Tres Leches Cakes/,
    );
    assert.doesNotMatch(menu, /"@type":"(Product|Offer|Bakery)"/);
    // How to order: its own approved steps, not the home page.
    const how = doc("how-to-order.html");
    assert.match(how, /<h1[^>]*>How to order<\/h1>/);
    assert.match(how, /continue to secure Paymennt checkout/);
    assert.doesNotMatch(how, /Soaked in/);
  },
);

const PORT = 3411;
const get = (path: string, method = "GET") =>
  new Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }>((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port: PORT, path, method },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode!, headers: res.headers, body }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });

test(
  "the server serves one URL per page, crawler files and indexing headers",
  { skip: !built && "run npm run build first" },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "seo-"));
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/web-checkout-server.ts"],
      {
        env: {
          ...process.env,
          DB_PATH: join(dir, "store.sqlite"),
          API_PORT: String(PORT),
          PORT: String(PORT),
          APP_ORIGIN: origin,
        },
        stdio: "ignore",
      },
    );
    try {
      for (let i = 0; i < 100; i++) {
        try {
          if ((await get("/api/health")).status === 200) break;
        } catch {
          /* still starting */
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      // Each public page answers with its own document.
      for (const page of seoPages(SITE_ORIGIN, home, policyMeta)) {
        const res = await get(page.path);
        assert.equal(res.status, 200, page.path);
        assert.match(String(res.headers["content-type"]), /^text\/html/);
        assert.deepEqual(shellMeta(res.body).title, page.title);
        assert.equal(
          res.headers["content-security-policy"] !== undefined,
          true,
        );
      }
      // Query strings do not change the document or its canonical URL.
      const filtered = await get("/menu?category=jars&lang=es");
      assert.ok(
        filtered.body.includes(
          `<link rel="canonical" href="${SITE_ORIGIN}/menu" />`,
        ),
      );
      // Trailing slash: one permanent redirect, query kept.
      for (const [from, to] of [
        ["/menu/", "/menu"],
        ["/contact/", "/contact"],
        ["/how-to-order/?lang=ar", "/how-to-order?lang=ar"],
      ] as const) {
        const res = await get(from);
        assert.equal(res.status, 301, from);
        assert.equal(res.headers.location, to);
      }
      // A hostile path is never turned into a redirect.
      assert.equal((await get("//evil.example/")).headers.location, undefined);
      assert.equal((await get("/api/health/")).status, 404);
      // Crawler files.
      const robots = await get("/robots.txt");
      assert.equal(robots.status, 200);
      assert.match(String(robots.headers["content-type"]), /^text\/plain/);
      assert.equal(robots.body, robotsTxt(SITE_ORIGIN));
      const sitemap = await get("/sitemap.xml");
      assert.equal(sitemap.status, 200);
      assert.match(
        String(sitemap.headers["content-type"]),
        /^application\/xml/,
      );
      // Private pages still load the app and are excluded from indexes.
      for (const path of [
        "/operations/inbox",
        "/operations/orders/TL-1",
        "/cart",
        "/checkout",
        "/checkout/return",
      ]) {
        const res = await get(path);
        assert.equal(res.status, 200, path);
        assert.equal(res.headers["x-robots-tag"], NOINDEX, path);
      }
      assert.equal(
        (await get("/api/health")).headers["x-robots-tag"],
        "noindex",
      );
      // Unknown pages are a real 404, never a soft one.
      const missing = await get("/no-such-page");
      assert.equal(missing.status, 404);
      assert.equal(missing.headers["x-robots-tag"], "noindex");
      // This fixture is a test deployment: nothing in it is indexable.
      assert.equal((await get("/")).headers["x-robots-tag"], NOINDEX);
      // Hashed bundles are immutable; pages and brand media are not.
      const bundle = /\/assets\/[^"]+\.js/.exec((await get("/")).body)![0];
      assert.equal(
        (await get(bundle, "HEAD")).headers["cache-control"],
        "public, max-age=31536000, immutable",
      );
      assert.equal((await get("/")).headers["cache-control"], undefined);
      assert.equal(
        (await get("/brand/icon.png", "HEAD")).headers["cache-control"],
        undefined,
      );
    } finally {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
