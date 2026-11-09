/**
 * TPL-21: loose Pan de Muerto and Bolillo (B111) sell in at least 6 pieces per
 * selected SKU, from the product selector through every server checkout path.
 * Packs and every other product keep their existing rules. Payments use fake
 * transports only; no real provider is ever reached.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { validateCatalog } from "../../server/domain/catalog";
import { DomainError } from "../../server/domain/model";
import {
  addDays,
  createWebCheckout,
  dubaiToday,
  normalizeCheckout,
  quoteWebCheckout,
  resumeWebCheckout,
} from "../../server/domain/web-checkout";
import {
  belowMinimumSkus,
  MIN_SIX_SKUS,
  minimumOrderQuantity,
} from "../../shared/minimum-quantity";
import { RETIRED_SKUS } from "../../shared/commerce-policy";
import { fixtureAddressGeo } from "../fixtures/website-address";

// Inside the Pan singles season (October 3 – November 15), Dubai morning.
const NOW = "2026-11-09T06:00:00.000Z";
const PAN = "pan-de-muerto-filled-pistachio-individual";
const PAN_2 = "pan-de-muerto-traditional-azucar-mini-40-g";
const BOLILLO = "B111";
const PACK_6 = "pan-de-muerto-traditional-pack-6-mini";
const PACK_12 = "pan-de-muerto-filled-pack-12-individuales";
const OTHER = "bisquets-individual-100-g";
const MESSAGE =
  "Minimum order: 6 pieces for Pan de Muerto and Bolillo. Please update your cart.";

const menu = JSON.parse(
  readFileSync("data-imports/liza-current-menu.json", "utf8"),
) as { items: { id: string; active: boolean }[] };
const published = JSON.parse(
  readFileSync("src/brand/menu-data.json", "utf8"),
) as unknown;

test("policy: exactly the 16 approved loose Pan SKUs plus B111 require 6; packs and others keep 1", () => {
  assert.equal(MIN_SIX_SKUS.size, 17);
  const pan = [...MIN_SIX_SKUS].filter((id) => id !== BOLILLO);
  assert.equal(pan.length, 16);
  for (const id of pan) {
    assert.ok(id.startsWith("pan-de-muerto-"), id);
    assert.ok(!id.includes("-pack"), id);
    assert.ok(!RETIRED_SKUS.has(id), id);
    // Every id is a real, active SKU in the reviewed menu and storefront data.
    assert.ok(
      menu.items.some((i) => i.id === id && i.active),
      `${id} missing from approved menu`,
    );
    assert.ok(JSON.stringify(published).includes(`"${id}"`), id);
    assert.equal(minimumOrderQuantity(id), 6);
  }
  // Every active loose Pan single in the approved menu is covered.
  for (const i of menu.items)
    if (
      i.active &&
      i.id.startsWith("pan-de-muerto-") &&
      !i.id.includes("-pack") &&
      !RETIRED_SKUS.has(i.id)
    )
      assert.ok(MIN_SIX_SKUS.has(i.id), i.id);
  assert.equal(minimumOrderQuantity(BOLILLO), 6);
  for (const id of [
    PACK_6,
    PACK_12,
    "pan-de-muerto-traditional-pack-12-mini",
    "pan-de-muerto-filled-pack-6-individuales",
    OTHER,
    "conchas-chocolate-individual",
    "pan-de-muerto",
    "b111",
    "111",
  ])
    assert.equal(minimumOrderQuantity(id), 1, id);
  // Per selected SKU: never aggregated across flavours.
  assert.deepEqual(
    belowMinimumSkus([
      { productId: PAN, quantity: 3 },
      { productId: PAN_2, quantity: 3 },
    ]).sort(),
    [PAN, PAN_2].sort(),
  );
  assert.deepEqual(belowMinimumSkus([{ productId: PACK_6, quantity: 1 }]), []);
});

// ── Domain: quote, order creation, resume and idempotent replay ──────────

function fixture() {
  const store = new Store(":memory:", "test");
  store.write((s) => {
    s.catalog = validateCatalog(menu);
    s.catalog.push({
      id: BOLILLO,
      name: "Bolillos",
      priceFils: 500,
      active: true,
      availability: "available",
    });
  });
  let calls = 0;
  const provider = new PaymenntProvider(
    { apiKey: "test-fixture", apiSecret: "test-secret", environment: "test" },
    async (_url, options) => {
      calls++;
      const body = options?.body ? JSON.parse(String(options.body)) : {};
      return Response.json({
        success: true,
        result: {
          id: "checkout-fixture",
          requestId: body.requestId,
          orderId: body.orderId,
          amount: body.amount,
          currency: "AED",
          status: "PENDING",
          redirectUrl: "https://pay.test.paymennt.com/checkout/fixture",
        },
      });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
    fixtureAddressGeo,
  );
  return { store, service, calls: () => calls };
}
const pickup = (lines: { productId: string; quantity: number }[]) => ({
  lines,
  fulfillmentMethod: "pickup" as const,
});
const checkoutBody = (lines: { productId: string; quantity: number }[]) => ({
  lines,
  delivery: {
    zoneId: "jlt-cluster-c",
    address: "Jumeirah Lakes Towers, Cluster C",
    building: "Test Tower",
    unit: "1204",
    date: addDays(dubaiToday(), 2),
    slot: "4:00 PM – 9:00 PM",
  },
  customer: {
    name: "Test Customer",
    phone: "050 123 4567",
    email: "customer@example.com",
  },
  billing: { sameAsDelivery: true },
});
/** Rewrite one SKU's quantity consistently across order, quote and payment. */
function rewriteQuantity(
  f: ReturnType<typeof fixture>,
  orderId: string,
  productId: string,
  quantity: number,
) {
  f.store.write((s) => {
    const o = s.orders.find((o) => o.id === orderId)!;
    const p = s.payments.find((p) => p.id === o.paymentId)!;
    const line = o.lines.find((l) => l.productId === productId)!;
    const unit = o.catalogSnapshot!.find((c) => c.id === productId)!.priceFils;
    const delta = (quantity - line.quantity) * unit;
    line.quantity = quantity;
    o.quote!.subtotalFils! += delta;
    o.quote!.totalFils! += delta;
    p.amountFils += delta;
  });
}
const rejectsMinimum = (fn: () => unknown) =>
  assert.throws(
    fn,
    (e: unknown) =>
      e instanceof DomainError && e.status === 422 && e.message === MESSAGE,
  );
