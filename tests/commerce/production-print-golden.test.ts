import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { orderDocuments } from "../../server/orders/documents";
import {
  printState,
  PRINT_AT,
  reviewOrders,
} from "../fixtures/print-documents";
import { ZipWriter } from "../../server/orders/zip";
import {
  verifyProductionGolden,
  verifyGoldenArchive,
} from "../fixtures/production-print-golden-check";
import approved from "../fixtures/production-print-golden-compression.json";

test("closed production profiles reject corrupt bytes, layout/content drift, selection/entry changes and CRC faults", () => {
  const dir = mkdtempSync(join(tmpdir(), "production-golden-negative-"));
  try {
    const run = spawnSync(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/print-samples.ts", dir],
      {
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
        },
        encoding: "utf8",
        timeout: 30000,
      },
    );
    assert.equal(run.status, 0, run.stderr);
    const read = (name: string) => readFileSync(join(dir, name));
    const id = verifyProductionGolden(read),
      profile = approved.profiles.find((p) => p.id === id)!;
    const pdfName = "P1_Numeric_Arabic.pdf",
      pdf = read(pdfName),
      zipName = "SYNTHETIC_60_Orders.zip",
      zip = read(zipName);
    const rejects = (name: string, bytes: Buffer) =>
      assert.throws(
        () => verifyProductionGolden((n) => (n === name ? bytes : read(n))),
        /Unknown or mixed/,
      );
    const corrupt = Buffer.from(pdf);
    corrupt[100] = corrupt[100]! ^ 1;
    rejects(pdfName, corrupt);
    const drift = (bytes: Buffer) => {
      const s = bytes.toString("latin1"),
        changed = s.replace(/MediaBox \[0 0 595/, "MediaBox [0 0 594");
      assert.notEqual(changed, s);
      return Buffer.from(changed, "latin1");
    };
    rejects(pdfName, drift(pdf));
    const state = printState();
    state.orders.push(...reviewOrders());
    const changed = state.orders.find((o) => o.id === "TL-DEMO-NUMERALS")!;
    changed.customerDetails = {
      ...changed.customerDetails,
      instructions: "Changed accepted instruction 123",
    };
    const contentDrift = orderDocuments(
      state,
      [changed],
      "packing-slip",
      { id: "fixture-admin", role: "admin" },
      PRINT_AT,
    );
    assert.ok(
      contentDrift.trace
        .join("\n")
        .includes("Changed accepted instruction 123"),
    );
    rejects(pdfName, contentDrift.pdf);

    const crcFault = Buffer.from(zip),
      end = zip.length - 22,
      central = zip.readUInt32LE(end + 16);
    crcFault.writeUInt32LE(
      (zip.readUInt32LE(central + 16) ^ 1) >>> 0,
      central + 16,
    );
    rejects(zipName, crcFault);
    assert.throws(() => verifyGoldenArchive(crcFault, profile.entries));
    const entries: { name: string; bytes: Buffer }[] = [];
    let pos = central;
    for (let i = 0; i < 60; i++) {
      const local = zip.readUInt32LE(pos + 42),
        start =
          local +
          30 +
          zip.readUInt16LE(local + 26) +
          zip.readUInt16LE(local + 28),
        packed = zip.readUInt32LE(pos + 20);
      entries.push({
        name: profile.entries[i]!.name,
        bytes: inflateRawSync(zip.subarray(start, start + packed)),
      });
      pos +=
        46 +
        zip.readUInt16LE(pos + 28) +
        zip.readUInt16LE(pos + 30) +
        zip.readUInt16LE(pos + 32);
    }
    const pack = (rows: typeof entries) => {
      const writer = new ZipWriter(new Date("2026-11-04T06:00:00Z"));
      for (const row of rows) writer.add(row.name, row.bytes);
      return writer.finish();
    };
    for (const altered of [
      [...entries].reverse(),
      entries.slice(1),
      entries.map((e, i) => (i === 0 ? { ...e, bytes: drift(e.bytes) } : e)),
    ]) {
      const bytes = pack(altered);
      rejects(zipName, bytes);
      assert.throws(() => verifyGoldenArchive(bytes, profile.entries));
    }
    const wrongName = Buffer.from(zip);
    wrongName[central + 46] = wrongName[central + 46]! ^ 1;
    rejects(zipName, wrongName);
    assert.throws(() => verifyGoldenArchive(wrongName, profile.entries));
    // Even another individually approved document cannot substitute for a selected one.
    rejects(pdfName, read("P2_Numeric_Arabic.pdf"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
