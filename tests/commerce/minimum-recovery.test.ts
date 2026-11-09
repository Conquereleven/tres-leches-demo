/**
 * TPL-21 recovery: a hosted web checkout persisted with 5 loose Pan pieces is
 * ended by the worker before Paymennt. Only that proven local rejection becomes
 * retryable; the customer corrects to 6 and recovers through the same calls the
 * storefront makes (resume → web checkout → return reconcile). Synthetic data
 * and a fake Paymennt transport only: no real provider is ever reached.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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
  quoteWebCheckout,
  readWebCheckoutStatus,
  recoverWebCheckout,
} from "../../server/domain/web-checkout";
import { reconcileEmbeddedPayment } from "../../server/domain/embedded-checkout";
import { verifiedLocalRejection } from "../../server/domain/local-rejection";
import { fixtureAddressGeo } from "../fixtures/website-address";

const NOW = "2026-11-09T06:00:00.000Z";
const ORIGIN = "http://localhost:5173";
const PAN = "pan-de-muerto-filled-pistachio-individual";
const PACK_6 = "pan-de-muerto-traditional-pack-6-mini";
const OTHER = "bisquets-individual-100-g";
const MESSAGE =
  "Minimum order: 6 pieces for Pan de Muerto and Bolillo. Please update your cart.";
const menu = JSON.parse(
  readFileSync("data-imports/liza-current-menu.json", "utf8"),
) as unknown;

type Line = { productId: string; quantity: number };

/** Fake Paymennt: counts creates and GETs separately; each create gets its own id. */
function fixture() {
  const store = new Store(":memory:", "test");
  store.write((s) => {
    s.catalog = validateCatalog(menu);
  });
  const created = new Map<string, Record<string, unknown>>();
  const calls = { create: 0, get: 0 };
  const provider = new PaymenntProvider(
    { apiKey: "test-fixture", apiSecret: "test-secret", environment: "test" },
    async (url, options) => {
      const path = new URL(String(url)).pathname.replace("/mer/v2.0", "");
      const search = new URL(String(url)).searchParams;
      if (options?.method === "POST") {
        calls.create++;
        const body = JSON.parse(String(options.body));
        const id = `checkout-${calls.create}`;
        const result = {
          id,
          requestId: body.requestId,
          orderId: body.orderId,
          amount: body.amount,
          currency: "AED",
          status: "PENDING",
          redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
        };
        created.set(id, result);
        return Response.json({ success: true, result });
      }
      calls.get++;
      if (path === "/checkout" && search.has("requestId")) {
        const found = [...created.values()].filter(
          (c) => c.requestId === search.get("requestId"),
        );
        return Response.json({
          success: true,
          result: { totalPages: 1, content: found },
        });
      }
      const found = created.get(decodeURIComponent(path.split("/").pop()!));
      return found
        ? Response.json({ success: true, result: found })
        : Response.json({ success: false }, { status: 404 });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
    fixtureAddressGeo,
  );
  return { store, service, calls };
}
type F = ReturnType<typeof fixture>;

const body = (lines: Line[]) => ({
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

/** Persist a hosted web job without draining, as if queued before TPL-21. */
async function queue(f: F, lines: Line[], staleQuantity?: number) {
  const drain = f.service.drain.bind(f.service);
  f.service.drain = async () => {};
  const key = randomUUID();
  try {
    const { orderId } = await createWebCheckout(
      f.service,
      body(lines),
      key,
      "web",
      ORIGIN,
    );
    if (staleQuantity !== undefined)
      f.store.write((s) => {
        const o = s.orders.find((o) => o.id === orderId)!;
        const p = s.payments.find((p) => p.id === o.paymentId)!;
        const line = o.lines.find((l) => l.productId === PAN)!;
        const unit = o.catalogSnapshot!.find((c) => c.id === PAN)!.priceFils;
        const delta = (staleQuantity - line.quantity) * unit;
        line.quantity = staleQuantity;
        o.quote!.subtotalFils! += delta;
        o.quote!.totalFils! += delta;
        p.amountFils += delta;
      });
    return { key, orderId };
  } finally {
    f.service.drain = drain;
  }
}
const paymentOf = (f: F, orderId: string) =>
  f.store.read().payments.find((p) => p.orderId === orderId)!;
const jobOf = (f: F, orderId: string) =>
  f.store.read().jobs.find((j) => j.entityId === paymentOf(f, orderId).id)!;
async function drainRepeatedly(f: F) {
  for (let i = 0; i < 4; i++) {
    await f.service.drain();
    mock.timers.tick(60_000);
  }
}

test("stale 5-piece checkout: rejected before Paymennt, corrected to 6, recovered once across retries and tabs", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date(NOW) });
  const f = fixture();
  try {
    const stale = await queue(f, [{ productId: PAN, quantity: 6 }], 5);
    // Unaffected neighbours: a paid historical order and a pack + other product.
    const paid = await queue(f, [{ productId: PAN, quantity: 6 }], 2);
    f.store.write((s) => {
      const p = s.payments.find((p) => p.orderId === paid.orderId)!;
      p.status = "paid";
      s.jobs = s.jobs.filter((j) => j.entityId !== p.id);
    });
    const mixedLines = [
      { productId: PACK_6, quantity: 1 },
      { productId: OTHER, quantity: 1 },
    ];
    const mixed = await queue(f, mixedLines);
    const mixedQuote = quoteWebCheckout(f.service, {
      lines: mixedLines,
      zoneId: "jlt-cluster-c",
    });
    const paidBefore = JSON.stringify([
      f.store.read().orders.find((o) => o.id === paid.orderId),
      paymentOf(f, paid.orderId),
    ]);

    // 1. Worker: zero provider calls for the stale job, explicit durable outcome.
    await drainRepeatedly(f);
    assert.equal(
      f.calls.create,
      1,
      "only the pack + other job reached Paymennt",
    );
    assert.equal(paymentOf(f, mixed.orderId).status, "pending");
    assert.equal(paymentOf(f, mixed.orderId).amountFils, mixedQuote.totalFils);
    const rejected = paymentOf(f, stale.orderId);
    assert.equal(jobOf(f, stale.orderId).status, "failed");
    assert.equal(jobOf(f, stale.orderId).attempts, 1);
    assert.equal(jobOf(f, stale.orderId).lastError, MESSAGE);
    assert.equal(jobOf(f, stale.orderId).localRejection, "BELOW_MINIMUM");
    assert.equal(rejected.status, "cancelled");
    assert.deepEqual(rejected.localRejection, {
      code: "BELOW_MINIMUM",
      jobId: jobOf(f, stale.orderId).id,
      at: rejected.localRejection!.at,
    });
    assert.equal(rejected.url, undefined);
    assert.equal(rejected.providerCheckoutId, undefined);
    assert.equal(rejected.providerCreateAttemptedAt, undefined);
    assert.ok(verifiedLocalRejection(f.store.read(), rejected));

    // 2. Return page: clear minimum indication, no URL, no provider GET.
    const getsBefore = f.calls.get;
    const returned = await reconcileEmbeddedPayment(f.service, stale.key);
    assert.equal(f.calls.get, getsBefore, "nothing to reconcile at Paymennt");
    assert.equal(returned.paymentStatus, "cancelled");
    assert.equal(returned.rejection, "minimum_quantity");
    assert.equal(returned.url, null);
    assert.equal(returned.actionRequired, null);

    // 3. Resuming with the uncorrected cart names the minimum; no new key.
    await assert.rejects(
      recoverWebCheckout(f.service, {
        key: stale.key,
        checkout: body([{ productId: PAN, quantity: 5 }]),
      }),
      (e: unknown) =>
        e instanceof DomainError && e.status === 422 && e.message === MESSAGE,
    );
    assert.equal(
      Object.values(f.store.read().webCheckouts!).some((r) => r.recoveryKey),
      false,
    );

    // 4. Corrected to 6: a valid state and one stable replacement key.
    const corrected = body([{ productId: PAN, quantity: 6 }]);
    const first = await recoverWebCheckout(f.service, {
      key: stale.key,
      checkout: corrected,
    });
    assert.equal(first.changed, true);
    assert.ok(first.key && first.key !== stale.key);
    const replacement = first.key!;
    for (const key of [stale.key, stale.key, replacement]) {
      const again = await recoverWebCheckout(f.service, {
        key,
        checkout: corrected,
      });
      assert.equal(again.key, replacement, "same successor for every tab");
      assert.equal(again.quote?.eligible, true);
    }
    assert.equal(f.calls.create, 1, "recovery never creates a payment");

    // 5. New 6-piece checkout reaches fake Paymennt exactly once, even with
    //    concurrent tabs submitting the same replacement key.
    const tabs = await Promise.all([
      createWebCheckout(f.service, corrected, replacement, "web", ORIGIN),
      createWebCheckout(f.service, corrected, replacement, "web", ORIGIN),
      createWebCheckout(f.service, corrected, replacement, "web", ORIGIN),
    ]);
    await drainRepeatedly(f);
    assert.equal(f.calls.create, 2, "exactly one new provider create");
    const fresh = readWebCheckoutStatus(f.service, replacement);
    assert.equal(new Set(tabs.map((t) => t.orderId)).size, 1);
    assert.notEqual(fresh.orderId, stale.orderId);
    assert.equal(fresh.paymentStatus, "pending");
    assert.equal(
      fresh.url,
      "https://pay.test.paymennt.com/checkout/checkout-2",
    );
    assert.equal(fresh.rejection, undefined);
    assert.equal(
      fresh.amountFils,
      quoteWebCheckout(f.service, {
        lines: corrected.lines,
        zoneId: "jlt-cluster-c",
      }).totalFils,
    );

    // 6. Later recovery from the original tab follows the successor: same
    //    order and link, provider GET only, no duplicate attempt or stale URL.
    const later = await recoverWebCheckout(f.service, {
      key: stale.key,
      checkout: corrected,
    });
    assert.equal(later.key, replacement);
    assert.equal(later.status?.orderId, fresh.orderId);
    assert.equal(later.status?.url, fresh.url);
    assert.equal(f.calls.create, 2);
    assert.equal(readWebCheckoutStatus(f.service, stale.key).url, null);
    assert.equal(
      f.store.read().payments.filter((p) => p.status === "pending").length,
      2,
      "the mixed order and the corrected order only",
    );

    // 7. Paid historical order: byte-identical throughout.
    assert.equal(
      JSON.stringify([
        f.store.read().orders.find((o) => o.id === paid.orderId),
        paymentOf(f, paid.orderId),
      ]),
      paidBefore,
    );
  } finally {
    f.store.close();
    mock.timers.reset();
  }
});