const rejectsMinimumAsync = (fn: () => Promise<unknown>) =>
  assert.rejects(
    fn,
    (e: unknown) =>
      e instanceof DomainError && e.status === 422 && e.message === MESSAGE,
  );

test("server quote rejects 1 and 5, accepts 6, 7 and 100, and refuses 101 for loose Pan and Bolillo", () => {
  mock.timers.enable({ apis: ["Date"], now: new Date(NOW) });
  const f = fixture();
  try {
    for (const id of [PAN, PAN_2, BOLILLO]) {
      for (const quantity of [1, 5])
        rejectsMinimum(() =>
          quoteWebCheckout(f.service, pickup([{ productId: id, quantity }])),
        );
      const price = f.store.read().catalog!.find((p) => p.id === id)!.priceFils;
      for (const quantity of [6, 7, 100]) {
        const q = quoteWebCheckout(
          f.service,
          pickup([{ productId: id, quantity }]),
        );
        // Unit price unchanged: no 6-piece repricing.
        assert.equal(q.subtotalFils, price * quantity, `${id} × ${quantity}`);
      }
      assert.throws(() =>
        quoteWebCheckout(f.service, pickup([{ productId: id, quantity: 101 }])),
      );
    }
    // Legacy single-product shape cannot bypass the rule.
    rejectsMinimum(() =>
      quoteWebCheckout(f.service, {
        productId: PAN,
        quantity: 5,
        zoneId: "jlt-cluster-c",
      }),
    );
    assert.equal(f.calls(), 0);
  } finally {
    f.store.close();
    mock.timers.reset();
  }
});

