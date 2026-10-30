import test from "node:test";
import assert from "node:assert/strict";
import {
  savedCheckout,
  rememberCheckout,
  savedDraft,
  rememberDraft,
  clearCheckoutDraft,
} from "../../src/brand/checkout-storage";
function fixture() {
  const descriptors = ["sessionStorage", "localStorage"].map((k) =>
    Object.getOwnPropertyDescriptor(globalThis, k),
  );
  const memory = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
    };
  };
  const session = memory(),
    local = memory();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: session,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: local,
  });
  return {
    session,
    local,
    close: () => {
      ["sessionStorage", "localStorage"].forEach((key, i) => {
        const d = descriptors[i];
        if (d) Object.defineProperty(globalThis, key, d);
        else Reflect.deleteProperty(globalThis, key);
      });
    },
  };
}
const first = "00000000-0000-4000-8000-000000000001",
  next = "00000000-0000-4000-8000-000000000002";
test("closed-tab recovery preserves draft and compositions; latest durable capability wins over another tab's stale session", () => {
  const f = fixture();
  try {
    const draft = {
      step: 3,
      customer: { email: "fixture@example.invalid" },
      delivery: { date: "2026-10-29", address: "Synthetic address" },
      lines: [
        {
          productId: "fixture-pack",
          quantity: 1,
          composition: [
            { componentSkuId: "fixture-a", units: 2 },
            { componentSkuId: "fixture-b", units: 4 },
          ],
        },
      ],
    };
    rememberCheckout({ key: first });
    rememberDraft(draft);
    f.session.clear();
    assert.equal(savedCheckout()?.key, first);
    assert.deepEqual(savedDraft(), draft);
    rememberCheckout({ key: next });
    f.session.setItem("3l-checkout", JSON.stringify({ key: first }));
    assert.equal(savedCheckout()?.key, next);
    clearCheckoutDraft();
    assert.equal(savedDraft(), null);
    assert.equal(savedCheckout()?.key, next);
  } finally {
    f.close();
  }
});
test("expired or malformed durable recovery is never used; old session format remains compatible", () => {
  const f = fixture();
  try {
    f.local.setItem(
      "3l-checkout-recovery",
      JSON.stringify({ expiresAt: 0, value: { key: first } }),
    );
    assert.equal(savedCheckout(), null);
    f.session.setItem("3l-checkout", JSON.stringify({ key: next }));
    assert.equal(savedCheckout()?.key, next);
    f.local.setItem("3l-checkout-recovery", "{bad");
    assert.equal(savedCheckout()?.key, next);
    f.session.setItem("3l-checkout", JSON.stringify({ key: "026" }));
    assert.equal(savedCheckout(), null);
  } finally {
    f.close();
  }
});
test("blocked storage fails before a new payment can lose its recovery capability", () => {
  const f = fixture();
  try {
    for (const key of ["localStorage", "sessionStorage"])
      Object.defineProperty(globalThis, key, {
        configurable: true,
        get() {
          throw new Error("Synthetic storage denial");
        },
      });
    assert.equal(savedCheckout(), null);
    assert.equal(savedDraft(), null);
    assert.throws(() => rememberCheckout({ key: first }), /before paying/);
  } finally {
    f.close();
  }
});