test("uncertain stale jobs stay unpaid and held for review; recovery issues no key or link", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date(NOW) });
  const f = fixture();
  try {
    // a) an earlier attempt ended in a provider error and was retried;
    // b) an operator retry reset attempts but the provider error remains;
    // c) a create request was recorded as leaving this server.
    const retried = await queue(f, [{ productId: PAN, quantity: 6 }], 5);
    const reset = await queue(f, [{ productId: PAN, quantity: 6 }], 5);
    const attempted = await queue(f, [{ productId: PAN, quantity: 6 }], 5);
    f.store.write((s) => {
      const job = (orderId: string) =>
        s.jobs.find(
          (j) =>
            j.entityId === s.payments.find((p) => p.orderId === orderId)!.id,
        )!;
      Object.assign(job(retried.orderId), {
        attempts: 1,
        lastError: "Proveedor no disponible; reintento pendiente",
      });
      job(reset.orderId).lastError =
        "Proveedor no disponible; reintento pendiente";
      s.payments.find(
        (p) => p.orderId === attempted.orderId,
      )!.providerCreateAttemptedAt = new Date().toISOString();
    });
    await drainRepeatedly(f);
    assert.equal(f.calls.create, 0);
    for (const c of [retried, reset, attempted]) {
      const p = paymentOf(f, c.orderId);
      assert.equal(jobOf(f, c.orderId).status, "failed");
      assert.equal(jobOf(f, c.orderId).localRejection, undefined);
      assert.equal(p.status, "creating");
      assert.equal(p.localRejection, undefined);
      assert.equal(
        readWebCheckoutStatus(f.service, c.key).actionRequired,
        "review_payment",
      );
      // Reconciliation still asks Paymennt; nothing found means review, not retry.
      const gets = f.calls.get;
      await assert.rejects(
        recoverWebCheckout(f.service, {
          key: c.key,
          checkout: body([{ productId: PAN, quantity: 6 }]),
        }),
        (e: unknown) =>
          e instanceof DomainError &&
          e.status === 503 &&
          e.publicCode === "CHECKOUT_RECOVERY_UNVERIFIED",
      );
      assert.ok(f.calls.get > gets, "provider reconciliation preserved");
      const record = Object.values(f.store.read().webCheckouts!).find(
        (r) => r.orderId === c.orderId,
      )!;
      assert.equal(record.recoveryKey, undefined);
      assert.equal(record.supersededAt, undefined);
    }
    assert.equal(f.calls.create, 0);
  } finally {
    f.store.close();
    mock.timers.reset();
  }
});