test("packs, other products and mixed carts: 6 Pan + 6 Bolillo passes, 6 Pan + 5 Bolillo fails, no cross-flavour aggregation", () => {
  mock.timers.enable({ apis: ["Date"], now: new Date(NOW) });
  const f = fixture();
  try {
    const catalog = f.store.read().catalog!;
    const price = (id: string) => catalog.find((p) => p.id === id)!.priceFils;
    for (const [id, quantity] of [
      [PACK_6, 1],
      [PACK_6, 2],
      [PACK_12, 1],
      [OTHER, 1],
      [OTHER, 5],
    ] as const) {
      const q = quoteWebCheckout(
        f.service,
        pickup([{ productId: id, quantity }]),
      );
      assert.equal(q.subtotalFils, price(id) * quantity, id);
    }
    assert.equal(
      quoteWebCheckout(
        f.service,
        pickup([
          { productId: PAN, quantity: 6 },
          { productId: BOLILLO, quantity: 6 },
          { productId: PACK_6, quantity: 1 },
          { productId: OTHER, quantity: 1 },
        ]),
      ).subtotalFils,
      price(PAN) * 6 + price(BOLILLO) * 6 + price(PACK_6) + price(OTHER),
    );
    rejectsMinimum(() =>
      quoteWebCheckout(
        f.service,
        pickup([
          { productId: PAN, quantity: 6 },
          { productId: BOLILLO, quantity: 5 },
        ]),
      ),
    );
    rejectsMinimum(() =>
      quoteWebCheckout(
        f.service,
        pickup([
          { productId: PAN, quantity: 3 },
          { productId: PAN_2, quantity: 3 },
        ]),
      ),
    );
  } finally {
    f.store.close();
    mock.timers.reset();
  }
});

test("order creation, resume and idempotent replay refuse a below-minimum cart before any provider call", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date(NOW) });
  const f = fixture();
  try {
    for (const embedded of [false, true] as const)
      await rejectsMinimumAsync(() =>
        createWebCheckout(
          f.service,
          checkoutBody([{ productId: PAN, quantity: 5 }]),
          randomUUID(),
          embedded,
        ),
      );
    assert.equal(f.store.read().orders.length, 0);
    assert.equal(f.calls(), 0);

    // A valid cart still creates its order at the unchanged unit price.
    const key = randomUUID();
    const valid = checkoutBody([
      { productId: PAN, quantity: 7 },
      { productId: BOLILLO, quantity: 6 },
    ]);
    const created = await createWebCheckout(f.service, valid, key, true);
    const order = f.store.read().orders.find((o) => o.id === created.orderId)!;
    assert.deepEqual(
      order.lines.map((l) => [l.productId, l.quantity]),
      [
        [PAN, 7],
        [BOLILLO, 6],
      ],
    );

    // Simulate an unpaid checkout persisted before TPL-21 with 3 Bolillos.
    const stale = checkoutBody([
      { productId: PAN, quantity: 7 },
      { productId: BOLILLO, quantity: 3 },
    ]);
    rewriteQuantity(f, created.orderId, BOLILLO, 3);
    // Same input hash the server derives after resolving the delivery zone.
    const digest = (v: string) => createHash("sha256").update(v).digest("hex");
    const inputHash = (raw: unknown) => {
      const input = normalizeCheckout(raw);
      input.zoneId = input.delivery!.zoneId = "jlt-cluster-c";
      input.delivery!.addressVerification = order.delivery!.addressVerification;
      return digest(JSON.stringify(input));
    };
    assert.equal(
      f.store.read().webCheckouts![digest(key)]!.inputHash,
      inputHash(valid),
    );
    f.store.write((s) => {
      s.webCheckouts![digest(key)]!.inputHash = inputHash(stale);
    });
    rejectsMinimum(() =>
      resumeWebCheckout(f.service, { key, checkout: stale }),
    );
    await rejectsMinimumAsync(() =>
      createWebCheckout(f.service, stale, key, true),
    );
  } finally {
    f.store.close();
    mock.timers.reset();
  }
});

test("paid historical orders below the minimum stay readable and untouched", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date(NOW) });
  const f = fixture();
  try {
    const key = randomUUID();
    const body = checkoutBody([{ productId: PAN, quantity: 6 }]);
    const created = await createWebCheckout(f.service, body, key, true);
    const stale = checkoutBody([{ productId: PAN, quantity: 2 }]);
    rewriteQuantity(f, created.orderId, PAN, 2);
    f.store.write((s) => {
      const o = s.orders.find((o) => o.id === created.orderId)!;
      s.payments.find((p) => p.id === o.paymentId)!.status = "paid";
    });
    const before = JSON.stringify(f.store.read().orders);
    assert.doesNotThrow(() =>
      resumeWebCheckout(f.service, { key, checkout: stale }),
    );
    assert.equal(
      JSON.stringify(
        f.store.read().orders.map((o) => ({ ...o, audit: undefined })),
      ),
      JSON.stringify(
        JSON.parse(before).map((o: object) => ({ ...o, audit: undefined })),
      ),
    );
  } finally {
    f.store.close();
    mock.timers.reset();
  }
});

