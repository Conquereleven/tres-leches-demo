import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reusableSession } from "../analytics-e2e/sessions";

type Probe = { status: number; body: unknown; throws?: boolean };
const requestFor = (probe: Probe) =>
  ({
    get: async () => ({
      status: () => probe.status,
      json: async () => {
        if (probe.throws) throw new Error("invalid json");
        return probe.body;
      },
    }),
  }) as never;

test("analytics session reuse is exact actor proof, fail-closed", async () => {
  const ok = await reusableSession(
    requestFor({ status: 200, body: { actor: { id: "fixture-admin", role: "admin" } } }),
    "admin",
    "cookie",
  );
  assert.equal(ok, true, "200 + exact actor must reuse");
  for (const [name, probe] of [
    ["200 without actor", { status: 200, body: {} }],
    ["200 invalid json", { status: 200, body: null, throws: true }],
    ["200 wrong id", { status: 200, body: { actor: { id: "fixture-manager", role: "admin" } } }],
    ["200 wrong role", { status: 200, body: { actor: { id: "fixture-admin", role: "manager" } } }],
    ["401", { status: 401, body: { actor: { id: "fixture-admin", role: "admin" } } }],
    ["403", { status: 403, body: { actor: { id: "fixture-admin", role: "admin" } } }],
    ["429", { status: 429, body: { actor: { id: "fixture-admin", role: "admin" } } }],
    ["500", { status: 500, body: { actor: { id: "fixture-admin", role: "admin" } } }],
  ] as const) {
    assert.equal(
      await reusableSession(requestFor(probe), "admin", "cookie"),
      false,
      `${name} must force a fresh login`,
    );
  }
});

test("analytics session cache file is created with mode 0600", () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-sessions-mode-"));
  const file = join(dir, ".sessions.json");
  writeFileSync(file, JSON.stringify({ origin: "https://127.0.0.1:3339", sessions: {} }), {
    mode: 0o600,
  });
  const mode = statSync(file).mode & 0o777;
  assert.equal(mode, 0o600, "cache must be owner-only from creation");
});
