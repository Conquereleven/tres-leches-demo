/** Test-only, closed byte allowlist. No runtime renderer or compression changes. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, inflateRawSync } from "node:zlib";
import golden from "./production-print-golden.json";
import approved from "./production-print-golden-compression.json";
export const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
type Entry = { name: string; sha256: string; bytes: number; crc32: number };
/** Also used directly by negative tests, independently of the outer ZIP digest. */
export function verifyGoldenArchive(zip: Buffer, entries: readonly Entry[]) {
  assert.equal(entries.length, 60);
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 4), 0);
  assert.equal(zip.readUInt16LE(end + 6), 0);
  assert.equal(zip.readUInt16LE(end + 8), 60);
  assert.equal(zip.readUInt16LE(end + 10), 60);
  assert.equal(zip.readUInt16LE(end + 20), 0);
  const central = zip.readUInt32LE(end + 16);
  assert.equal(central + zip.readUInt32LE(end + 12), end);
  let pos = central,
    localEnd = 0;
  const names = new Set<string>();
  for (const expected of entries) {
    assert.equal(zip.readUInt32LE(pos), 0x02014b50);
    assert.equal(zip.readUInt16LE(pos + 8), 0);
    assert.equal(zip.readUInt16LE(pos + 10), 8);
    const packed = zip.readUInt32LE(pos + 20),
      size = zip.readUInt32LE(pos + 24),
      nameLength = zip.readUInt16LE(pos + 28),
      extra = zip.readUInt16LE(pos + 30),
      comment = zip.readUInt16LE(pos + 32),
      local = zip.readUInt32LE(pos + 42);
    const name = zip
      .subarray(pos + 46, pos + 46 + nameLength)
      .toString("ascii");
    assert.equal(name, expected.name);
    assert.ok(!names.has(name));
    names.add(name);
    assert.equal(local, localEnd);
    assert.equal(zip.readUInt32LE(local), 0x04034b50);
    assert.equal(zip.readUInt16LE(local + 6), 0);
    assert.equal(zip.readUInt16LE(local + 8), 8);
    assert.equal(zip.readUInt32LE(local + 18), packed);
    assert.equal(zip.readUInt32LE(local + 22), size);
    const localNameLength = zip.readUInt16LE(local + 26),
      localExtra = zip.readUInt16LE(local + 28);
    assert.equal(
      zip.subarray(local + 30, local + 30 + localNameLength).toString("ascii"),
      name,
    );
    const start = local + 30 + localNameLength + localExtra;
    assert.ok(start + packed <= central);
    const bytes = inflateRawSync(zip.subarray(start, start + packed), {
      maxOutputLength: expected.bytes + 1,
    });
    assert.equal(size, expected.bytes);
    assert.equal(bytes.length, expected.bytes);
    assert.equal(crc32(bytes), expected.crc32);
    assert.equal(zip.readUInt32LE(pos + 16), expected.crc32);
    assert.equal(zip.readUInt32LE(local + 14), expected.crc32);
    assert.equal(
      sha256(bytes),
      expected.sha256,
      `order isolation/content: ${name}`,
    );
    localEnd = start + packed;
    pos += 46 + nameLength + extra + comment;
  }
  assert.equal(localEnd, central);
  assert.equal(pos, end);
}
export function verifyProductionGolden(read: (name: string) => Buffer) {
  assert.equal(approved.profiles.length, 2);
  // Original nine documents and original ZIP stay authoritative and unchanged.
  assert.deepEqual(
    approved.profiles[0]!.documents,
    Object.fromEntries(golden.documents.map((d) => [d.name, d.sha256])),
  );
  assert.equal(approved.profiles[0]!.zipSha256, golden.zipSha256);
  const names = golden.documents.map((d) => d.name);
  const docs = Object.fromEntries(
    names.map((name) => [name, sha256(read(name))]),
  );
  const zip = read("SYNTHETIC_60_Orders.zip");
  const profile = approved.profiles.find(
    (p) =>
      Object.keys(p.documents).length === names.length &&
      names.every(
        (name) => p.documents[name as keyof typeof p.documents] === docs[name],
      ) &&
      p.zipSha256 === sha256(zip),
  );
  assert.ok(
    profile,
    "Unknown or mixed production golden bytes: no complete approved compression profile matches",
  );
  verifyGoldenArchive(zip, profile.entries);
  return profile.id;
}
export const verifyProductionGoldenDirectory = (directory: string) =>
  verifyProductionGolden((name) => readFileSync(join(directory, name)));