test("background worker ends a stale under-minimum hosted job before any provider call; 6 pieces and paid orders unaffected", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date(NOW) });
  const f = fixture();
  const ORIGIN = "http://localhost:5173";
  try {
    // Queue hosted web jobs without draining, as if persisted before TPL-21.
    const drain = f.service.drain.bind(f.service);
    f.service.drain = async () => {};
    const queue = async (quantity: number) => {
      const created = await createWebCheckout(
        f.service,
        checkoutBody([{ productId: PAN, quantity: 6 }]),
        randomUUID(),
        "web",
        ORIGIN,
      );
      if (quantity !== 6) rewriteQuantity(f, created.orderId, PAN, quantity);
      return f.store.read().orders.find((o) => o.id === created.orderId)!;
    };
    const stale = await queue(5);
    const valid = await queue(6);
    const paid = await queue(2);
    f.store.write((s) => {
      const p = s.payments.find((p) => p.id === paid.paymentId)!;
      p.status = "paid";
      s.jobs = s.jobs.filter((j) => j.entityId !== p.id);
    });
    f.service.drain = drain;
    const paidBefore = JSON.stringify(
      f.store.read().orders.find((o) => o.id === paid.id),
    );
    assert.equal(f.calls(), 0);

    // Repeated drains, including after the retry backoff would have elapsed.
    for (let i = 0; i < 4; i++) {
      await f.service.drain();
      mock.timers.tick(60_000);
    }
    const s = f.store.read();
    const job = (orderId: string) =>
      s.jobs.find(
        (j) => j.entityId === s.orders.find((o) => o.id === orderId)!.paymentId,
      )!;
    const payment = (orderId: string) =>
      s.payments.find((p) => p.orderId === orderId)!;

    // Quantity 5: terminally failed once, unpaid, no URL, no provider call.
    // Provably never sent, so the payment ends retryable (minimum-recovery.test.ts).
    assert.equal(job(stale.id).status, "failed");
    assert.equal(job(stale.id).attempts, 1);
    assert.equal(job(stale.id).lastError, MESSAGE);
    assert.equal(job(stale.id).localRejection, "BELOW_MINIMUM");
    assert.equal(payment(stale.id).status, "cancelled");
    assert.equal(payment(stale.id).url, undefined);
    assert.equal(payment(stale.id).providerCheckoutId, undefined);
    assert.equal(s.orders.find((o) => o.id === stale.id)!.state, "Building");

    // Quantity 6: exactly one provider call and the usual pending hosted link.
    assert.equal(f.calls(), 1);
    assert.equal(job(valid.id).status, "done");
    assert.equal(payment(valid.id).status, "pending");
    assert.equal(
      payment(valid.id).url,
      "https://pay.test.paymennt.com/checkout/fixture",
    );

    // Paid historical order below the minimum: untouched.
    assert.equal(payment(paid.id).status, "paid");
    assert.equal(
      JSON.stringify(s.orders.find((o) => o.id === paid.id)),
      paidBefore,
    );
  } finally {
    f.store.close();
    mock.timers.reset();
  }
});

// ── Browser cart: add, edit and persisted stale carts ────────────────────

test("browser cart refuses adds and edits below 6, removes at 0 and flags a stale saved cart", async () => {
  const saved = new Map<string, string>([
    [
      "3l-cart",
      JSON.stringify([
        { productId: BOLILLO, quantity: 3 },
        { productId: OTHER, quantity: 1 },
      ]),
    ],
  ]);
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => void saved.set(k, v),
      removeItem: (k: string) => void saved.delete(k),
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  });
  const { cart, belowMinimumLines, minQty } =
    await import("../../src/brand/cart");
  const state = () =>
    JSON.parse(saved.get("3l-cart") ?? "[]") as {
      productId: string;
      quantity: number;
    }[];
  // Stale saved cart is kept (explicit correction), and flagged for checkout.
  cart.add(OTHER, 1);
  assert.deepEqual(
    belowMinimumLines(state()).map((l) => l.productId),
    [BOLILLO],
  );
  assert.equal(minQty(BOLILLO), 6);
  assert.equal(minQty(OTHER), 1);
  // Increment up to the minimum corrects it; reductions below 6 are refused.
  cart.set(BOLILLO, 4);
  assert.equal(state().find((l) => l.productId === BOLILLO)!.quantity, 3);
  cart.set(BOLILLO, 6);
  assert.equal(state().find((l) => l.productId === BOLILLO)!.quantity, 6);
  cart.set(BOLILLO, 5);
  assert.equal(state().find((l) => l.productId === BOLILLO)!.quantity, 6);
  cart.set(BOLILLO, 7);
  assert.equal(state().find((l) => l.productId === BOLILLO)!.quantity, 7);
  assert.deepEqual(belowMinimumLines(state()), []);
  // Remove is always allowed.
  cart.set(BOLILLO, 0);
  assert.equal(
    state().some((l) => l.productId === BOLILLO),
    false,
  );
  // Adds below the minimum are refused; 6 and 7 are accepted.
  for (const quantity of [1, 5]) cart.add(PAN, quantity);
  assert.equal(
    state().some((l) => l.productId === PAN),
    false,
  );
  cart.add(PAN, 6);
  cart.add(PAN, 1); // already 6 in cart: 7 total is valid
  assert.equal(state().find((l) => l.productId === PAN)!.quantity, 7);
  cart.add(PACK_6, 1);
  assert.equal(state().find((l) => l.productId === PACK_6)!.quantity, 1);
  // Other products unchanged.
  assert.equal(state().find((l) => l.productId === OTHER)!.quantity, 2);
});

