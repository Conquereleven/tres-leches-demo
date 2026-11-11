import test from "node:test";
import assert from "node:assert/strict";
import { liveState, refreshLiveCatalog } from "../../src/brand/live-catalog";

const empty = {
  schemaVersion: 1,
  revision: "fixture-revision",
  publishedAt: null,
  currency: "AED",
  categories: [],
  families: [],
  assets: [],
  products: [],
};

test("an explicit retry fetches again after a stale in-flight request settles", async (t) => {
  t.mock.method(globalThis, "setTimeout", (() => ({
    unref() {},
  })) as unknown as typeof setTimeout);
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { dataset: { catalog: "dynamic" } } },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  });
  let failing = true;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    // The answer is decided when the request is sent, as by a real server.
    const unavailable = failing;
    if (calls === 2) await held;
    return unavailable
      ? Response.json({ error: "unavailable" }, { status: 503 })
      : Response.json(empty);
  });
  await refreshLiveCatalog();
  assert.equal(liveState().status, "unavailable");
  // An automatic refresh (focus, visibility, timer) starts while still failing.
  const automatic = refreshLiveCatalog();
  failing = false;
  // The customer presses TRY AGAIN while that stale request is in flight.
  const retry = refreshLiveCatalog(true);
  release();
  await automatic;
  await retry;
  assert.equal(calls, 3);
  assert.equal(liveState().status, "live");
  // Without an explicit retry, concurrent callers still share one request.
  const a = refreshLiveCatalog();
  const b = refreshLiveCatalog();
  await Promise.all([a, b]);
  assert.equal(calls, 4);
});
