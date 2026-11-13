import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PII, PROVIDER_REF } from "../fixtures/order-documents";

const base = "http://127.0.0.1:3341";
test("real SQLite/API: order documents RBAC, bounds, headers, origin and zero writes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "order-documents-http-")),
    dbPath = join(dir, "state.sqlite");
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/order-documents-server.ts"],
    {
      env: {
        ...process.env,
        PORT: "3341",
        API_PORT: "3341",
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
    const bulk = (cookie: string, body: unknown, origin = base) =>
      fetch(base + "/api/orders/documents", {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(body),
      });
    const single = (cookie: string, id: string, kind = "delivery-note") =>
      fetch(
        `${base}/api/orders/${encodeURIComponent(id)}/document?kind=${kind}`,
        {
          headers: cookie ? { Cookie: cookie } : {},
        },
      );
    try {
      assert.equal(
        (await bulk("", { ids: ["TL-BULK000"], format: "csv" })).status,
        401,
      );
      assert.equal((await single("", "TL-BULK000")).status, 401);
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
        const allowed = ["admin", "manager"].includes(role);
        const csv = await bulk(cookie, {
          ids: ["TL-BULK000", "TL-INJECT"],
          format: "csv",
        });
        assert.equal(csv.status, allowed ? 200 : 403, `${role} csv`);
        const pdf = await single(cookie, "TL-BULK000");
        assert.equal(pdf.status, allowed ? 200 : 403, `${role} pdf`);
        const zip = await bulk(cookie, {
          ids: ["TL-BULK001", "TL-BULK000"],
          format: "zip",
          kind: "delivery-note",
        });
        assert.equal(zip.status, allowed ? 200 : 403, `${role} zip`);
        if (!allowed) continue;

        assert.equal(
          csv.headers.get("content-type"),
          "text/csv; charset=utf-8",
        );
        assert.equal(csv.headers.get("cache-control"), "no-store");
        assert.match(
          csv.headers.get("content-disposition")!,
          /^attachment; filename="3l-orders-\d{4}-\d{2}-\d{2}-2\.csv"$/,
        );
        const text = await csv.text();
        assert.ok(!text.includes(PII) && !text.includes(PROVIDER_REF));
        assert.equal(text.trim().split("\r\n").length, 3);

        assert.equal(pdf.headers.get("content-type"), "application/pdf");
        assert.equal(pdf.headers.get("cache-control"), "no-store");
        assert.match(
          pdf.headers.get("content-disposition")!,
          /^attachment; filename="3l-delivery-note-TL-BULK000-[\d-]+\.pdf"$/,
        );
        assert.ok(
          Buffer.from(await pdf.arrayBuffer())
            .toString("latin1")
            .startsWith("%PDF-1.4"),
        );

        // Bulk PDF spanning more than two list pages.
        const many = Array.from(
          { length: 60 },
          (_, i) => `TL-BULK${String(i).padStart(3, "0")}`,
        );
        const merged = await bulk(cookie, {
          ids: many,
          format: "pdf",
          kind: "packing-slip",
        });
        assert.equal(merged.status, 200);
        const body = Buffer.from(await merged.arrayBuffer()).toString("latin1");
        assert.equal((body.match(/\/Type \/Page /g) ?? []).length, 60);

        assert.equal(zip.headers.get("content-type"), "application/zip");
        assert.equal(zip.headers.get("cache-control"), "no-store");
        assert.match(
          zip.headers.get("content-disposition")!,
          /^attachment; filename="3l-delivery-notes-\d{4}-\d{2}-\d{2}-2\.zip"$/,
        );
        const archive = Buffer.from(await zip.arrayBuffer());
        assert.equal(archive.readUInt32LE(0), 0x04034b50);
        const latin = archive.toString("latin1");
        assert.ok(latin.includes("001-delivery-note-TL-BULK001.pdf"));
        assert.ok(latin.includes("002-delivery-note-TL-BULK000.pdf"));
        assert.ok(!archive.includes(Buffer.from(PROVIDER_REF)));

        // Bounds and validation.
        for (const bad of [
          { ids: [], format: "csv" },
          { ids: ["TL-BULK000", "TL-BULK000"], format: "csv" },
          {
            ids: Array.from({ length: 501 }, (_, i) => `x${i}`),
            format: "csv",
          },
          { ids: ["TL-BULK000"], format: "docx" },
          { ids: ["TL-BULK000"], format: "zip", kind: "invoice" },
          { ids: [], format: "zip" },
          {
            ids: Array.from({ length: 501 }, (_, i) => `x${i}`),
            format: "zip",
          },
          { ids: ["TL-BULK000"], format: "csv", extra: true },
        ])
          assert.equal(
            (await bulk(cookie, bad)).status,
            400,
            JSON.stringify(bad).slice(0, 60),
          );
        assert.equal(
          (
            await bulk(cookie, {
              ids: ["TL-BULK000", "TL-MISSING"],
              format: "csv",
            })
          ).status,
          404,
        );
        assert.equal((await single(cookie, "TL-MISSING")).status, 404);
        assert.equal(
          (await single(cookie, "TL-BULK000", "invoice")).status,
          400,
        );
        assert.equal(
          (
            await fetch(base + "/api/orders/documents", {
              headers: { Cookie: cookie },
            })
          ).status,
          405,
        );
        // Cross-origin POST is refused before any document is built.
        assert.equal(
          (
            await bulk(
              cookie,
              { ids: ["TL-BULK000"], format: "csv" },
              "https://evil.example",
            )
          ).status,
          403,
        );
      }
      assert.equal(read(), before, "documents never write order state");
    } finally {
      db.close();
    }
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