// ── Direct HTTP: no UI, no bypass ────────────────────────────────────────

test("direct HTTP quote, hosted and embedded checkout and resume reject below-minimum carts with 422 and no provider request", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tpl21-http-"));
  const base = "http://127.0.0.1:3291";
  const log = join(dir, "provider.log");
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/web-checkout-server.ts"],
    {
      env: {
        ...process.env,
        BOLILLO_FIXTURE: "true",
        PROVIDER_CALL_LOG: log,
        FIXTURE_DATE: NOW,
        PAYMENNT_PUBLIC_KEY: "pk_test_public_fixture",
        DB_PATH: join(dir, "store.sqlite"),
        API_PORT: "3291",
        PORT: "3291",
        APP_ORIGIN: base,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  try {
    for (let i = 0; i < 200; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    const post = (path: string, data: unknown, key = randomUUID()) =>
      fetch(base + path, {
        method: "POST",
        headers: {
          Origin: base,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(data),
      });
    const date = new Date(Date.parse(NOW) + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const full = (lines: { productId: string; quantity: number }[]) => ({
      ...checkoutBody(lines),
      delivery: { ...checkoutBody(lines).delivery, date },
    });
    const expect422 = async (r: Response) => {
      assert.equal(r.status, 422);
      assert.equal((await r.json()).message, MESSAGE);
    };
    for (const lines of [
      [{ productId: PAN, quantity: 1 }],
      [{ productId: PAN, quantity: 5 }],
      [{ productId: BOLILLO, quantity: 5 }],
      [
        { productId: PAN, quantity: 6 },
        { productId: BOLILLO, quantity: 5 },
      ],
    ]) {
      await expect422(
        await post("/api/checkout/quote", { lines, zoneId: "jlt-cluster-c" }),
      );
      await expect422(await post("/api/checkout/web", full(lines)));
      await expect422(await post("/api/checkout/prepare", full(lines)));
      await expect422(await post("/api/checkout", full(lines)));
      await expect422(
        await post("/api/checkout/resume", { checkout: full(lines) }),
      );
    }
    // Legacy single-product shape.
    await expect422(
      await post("/api/checkout", {
        productId: PAN,
        quantity: 5,
        zoneId: "jlt-cluster-c",
        customer: "Test Customer",
        phone: "0501234567",
        address: "Test building, apartment 1",
      }),
    );
    assert.equal(
      existsSync(log) ? readFileSync(log, "utf8") : "",
      "",
      "no provider request for rejected carts",
    );
    // Valid carts are accepted with unchanged unit prices.
    for (const [lines, subtotal] of [
      [[{ productId: PAN, quantity: 6 }], 6 * 2600],
      [[{ productId: PAN, quantity: 7 }], 7 * 2600],
      [
        [
          { productId: PAN, quantity: 6 },
          { productId: BOLILLO, quantity: 6 },
        ],
        6 * 2600 + 6 * 500,
      ],
      [[{ productId: PACK_6, quantity: 1 }], null],
    ] as const) {
      const r = await post("/api/checkout/quote", {
        lines,
        zoneId: "jlt-cluster-c",
      });
      assert.equal(r.status, 200, JSON.stringify(lines));
      const q = await r.json();
      if (subtotal !== null) assert.equal(q.subtotalFils, subtotal);
    }
  } finally {
    child.kill();
    await new Promise<void>((r) => {
      if (child.exitCode !== null) r();
      else child.once("exit", () => r());
    });
    rmSync(dir, { recursive: true, force: true });
  }
});
