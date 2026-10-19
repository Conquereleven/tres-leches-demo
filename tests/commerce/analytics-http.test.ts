import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const base = "http://127.0.0.1:3337";
test("real SQLite/API: auth, RBAC, aggregate privacy, bounded dates, CSV parity and zero writes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "analytics-http-")),
    dbPath = join(dir, "state.sqlite");
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/analytics-server.ts"],
    {
      env: {
        ...process.env,
        PORT: "3337",
        API_PORT: "3337",
        HOST: "127.0.0.1",
        APP_ORIGIN: base,
        DB_PATH: dbPath,
      },
      stdio: "ignore",
    },
  );
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, "isolated server started");
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const read = () =>
      JSON.stringify(
        db.prepare("SELECT document FROM commerce_state WHERE id=1").get(),
      );
    const before = read();
    try {
      const paths = [
        "summary",
        "sales",
        "products",
        "operations",
        "export?report=sales",
        "session",
      ];
      for (const p of paths)
        assert.equal(
          (await fetch(`${base}/api/analytics/${p}`)).status,
          401,
          p,
        );
      for (const role of ["admin", "manager", "operator", "agent"]) {
        const login = await fetch(base + "/api/login", {
          method: "POST",
          headers: { Origin: base, "Content-Type": "application/json" },
          body: JSON.stringify({
            id: `fixture-${role}`,
            password: "fictional-password",
          }),
        });
        assert.equal(login.status, 200);
        const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
        const call = (path: string) =>
          fetch(base + path, { headers: { Cookie: cookie } });
        const allowed = ["admin", "manager"].includes(role);
        for (const p of paths) {
          const res = await call(`/api/analytics/${p}`);
          assert.equal(res.status, allowed ? 200 : 403, `${role} ${p}`);
          assert.equal(res.headers.get("cache-control"), "no-store");
          if (allowed) {
            const text = await res.text();
            assert.doesNotMatch(
              text,
              /PRIVATE_CUSTOMER|private-fixture|customerDetails|fictional-checkout|providerReference|conversationId|payment-fictional/,
            );
          }
        }
        if (allowed) {
          const q = "from=2026-10-19&to=2026-10-19";
          const r = await (await call(`/api/analytics/summary?${q}`)).json();
          assert.equal(r.current.paidOrders, 1);
          assert.equal(r.current.capturedFils, 5000);
          const csv = await (
            await call(`/api/analytics/export?report=sales&${q}`)
          ).text();
          assert.match(csv, /"2026-10-19","1","5000"/);
          for (const path of [
            "summary?from=2026-02-30&to=2026-03-01",
            "summary?from=2020-01-01&to=2026-01-01",
            "export?report=secrets",
          ]) {
            assert.equal((await call(`/api/analytics/${path}`)).status, 400);
          }
          assert.equal((await call("/api/analytics/unknown")).status, 404);
          assert.equal(
            (
              await fetch(base + "/api/analytics/summary", {
                method: "POST",
                headers: { Cookie: cookie, Origin: base },
              })
            ).status,
            405,
          );
        }
      }
      assert.equal(
        read(),
        before,
        "all reporting requests leave full SQLite state byte-identical",
      );
      assert.equal((await fetch(base + "/operations/analytics")).status, 200);
      assert.equal(
        (await fetch(base + "/operations/analytics/anything")).status,
        404,
      );
    } finally {
      db.close();
    }
  } finally {
    child.kill();
    await new Promise<void>((r) =>
      child.exitCode !== null ? r() : child.once("exit", () => r()),
    );
    rmSync(dir, { recursive: true, force: true });
  }
});
