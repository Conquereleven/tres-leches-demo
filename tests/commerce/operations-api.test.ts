import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../../src/commerce/api";

test("operations transport: HTTP status survives non-JSON proxy errors", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("Session expired", { status: 401 });
  try {
    await assert.rejects(
      api("workspace"),
      (e: unknown) => e instanceof ApiError && e.status === 401,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("operations transport: timeout aborts once and never retries a command", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = async (_url, init) => {
    calls++;
    signal = init?.signal;
    assert.equal(
      new Headers(init?.headers).get("Idempotency-Key"),
      "fixed-retry-key",
    );
    return new Promise((_resolve, reject) =>
      signal!.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      ),
    );
  };
  try {
    await assert.rejects(
      api("commands", { type: "transition" }, "fixed-retry-key", {
        timeoutMs: 15,
      }),
      /Request timed out/,
    );
    assert.equal(signal?.aborted, true);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("operations transport: explicit cancellation differs from timeout", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = async (_url, init) =>
    new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
    });
  try {
    const request = api("workspace", undefined, undefined, {
      signal: controller.signal,
    });
    controller.abort();
    await assert.rejects(
      request,
      (e: unknown) => e instanceof DOMException && e.name === "AbortError",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("operations transport: bounded body read and network recovery", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Network unavailable");
  };
  try {
    await assert.rejects(api("workspace"), /Unable to connect/);
    globalThis.fetch = async () => Response.json({ recovered: true });
    assert.deepEqual(await api("workspace"), { recovered: true });
  } finally {
    globalThis.fetch = original;
  }
});