test("a cancelled payment or failed job without the corroborated local record is never treated as uncontacted", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date(NOW) });
  const f = fixture();
  try {
    const stale = await queue(f, [{ productId: PAN, quantity: 6 }], 5);
    await drainRepeatedly(f);
    const state = () => f.store.read();
    const p = () => paymentOf(f, stale.orderId);
    assert.ok(verifiedLocalRejection(state(), p()));
    const variants: Array<(s: ReturnType<F["store"]["read"]>) => void> = [
      (s) => delete s.payments.find((x) => x.id === p().id)!.localRejection,
      (s) => {
        s.payments.find((x) => x.id === p().id)!.providerReference = "x";
      },
      (s) => {
        s.payments.find((x) => x.id === p().id)!.providerCreateAttemptedAt =
          new Date().toISOString();
      },
      (s) => {
        delete s.jobs.find((j) => j.entityId === p().id)!.localRejection;
      },
      (s) => {
        s.jobs.push({
          id: randomUUID(),
          kind: "payment",
          entityId: p().id,
          status: "failed",
          attempts: 1,
          nextAt: 0,
        });
      },
      (s) => {
        s.payments.find((x) => x.id === p().id)!.status = "failed";
      },
    ];
    for (const change of variants) {
      const copy = structuredClone(state());
      change(copy);
      const payment = copy.payments.find((x) => x.id === p().id)!;
      assert.equal(verifiedLocalRejection(copy, payment), false);
    }
    // An ordinary provider-cancelled payment still reconciles with Paymennt.
    f.store.write((s) => {
      delete s.payments.find((x) => x.id === p().id)!.localRejection;
    });
    const gets = f.calls.get;
    await assert.rejects(
      f.service.reconcile(p().id, { id: "admin", role: "admin" } as never),
    );
    assert.ok(f.calls.get > gets);
  } finally {
    f.store.close();
    mock.timers.reset();
  }
});
