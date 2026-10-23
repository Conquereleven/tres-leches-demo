import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request } from "node:http";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REVALIDATED_CACHE_CONTROL,
  htmlAliasTarget,
  revalidatedAsset,
  weakEtag,
} from "../../shared/seo";
import { prerenderedPages } from "../../server/http";

const built = existsSync("dist/client/index.html");

test(".html aliases point at the one clean URL, for known pages only", () => {
  assert.equal(htmlAliasTarget("/index.html", "", prerenderedPages), "/");
  assert.equal(
    htmlAliasTarget("/terms.html", "?a=1", prerenderedPages),
    "/terms?a=1",
  );
  assert.equal(htmlAliasTarget("/menu.html", "", prerenderedPages), "/menu");
  for (const path of [
    "/nope.html",
    "/operations.html",
    "//evil.html",
    "/a/b.html",
    "/terms",
    "/TERMS.html",
  ])
    assert.equal(htmlAliasTarget(path, "", prerenderedPages), null, path);
});

test("only unhashed static files are revalidated; HTML and bundles are not", () => {
  for (const path of [
    "/brand/icon.png",
    "/brand/approved/x-640.webp",
    "/brand/fonts/a.woff2",
    "/payments/visa.svg",
    "/favicon.ico",
  ])
    assert.equal(revalidatedAsset(path), true, path);
  for (const path of [
    "/",
    "/menu",
    "/index.html",
    "/assets/index-AbCd1234.js",
    "/api/health",
    "/robots.txt",
    "/sitemap.xml",
  ])
    assert.equal(revalidatedAsset(path), false, path);
  assert.match(REVALIDATED_CACHE_CONTROL, /must-revalidate/);
  assert.notEqual(weakEtag(10, 1000), weakEtag(11, 1000));
  assert.notEqual(weakEtag(10, 1000), weakEtag(10, 2000));
  assert.match(weakEtag(10, 1000), /^W\/"[a-z0-9]+-[a-z0-9]+"$/);
});

test(
  "customers do not download Operations: it is a separate lazy chunk",
  { skip: !built && "run npm run build first" },
  () => {
    const html = readFileSync("dist/client/index.html", "utf8");
    const entry =
      /<script type="module" crossorigin src="\/assets\/([^"]+)"/.exec(
        html,
      )?.[1];
    assert.ok(entry);
    const code = readFileSync(`dist/client/assets/${entry}`, "utf8");
    const chunks = readdirSync("dist/client/assets").filter((f) =>
      /^Workspace-.*\.js$/.test(f),
    );
    assert.equal(chunks.length, 1, "one lazily loaded Operations chunk");
    // Staff-only screens live in the lazy chunk, not in the customer entry.
    const ops = readFileSync(`dist/client/assets/${chunks[0]}`, "utf8");
    for (const marker of [
      "Product Hub access is restricted",
      "Back to orders",
    ]) {
      assert.ok(ops.includes(marker), marker);
      assert.ok(!code.includes(marker), marker);
    }
    // Every public page references only the customer entry and stylesheet.
    for (const page of ["index", "menu", "how-to-order", "terms"]) {
      const doc = readFileSync(`dist/client/${page}.html`, "utf8");
      assert.doesNotMatch(doc, /Workspace-/, page);
    }
  },
);

const PORT = 3412;
const get = (path: string, headers: Record<string, string> = {}) =>
  new Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
  }>((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port: PORT, path, headers },
      (res) => {
        res.resume();
        res.on("end", () =>
          resolve({ status: res.statusCode!, headers: res.headers }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });

test(
  "server: .html aliases redirect, API answers are noindex, media revalidates",
  { skip: !built && "run npm run build first" },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "seo-technical-"));
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/web-checkout-server.ts"],
      {
        env: {
          ...process.env,
          DB_PATH: join(dir, "store.sqlite"),
          API_PORT: String(PORT),
          PORT: String(PORT),
          APP_ORIGIN: `http://127.0.0.1:${PORT}`,
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
      for (const [from, to] of [
        ["/index.html", "/"],
        ["/terms.html", "/terms"],
        ["/menu.html?category=pan", "/menu?category=pan"],
      ]) {
        const r = await get(from!);
        assert.equal(r.status, 301, from!);
        assert.equal(r.headers.location, to);
      }
      assert.equal((await get("/nope.html")).status, 404);
      // Every API answer, including ones not built by the shared json helper.
      for (const path of [
        "/api/health",
        "/api/storefront/catalog",
        "/api/checkout/config",
        "/api/nope",
      ])
        assert.match(
          String((await get(path)).headers["x-robots-tag"]),
          /noindex/,
          path,
        );
      // Photography and icons: validators, then 304 on revalidation.
      const first = await get("/brand/icon.png");
      assert.equal(first.status, 200);
      assert.equal(first.headers["cache-control"], REVALIDATED_CACHE_CONTROL);
      const etag = String(first.headers.etag);
      assert.match(etag, /^W\//);
      assert.ok(first.headers["last-modified"]);
      const again = await get("/brand/icon.png", { "If-None-Match": etag });
      assert.equal(again.status, 304);
      assert.equal(
        (await get("/brand/icon.png", { "If-None-Match": 'W/"other"' })).status,
        200,
      );
      // HTML keeps no long-lived cache and no validator that could pin an old bundle.
      const page = await get("/menu");
      assert.equal(page.status, 200);
      assert.equal(page.headers.etag, undefined);
      assert.equal(page.headers["cache-control"], undefined);
      // The Operations route still serves the app shell.
      assert.equal((await get("/operations/orders")).status, 200);
    } finally {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
