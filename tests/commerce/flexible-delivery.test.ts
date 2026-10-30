import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/db/store";
import {
  zoneSeed,
  quoteOrder,
  publicDeliveryAreas,
} from "../../server/domain/zones";
import { zoneSchema } from "../../server/domain/model";
import {
  planFlexibleDelivery,
  applyFlexibleDelivery,
  approvedDeliveryFeesFils,
} from "../../server/domain/flexible-delivery";
import { CommerceService } from "../../server/domain/service";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import {
  createWebCheckout,
  quoteWebCheckout,
  resumeWebCheckout,
  readWebCheckoutStatus,
  addDays,
  dubaiToday,
} from "../../server/domain/web-checkout";
import { frozenCheckout } from "../../server/domain/frozen-checkout";
import { fixtureAddressGeo } from "../fixtures/website-address";
import { renderCustomerEmail } from "../../server/domain/customer-notifications";
import { ticketSnapshot } from "../../src/commerce/ticket-snapshot";
import { attachVerifiedAddresses } from "../../server/domain/website-address";

const flexibleZones = () =>
  zoneSeed.map((zone) => ({
    ...zone,
    deliveryPolicy: {
      mode: "flexible" as const,
      freeDeliveryThresholdFils: zone.minOrderAed! * 100,
      belowThresholdFeeFils: approvedDeliveryFeesFils[zone.minOrderAed!]!,
    },
  }));
