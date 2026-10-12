import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The real server on a disposable database, with the given adoption settings. */
async function server(port: number, env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "storefront-http-"));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/storefront-dynamic-server.ts"],
    {
      env: {
        ...process.env,
        DB_PATH: join(dir, "state.sqlite"),
        PORT: String(port),
        API_PORT: String(port),
        HOST: "127.0.0.1",
        APP_ORIGIN: base,
        ...env,
      },
      stdio: "ignore",
    },
  );
  let ready = false;
  for (let i = 0; i < 150 && child.exitCode === null; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, "server started");
  const close = async () => {
    child.kill();
    await new Promise<void>((r) =>
      child.exitCode !== null ? r() : child.once("exit", () => r()),
    );
    rmSync(dir, { recursive: true, force: true });
  };
  return { base, close };
}
const config = async (base: string) =>
  (await (await fetch(base + "/api/checkout/config")).json()) as {
    enabled: boolean;
    products: unknown[];
    catalog: { dynamic: boolean; revision: string | null };
  };
// The served shell exists only after a build; CI builds before testing.
const built = existsSync("dist/client/index.html");

test("adoption off (the default): no public endpoint, no page mark, checkout unchanged", async () => {
  const s = await server(3181, { STOREFRONT_DYNAMIC_CATALOG_ENABLED: "false" });
  try {
    const res = await fetch(s.base + "/api/storefront/catalog");
    assert.equal(res.status, 404);
    const c = await config(s.base);
    assert.deepEqual(c.catalog, { dynamic: false, revision: null });
    assert.equal(c.enabled, true);
    assert.equal(c.products.length > 100, true);
    if (built) {
      const html = await (await fetch(s.base + "/menu")).text();
      assert.ok(!html.includes("data-catalog"));
    }
  } finally {
    await s.close();
  }
});

test("adoption on: public, cacheable by revision, read-only, and the page is marked", async () => {
  const s = await server(3183, {});
  try {
    const res = await fetch(s.base + "/api/storefront/catalog");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.match(res.headers.get("cache-control")!, /no-cache/);
    const etag = res.headers.get("etag")!;
    const body = (await res.json()) as {
      revision: string;
      products: unknown[];
    };
    assert.equal(body.products.length, 74);
    assert.equal(
      (
        await fetch(s.base + "/api/storefront/catalog", {
          headers: { "If-None-Match": etag },
        })
      ).status,
      304,
    );
    // No session is needed to read it, and nothing but reading is possible.
    for (const method of ["POST", "PUT", "DELETE"])
      assert.equal(
        (
          await fetch(s.base + "/api/storefront/catalog", {
            method,
            headers: { Origin: s.base },
          })
        ).status,
        404,
        method,
      );
    assert.equal(
      (await fetch(s.base + "/api/storefront/catalog/draft")).status,
      404,
    );
    const c = await config(s.base);
    assert.deepEqual(c.catalog, { dynamic: true, revision: body.revision });
    assert.equal(c.enabled, true);
    if (built) {
      for (const path of ["/", "/menu", "/cart"]) {
        const html = await (await fetch(s.base + path)).text();
        assert.match(html, /<html data-catalog="dynamic"/, path);
      }
      // Other static files are served byte for byte.
      const icon = await fetch(s.base + "/brand/icon.png");
      assert.equal(icon.status, 200);
    }
  } finally {
    await s.close();
  }
});

test("adoption on without a valid revision: 503 and checkout sells nothing", async () => {
  const s = await server(3185, { FIXTURE_FOUNDATION: "absent" });
  try {
    const res = await fetch(s.base + "/api/storefront/catalog");
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("retry-after"), "30");
    assert.ok(!(await res.text()).includes("priceFils"));
    const c = await config(s.base);
    assert.deepEqual(c.catalog, { dynamic: true, revision: null });
    assert.equal(c.enabled, false);
    assert.deepEqual(c.products, []);
    const pay = await fetch(s.base + "/api/checkout/quote", {
      method: "POST",
      headers: { Origin: s.base, "Content-Type": "application/json" },
      body: JSON.stringify({ lines: [], zoneId: "jlt-cluster-c" }),
    });
    assert.equal(pay.status, 503);
  } finally {
    await s.close();
  }
});
