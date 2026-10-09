import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = 3171;
const call = (host: string, path: string, method = "GET") =>
  new Promise<{ status: number; location?: string }>((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port: PORT, path, method, headers: { Host: host } },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode!, location: res.headers.location });
      },
    );
    req.on("error", reject);
    req.end();
  });
test("the bare domain redirects permanently to www, keeping path and query", async () => {
  const dir = mkdtempSync(join(tmpdir(), "apex-"));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/web-checkout-server.ts"],
    {
      env: {
        ...process.env,
        DB_PATH: join(dir, "store.sqlite"),
        API_PORT: String(PORT),
        PORT: String(PORT),
        APP_ORIGIN: "https://www.apex-fixture.invalid",
      },
      stdio: "ignore",
    },
  );
  try {
    for (let i = 0; i < 100; i++) {
      try {
        if (
          (await call("www.apex-fixture.invalid", "/api/health")).status === 200
        )
          break;
      } catch {
        /* still starting */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    for (const [path, target] of [
      ["/", "https://www.apex-fixture.invalid/"],
      ["/menu", "https://www.apex-fixture.invalid/menu"],
      ["/menu?x=1", "https://www.apex-fixture.invalid/menu?x=1"],
      [
        "/checkout?lang=ar&a=b%20c",
        "https://www.apex-fixture.invalid/checkout?lang=ar&a=b%20c",
      ],
      // A hostile path cannot turn the redirect into an open redirect.
      ["//evil.example/x", "https://www.apex-fixture.invalid//evil.example/x"],
    ] as const) {
      const apex = await call("apex-fixture.invalid", path);
      assert.equal(apex.status, 301, path);
      assert.equal(apex.location, target);
    }
    // Case-insensitive host; HEAD behaves like GET.
    assert.equal(
      (await call("APEX-Fixture.invalid", "/menu", "HEAD")).status,
      301,
    );
    // The canonical host is served, not redirected: no loop.
    const www = await call("www.apex-fixture.invalid", "/menu?x=1");
    assert.equal(www.status, 200);
    assert.equal(www.location, undefined);
    // Health checks and other hosts are untouched.
    assert.equal((await call("127.0.0.1", "/api/health")).status, 200);
    assert.equal((await call("something-else.invalid", "/")).status, 200);
    // A POST is never redirected: its body would be lost or replayed.
    const post = await call(
      "apex-fixture.invalid",
      "/api/webhooks/payment",
      "POST",
    );
    assert.notEqual(post.status, 301);
    assert.equal(post.location, undefined);
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