for (const [threshold, fee] of Object.entries(approvedDeliveryFeesFils)) {
  test(`flexible delivery AED ${threshold}: below/exact/above, integer fils and no purchase floor`, () => {
    const zones = flexibleZones();
    const zone = zones.find((z) => z.minOrderAed === Number(threshold))!;
    for (const subtotal of [
      1,
      Number(threshold) * 100 - 1,
      Number(threshold) * 100,
      Number(threshold) * 100 + 1,
    ]) {
      const q = quoteOrder(
        zones,
        [{ productId: "fixture", quantity: 1 }],
        undefined,
        undefined,
        undefined,
        zone.id,
        [{ id: "fixture", name: "Fixture", priceFils: subtotal, active: true }],
      );
      assert.equal(q.eligible, true);
      assert.equal(q.minimumMet, subtotal >= Number(threshold) * 100);
      assert.equal(q.feeFils, q.minimumMet ? 0 : fee);
      assert.equal(q.totalFils, subtotal + q.feeFils!);
      assert.deepEqual(q.deliveryRule, {
        mode: "flexible",
        freeDeliveryThresholdFils: Number(threshold) * 100,
        belowThresholdFeeFils: fee,
      });
    }
  });
}
test("pickup, empty/invalid carts, coverage and legacy rules retain their boundaries", () => {
  const products = [
    { id: "fixture", name: "Fixture", priceFils: 1000, active: true },
  ];
  const lines = [{ productId: "fixture", quantity: 1 }];
  const quote = (
    zones = flexibleZones(),
    id = "marina",
    method: "delivery" | "pickup" = "delivery",
    cart = lines,
  ) =>
    quoteOrder(
      zones,
      cart,
      undefined,
      undefined,
      undefined,
      id,
      products,
      method,
    );
  assert.equal(quote().totalFils, 2500);
  assert.equal(quote(undefined, "unknown").eligible, false);
  assert.equal(quote(undefined, "marina", "pickup").totalFils, 1000);
  assert.equal(quote(undefined, "marina", "pickup").feeFils, 0);
  assert.equal(quote(undefined, "marina", "delivery", []).eligible, false);
  for (const quantity of [0, -1, 0.5])
    assert.equal(
      quote(undefined, "marina", "delivery", [
        { productId: "fixture", quantity },
      ]).eligible,
      false,
    );
  assert.equal(
    quote(zoneSeed as ReturnType<typeof flexibleZones>).eligible,
    false,
  );
  const zones = flexibleZones();
  zones[0]!.active = false;
  assert.equal(quote(zones, zones[0]!.id).eligible, false);
  assert.equal(
    publicDeliveryAreas(flexibleZones()).find((z) => z.id === "marina")!
      .deliveryFeeAed,
    15,
  );
  const malformed = flexibleZones();
  malformed.find(
    (z) => z.id === "marina",
  )!.deliveryPolicy.belowThresholdFeeFils = -1;
  assert.equal(quote(malformed).eligible, false);
  assert.equal(
    publicDeliveryAreas(malformed).some((z) => z.id === "marina"),
    false,
  );
  for (const value of [-1, 1.1, Number.MAX_SAFE_INTEGER])
    assert.equal(
      zoneSchema.safeParse({
        ...zones[1],
        deliveryPolicy: {
          mode: "flexible",
          freeDeliveryThresholdFils: 5000,
          belowThresholdFeeFils: value,
        },
      }).success,
      false,
    );
});
test("rollout validates all zones, backs up first, changes only zones and preserves overrides", async () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-flexible-"));
  const store = new Store(join(dir, "state.sqlite"), "test");
  try {
    const historical = fixture();
    try {
      await createWebCheckout(
        historical.service,
        historical.input(),
        randomUUID(),
        "web",
        "https://fixture.invalid",
      );
      historical.status("PAID");
      await historical.service.reconcile(
        historical.store.read().payments[0]!.id,
        { id: "fixture", role: "admin" },
      );
      const accepted = historical.store.read();
      store.write((s) => {
        s.orders = accepted.orders;
        s.payments = accepted.payments;
        s.catalog = accepted.catalog;
        s.conversations = accepted.conversations;
      });
    } finally {
      historical.store.close();
    }
    const before = store.read();
    const plan = planFlexibleDelivery(before.zones);
    assert.equal(plan.valid, true);
    assert.equal(plan.count, 94);
    const result = await applyFlexibleDelivery(store, dir, plan.digest);
    assert.equal(result.updated, 94);
    assert.ok(result.backupPath);
    const backup = new Store(result.backupPath!, "test");
    try {
      assert.deepEqual(backup.read(), before);
    } finally {
      backup.close();
    }
    const after = store.read();
    const { zones: _before, ...otherBefore } = before;
    const { zones: _after, ...otherAfter } = after;
    assert.deepEqual(otherAfter, otherBefore);
    assert.equal(planFlexibleDelivery(after.zones).count, 0);
    assert.equal(
      (
        await applyFlexibleDelivery(
          store,
          dir,
          planFlexibleDelivery(after.zones).digest,
        )
      ).backupPath,
      null,
    );
    store.write((s) => {
      s.zones[0]!.deliveryPolicy!.belowThresholdFeeFils = 1733;
    });
    assert.equal(planFlexibleDelivery(store.read().zones).count, 0);
    const bad = structuredClone(before.zones);
    bad[0]!.minOrderAed = 77;
    assert.equal(planFlexibleDelivery(bad).valid, false);
    assert.equal(
      planFlexibleDelivery([...before.zones, before.zones[0]!]).valid,
      false,
    );
    await assert.rejects(
      applyFlexibleDelivery(store, dir, plan.digest),
      /changed/,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("backup failure prevents mutation; concurrent zone edit after backup prevents apply", async () => {
  const store = new Store(":memory:", "test");
  const before = store.read();
  const digest = planFlexibleDelivery(before.zones).digest;
  const dir = mkdtempSync(join(tmpdir(), "3l-flex-race-"));
  try {
    store.backup = async () => {
      throw new Error("backup unavailable");
    };
    await assert.rejects(
      applyFlexibleDelivery(store, dir, digest),
      /backup unavailable/,
    );
    assert.deepEqual(store.read(), before);
    const original = Store.prototype.backup.bind(store);
    store.backup = async (path) => {
      await original(path);
      store.write((s) => {
        s.zones[0]!.version++;
      });
    };
    await assert.rejects(
      applyFlexibleDelivery(store, dir, digest),
      /Concurrent zone edit/,
    );
    assert.ok(store.read().zones.every((z) => !z.deliveryPolicy));
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixture() {
  const store = new Store(":memory:", "test");
  store.write((s) => {
    s.zones = flexibleZones();
    s.catalog = [
      {
        id: "fixture",
        name: "Synthetic product",
        priceFils: 4000,
        active: true,
        availability: "available",
      },
    ];
  });
  const bodies: Record<string, unknown>[] = [];
  let providerStatus = "PENDING";
  const checkouts = new Map<string, Record<string, unknown>>();
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url, init) => {
      if (init?.method === "POST") {
        assert.match(String(url), /\/checkout\/web$/);
        const body = JSON.parse(String(init.body));
        bodies.push(body);
        const id = randomUUID();
        checkouts.set(id, {
          ...body,
          id,
          redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
        });
        return Response.json({
          success: true,
          result: { ...checkouts.get(id), status: providerStatus },
        });
      }
      return Response.json({
        success: true,
        result: {
          ...checkouts.get(String(url).split("/").at(-1)!),
          status: providerStatus,
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
  service.deliveryAddressMode = "legacy";
  const input = () => ({
    lines: [{ productId: "fixture", quantity: 1 }],
    delivery: {
      zoneId: "marina",
      address: "Marina fixture address",
      building: "Fixture Tower",
      date: addDays(dubaiToday(), 2),
      slot: "4:00 PM – 9:00 PM",
    },
    customer: {
      name: "Synthetic Reviewer",
      phone: "0500000000",
      email: "fixture@example.invalid",
    },
    billing: { sameAsDelivery: true },
  });
  return {
    store,
    service,
    bodies,
    input,
    status: (value: string) => {
      providerStatus = value;
    },
  };
}
test("accepted fee reaches hosted checkout, survives rule edits, retries and paid reconciliation", async () => {
  const f = fixture();
  const key = randomUUID();
  try {
    const q = quoteWebCheckout(f.service, {
      lines: f.input().lines,
      zoneId: "marina",
    });
    assert.equal(q.totalFils, 5500);
    const result = await createWebCheckout(
      f.service,
      f.input(),
      key,
      "web",
      "https://fixture.invalid",
      q.quoteRevision,
    );
    assert.equal(result.amountFils, 5500);
    assert.equal(f.bodies[0]!.amount, 55);
    assert.equal((f.bodies[0]!.totals as { shipping: number }).shipping, 15);
    const accepted = f.store.read();
    assert.equal(
      accepted.orders[0]!.delivery!.addressVerification,
      "UNVERIFIED",
    );
    assert.equal(accepted.orders[0]!.state, "Awaiting Payment");
    assert.equal(
      frozenCheckout(accepted.orders[0]!, accepted.payments[0]!).totalFils,
      5500,
    );
    const admin = { id: "fixture-admin", role: "admin" as const };
    const zone = accepted.zones.find((z) => z.id === "marina")!;
    f.service.command(
      {
        type: "updateZone",
        zone: {
          ...zone,
          deliveryPolicy: {
            ...zone.deliveryPolicy!,
            belowThresholdFeeFils: 2500,
          },
        },
      },
      randomUUID(),
      admin,
    );
    assert.equal(
      quoteWebCheckout(f.service, { lines: f.input().lines, zoneId: "marina" })
        .totalFils,
      6500,
    );
    await createWebCheckout(
      f.service,
      f.input(),
      key,
      "web",
      "https://fixture.invalid",
    );
    assert.equal(readWebCheckoutStatus(f.service, key).amountFils, 5500);
    assert.equal(
      resumeWebCheckout(f.service, { key, checkout: f.input() }).changed,
      false,
    );
    assert.equal(f.bodies.length, 1);
    assert.deepEqual(f.store.read().orders, accepted.orders);
    f.status("PAID");
    await f.service.reconcile(accepted.payments[0]!.id, admin);
    const paid = f.store.read();
    assert.equal(paid.orders[0]!.state, "Confirmed");
    assert.equal(paid.payments[0]!.amountFils, 5500);
    assert.equal(paid.orders[0]!.quote!.feeFils, 1500);
    assert.ok(ticketSnapshot(paid.orders[0]!));
    const email = renderCustomerEmail("ORDER_PAID", paid.orders[0]!, {
      paidAmountFils: 5500,
    });
    assert.match(email.body, /Delivery fee: AED 15.00/);
    assert.match(email.html, /Delivery fee: AED 15.00/);
    const frozen = JSON.stringify(paid.orders);
    await f.service.reconcile(paid.payments[0]!.id, admin);
    assert.equal(JSON.stringify(f.store.read().orders), frozen);
    assert.equal(f.bodies.length, 1);
  } finally {
    f.store.close();
  }
});
test("changed quote revision fails atomically; terminal replacement revalidates new fee", async () => {
  const f = fixture();
  try {
    const q = quoteWebCheckout(f.service, {
      lines: f.input().lines,
      zoneId: "marina",
    });
    f.store.write((s) => {
      s.zones.find(
        (z) => z.id === "marina",
      )!.deliveryPolicy!.belowThresholdFeeFils = 2000;
    });
    await assert.rejects(
      createWebCheckout(
        f.service,
        f.input(),
        randomUUID(),
        "web",
        "https://fixture.invalid",
        q.quoteRevision,
      ),
      /changed/,
    );
    assert.equal(f.store.read().orders.length, 0);
    const key = randomUUID();
    await createWebCheckout(
      f.service,
      f.input(),
      key,
      "web",
      "https://fixture.invalid",
    );
    f.status("EXPIRED");
    await f.service.reconcile(f.store.read().payments[0]!.id, {
      id: "fixture",
      role: "admin",
    });
    f.store.write((s) => {
      s.zones.find(
        (z) => z.id === "marina",
      )!.deliveryPolicy!.belowThresholdFeeFils = 2500;
    });
    const next = resumeWebCheckout(f.service, { key, checkout: f.input() });
    const newOrder = await createWebCheckout(
      f.service,
      f.input(),
      next.key,
      "web",
      "https://fixture.invalid",
    );
    assert.equal(newOrder.amountFils, 6500);
    assert.equal(f.store.read().payments[0]!.amountFils, 6000);
  } finally {
    f.store.close();
  }
});
test("Google canonical area defeats manipulated client zone; legacy and Google remain independent", async () => {
  const f = fixture();
  try {
    f.service.deliveryAddressMode = "google";
    const input = f.input();
    input.delivery.zoneId = "jlt-cluster-c";
    const result = await createWebCheckout(
      f.service,
      input,
      randomUUID(),
      "web",
      "https://fixture.invalid",
    );
    assert.equal(result.amountFils, 5500);
    assert.equal(f.store.read().orders[0]!.delivery!.zoneId, "marina");
    assert.equal(
      f.store.read().orders[0]!.delivery!.addressVerification,
      "VERIFIED",
    );
    const other = f.input();
    other.delivery.address = "Unresolvable address";
    await assert.rejects(
      createWebCheckout(
        f.service,
        other,
        randomUUID(),
        "web",
        "https://fixture.invalid",
      ),
    );
    for (const patch of [
      { feeFils: 0 },
      { deliveryPolicy: { mode: "flexible" } },
      { discountFils: 4000 },
    ]) {
      await assert.rejects(
        createWebCheckout(
          f.service,
          { ...f.input(), ...patch },
          randomUUID(),
          "web",
          "https://fixture.invalid",
        ),
      );
    }
  } finally {
    f.store.close();
  }
});

test("flexible delivery cannot bypass approved geographic coverage", async () => {
  const f = fixture();
  const dir = mkdtempSync(join(tmpdir(), "3l-flex-coverage-"));
  const file = join(dir, "addresses.json");
  writeFileSync(
    file,
    JSON.stringify([
      {
        searchable: true,
        address: "Outside public fixture",
        building: "Fixture Tower",
        community: "Marina",
        location: { lat: 25.45, lng: 55.4 },
      },
    ]),
  );
  try {
    f.service.deliveryAddressMode = "google";
    f.service.geo = attachVerifiedAddresses(
      { resolve: () => null },
      file,
      undefined,
      true,
    );
    const ref = (
      await f.service.geo.addressProvider!.suggest("Outside public")
    )[0]!.id;
    const body = f.input();
    Object.assign(body.delivery, {
      address: "Outside public fixture",
      addressRef: ref,
    });
    await assert.rejects(
      createWebCheckout(
        f.service,
        body,
        randomUUID(),
        "web",
        "https://fixture.invalid",
      ),
      /outside our current delivery coverage/,
    );
    assert.equal(f.store.read().orders.length, 0);
    assert.equal(f.bodies.length, 0);
  } finally {
    f.store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI dry-run is read-only and apply requires the exact reviewed digest", () => {
  const dir = mkdtempSync(join(tmpdir(), "3l-flex-cli-"));
  const path = join(dir, "state.sqlite");
  const store = new Store(path, "test");
  store.close();
  const before = readFileSync(path);
  const run = (...args: string[]) =>
    spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/flexible-delivery.ts", ...args],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DB_PATH: path,
          BACKUP_DIR: join(dir, "backups"),
        },
      },
    );
  try {
    const dryRun = run("dry-run");
    assert.equal(dryRun.status, 0, dryRun.stderr);
    const plan = JSON.parse(dryRun.stdout);
    assert.equal(plan.valid, true);
    assert.equal(plan.count, 94);
    assert.deepEqual(readFileSync(path), before);
    assert.notEqual(run("apply", "not-reviewed").status, 0);
    assert.deepEqual(readFileSync(path), before);
    const apply = run("apply", plan.digest);
    assert.equal(apply.status, 0, apply.stderr);
    const result = JSON.parse(apply.stdout);
    assert.equal(result.updated, 94);
    assert.ok(result.backupPath);
    assert.equal(JSON.parse(run("dry-run").stdout).count, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
