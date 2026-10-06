import { fixtureAddressGeo } from "../fixtures/website-address";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import {
  ResendEmailProvider,
  resendFromEnv,
} from "../../server/adapters/resend";
import { validateCatalog } from "../../server/domain/catalog";
import {
  createWebCheckout,
  dubaiToday,
  addDays,
  normalizeCheckout,
  readWebCheckoutStatus,
} from "../../server/domain/web-checkout";
import { reconcileEmbeddedPayment } from "../../server/domain/embedded-checkout";
import { assignPublicOrderNumber } from "../../server/domain/order-number";
import {
  customerEventFor,
  dispatchCustomerNotifications,
  recoverInterruptedCustomerNotifications,
  type CustomerEmailProvider,
} from "../../server/domain/customer-notifications";
import {
  dispatchOperationsNotifications,
  operationsRecipients,
} from "../../server/domain/notifications";
import { zoneSeed, publicDeliveryAreas } from "../../server/domain/zones";
import { formatOrderNumber, orderReference } from "../../shared/order-number";
import { exactArea, searchAreas } from "../../shared/area-search";
import { PICKUP_LOCATION } from "../../shared/pickup-location";
import {
  earliestFulfillmentDate,
  earliestProductionDate,
  nextDayClosed,
} from "../../shared/commerce-policy";
import type { Actor, Order, State } from "../../server/domain/model";

const sku = "conchas-traditional-chocolate-mini-40-g";
const admin: Actor = { id: "liza", role: "admin" };
const customer = {
  firstName: "Ana María",
  lastName: "López Ortega",
  phone: "0500000000",
  email: "ana@example.invalid",
};
const delivery = (over: Record<string, unknown> = {}) => ({
  lines: [{ productId: sku, quantity: 6 }],
  delivery: {
    zoneId: "jlt-cluster-c",
    address: "Fixture street only",
    building: "Fixture Tower",
    date: addDays(dubaiToday(), 2),
    slot: "4:00 PM – 9:00 PM",
  },
  customer,
  billing: { sameAsDelivery: true },
  ...over,
});
const pickup = (over: Record<string, unknown> = {}) => ({
  fulfillmentMethod: "pickup",
  lines: [{ productId: sku, quantity: 1 }],
  pickup: {
    pickupDate: addDays(dubaiToday(), 2),
    preferredTime: "4:00 PM – 9:00 PM",
  },
  customer,
  // The minimum Paymennt requires: a name, one address line, city, country.
  billing: {
    sameAsDelivery: false,
    name: "Ana María López Ortega",
    address1: "Fixture billing street",
    city: "Dubai",
    country: "AE",
  },
  ...over,
});
/** A fake Paymennt: every checkout it has seen reports the status set here. */
function fixture(path = ":memory:") {
  const store = new Store(path, "test");
  if (!store.read().catalog?.length)
    store.write((s) => {
      s.catalog = validateCatalog(
        JSON.parse(readFileSync("data-imports/liza-current-menu.json", "utf8")),
      );
    });
  const seen = new Map<string, Record<string, unknown>>();
  let status = "PENDING";
  let posts = 0;
  const provider = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url, init) => {
      if (init?.method === "POST") {
        posts++;
        const body = JSON.parse(String(init.body));
        const id = `checkout-${body.requestId}`;
        seen.set(id, { ...body, id });
        return Response.json({
          success: true,
          result: {
            ...body,
            id,
            status: "PENDING",
            redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
          },
        });
      }
      const target = String(url);
      const found = target.includes("?requestId=")
        ? [...seen.values()].find((c) => target.endsWith(`=${c.requestId}`))
        : seen.get(target.split("/").at(-1)!);
      const result = {
        ...found,
        status,
        redirectUrl: `https://pay.test.paymennt.com/checkout/${found?.id}`,
      };
      return Response.json({
        success: true,
        result: target.includes("?requestId=")
          ? { totalPages: 1, content: [result] }
          : result,
      });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    provider,
    fixtureAddressGeo,
  );
  // As in Production: the customer's chosen area id is the authority.
  service.deliveryAddressMode = "legacy";
  const place = async (input: unknown, key = randomUUID()) => {
    await createWebCheckout(
      service,
      input,
      key,
      "web",
      "https://test.example.invalid",
    );
    return key;
  };
  const pay = async (key: string) => {
    status = "PAID";
    await reconcileEmbeddedPayment(service, key);
    return readWebCheckoutStatus(service, key);
  };
  const order = (key: string) => {
    const id = readWebCheckoutStatus(service, key).orderId;
    return store.read().orders.find((o) => o.id === id)!;
  };
  /** As in Operations: the operator takes the order, then moves it. */
  const take = (key: string) => {
    const c = store
      .read()
      .conversations.find((c) => c.id === order(key).conversationId)!;
    if (c.assignedAgent !== admin.id)
      service.command(
        { type: "assign", id: c.id, version: c.version, agent: admin.id },
        randomUUID(),
        admin,
      );
  };
  const move = (
    key: string,
    state: Order["state"],
    idempotency = randomUUID(),
  ) => {
    take(key);
    const o = order(key);
    return service.command(
      { type: "transition", id: o.id, version: o.version, state },
      idempotency,
      admin,
    );
  };
  return {
    store,
    service,
    place,
    pay,
    order,
    move,
    take,
    posts: () => posts,
    seen,
  };
}
const fakeEmail = () => {
  const sent: {
    to: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }[] = [];
  const provider: CustomerEmailProvider = {
    name: "fake-resend",
    async send(email) {
      sent.push(email);
      return { messageId: `msg-${sent.length}` };
    },
  };
  return { sent, provider };
};

// ---- Public order numbers -------------------------------------------------

test("order numbers are zero-padded to three digits and grow beyond them", () => {
  for (const [n, text] of [
    [1, "#001"],
    [7, "#007"],
    [9, "#009"],
    [10, "#010"],
    [71, "#071"],
    [99, "#099"],
    [100, "#100"],
    [999, "#999"],
    [1000, "#1000"],
    [12345, "#12345"],
  ] as const)
    assert.equal(formatOrderNumber(n), text);
  for (const bad of [0, -1, 1.5, Number.NaN])
    assert.throws(() => formatOrderNumber(bad));
  assert.equal(orderReference({ id: "TL-ABCD1234" }), "TL-ABCD1234");
  assert.equal(
    orderReference({ id: "TL-ABCD1234", publicOrderNumber: 3 }),
    "#003",
  );
});

test("a number is issued once, when the order is first paid; the internal ID never changes", async () => {
  const f = fixture();
  try {
    const key = await f.place(delivery());
    const before = f.order(key);
    assert.match(before.id, /^TL-[0-9A-F]{8}$/);
    // Unpaid: no number is spent on an abandoned checkout.
    assert.equal(before.publicOrderNumber, undefined);
    assert.equal(readWebCheckoutStatus(f.service, key).orderNumber, null);
    const paid = await f.pay(key);
    assert.equal(paid.orderNumber, "#001");
    assert.equal(paid.orderId, before.id);
    assert.equal(f.order(key).publicOrderNumber, 1);
    // Paymennt was given the internal references, not the public number.
    const sent = [...f.seen.values()][0]!;
    assert.equal(sent.orderId, before.id);
    assert.equal(sent.requestId, before.paymentId);
  } finally {
    f.store.close();
  }
});

test("provider retries, repeated reconciliation and a repeated checkout request never issue a second number", async () => {
  const f = fixture();
  try {
    const key = await f.place(delivery());
    await f.place(delivery(), key);
    assert.equal(f.posts(), 1);
    await f.pay(key);
    for (let i = 0; i < 5; i++) await reconcileEmbeddedPayment(f.service, key);
    await f.place(delivery(), key);
    assert.equal(f.order(key).publicOrderNumber, 1);
    assert.equal(f.store.read().orderNumberSequence, 1);
    assert.equal(f.store.read().operationsNotifications?.length, 1);
  } finally {
    f.store.close();
  }
});

test("orders paid at the same time receive distinct consecutive numbers", async () => {
  const f = fixture();
  try {
    const keys = await Promise.all(
      Array.from({ length: 12 }, () => f.place(delivery())),
    );
    await Promise.all(keys.map((key) => f.pay(key)));
    const numbers = keys.map((key) => f.order(key).publicOrderNumber!);
    assert.deepEqual(
      [...numbers].sort((a, b) => a - b),
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    assert.equal(new Set(numbers).size, 12);
  } finally {
    f.store.close();
  }
});

test("two processes writing the same database cannot issue the same number", async () => {
  const dir = mkdtempSync(join(tmpdir(), "order-number-"));
  const path = join(dir, "store.sqlite");
  new Store(path, "test").close();
  const worker = `
    import { Store } from "./server/db/store";
    import { assignPublicOrderNumber } from "./server/domain/order-number";
    const [path, name] = process.argv.slice(-2);
    const store = new Store(path, "test");
    const issued = [];
    for (let i = 0; i < 25; i++)
      issued.push(store.write((s) => {
        const order = { id: name + "-" + i, conversationId: "c", state: "Confirmed", version: 0, lines: [], quote: null, audit: [] };
        s.orders.push(order);
        return assignPublicOrderNumber(s, order);
      }));
    console.log(JSON.stringify(issued));
  `;
  try {
    const run = (name: string) =>
      new Promise<number[]>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["--import", "tsx", "--input-type=module", "-e", worker, path, name],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        let out = "";
        child.stdout.on("data", (d) => (out += d));
        child.on("exit", (code) =>
          code === 0
            ? resolve(JSON.parse(out.trim().split("\n").at(-1)!))
            : reject(new Error("worker failed")),
        );
      });
    const all = (await Promise.all(["a", "b", "c"].map(run))).flat();
    assert.equal(all.length, 75);
    assert.equal(new Set(all).size, 75);
    assert.deepEqual(
      [...all].sort((x, y) => x - y),
      Array.from({ length: 75 }, (_, i) => i + 1),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("numbers are never reused, and orders paid before the sequence existed stay untouched", () => {
  const legacy = {
    id: "TL-LEGACY01",
    conversationId: "c",
    state: "Delivered",
    version: 3,
    lines: [],
    quote: null,
    paidAt: "2026-10-01T10:00:00.000Z",
    audit: [],
  } as Order;
  const s = { orders: [legacy], events: {} } as unknown as State;
  const make = (id: string) => {
    const o = {
      id,
      conversationId: "c",
      state: "Confirmed",
      version: 0,
      lines: [],
      quote: null,
      audit: [],
    } as Order;
    s.orders.push(o);
    return o;
  };
  const first = make("TL-NEW00001");
  assert.equal(assignPublicOrderNumber(s, first), 1);
  // Cancelling does not hand the number to the next order.
  first.state = "Cancelled";
  assert.equal(assignPublicOrderNumber(s, make("TL-NEW00002")), 2);
  assert.equal(assignPublicOrderNumber(s, first), 1);
  // A restored older counter can never fall behind a number already issued.
  s.orderNumberSequence = 0;
  assert.equal(assignPublicOrderNumber(s, make("TL-NEW00003")), 3);
  // The historical order was not renumbered and still has a usable reference.
  assert.equal(legacy.publicOrderNumber, undefined);
  assert.equal(orderReference(legacy), "TL-LEGACY01");
});

// ---- Names, pickup, country -----------------------------------------------

test("first and last name are stored separately and reach the provider as given", async () => {
  const f = fixture();
  try {
    const key = await f.place(delivery());
    const o = f.order(key);
    assert.equal(o.customerDetails?.firstName, "Ana María");
    assert.equal(o.customerDetails?.lastName, "López Ortega");
    const conversation = f.store
      .read()
      .conversations.find((c) => c.id === o.conversationId)!;
    assert.equal(conversation.customer, "Ana María López Ortega");
    const sent = [...f.seen.values()][0] as {
      customer: Record<string, string>;
      billingAddress: Record<string, string>;
    };
    // Not re-split on whitespace: a two-word first name stays a first name.
    assert.equal(sent.customer.firstName, "Ana María");
    assert.equal(sent.customer.lastName, "López Ortega");
    assert.equal(sent.billingAddress.country, "AE");
    assert.equal(
      readWebCheckoutStatus(f.service, key).summary?.customerName,
      "Ana María López Ortega",
    );
  } finally {
    f.store.close();
  }
});

test("a checkout needs both names; a single legacy name is still accepted", () => {
  assert.throws(() =>
    normalizeCheckout(
      delivery({ customer: { ...customer, lastName: undefined } }),
    ),
  );
  assert.throws(() =>
    normalizeCheckout(delivery({ customer: { ...customer, firstName: " " } })),
  );
  const legacy = normalizeCheckout(
    delivery({
      customer: {
        name: "Legacy Client",
        phone: customer.phone,
        email: customer.email,
      },
    }),
  );
  assert.equal(legacy.name, "Legacy Client");
  assert.equal(legacy.details?.firstName, undefined);
});

test("pickup: no area or delivery address, only the billing minimum the provider requires", async () => {
  const f = fixture();
  try {
    const key = await f.place(pickup());
    const o = f.order(key);
    assert.equal(o.fulfillmentMethod, "pickup");
    assert.equal(o.delivery, undefined);
    assert.equal(o.manualZoneId, undefined);
    assert.equal(o.quote?.zoneId, null);
    assert.deepEqual(o.pickup, pickup().pickup);
    const sent = [...f.seen.values()][0] as Record<string, unknown>;
    assert.equal(sent.deliveryAddress, undefined);
    // Exactly what the customer typed, in the UAE; never the shop's address.
    assert.deepEqual(sent.billingAddress, {
      name: "Ana María López Ortega",
      address1: "Fixture billing street",
      city: "Dubai",
      country: "AE",
    });
    assert.ok(!JSON.stringify(sent.billingAddress).includes("Golositalia"));
    // Pickup cannot borrow a delivery address it does not have.
    await assert.rejects(
      f.place(pickup({ billing: { sameAsDelivery: true } })),
    );
    await assert.rejects(
      f.place(
        pickup({
          billing: {
            sameAsDelivery: false,
            name: "A",
            city: "Dubai",
            country: "AE",
          },
        }),
      ),
    );
    // A pickup order that smuggles in a delivery block is refused.
    await assert.rejects(
      f.place({ ...pickup(), delivery: delivery().delivery }),
    );
  } finally {
    f.store.close();
  }
});

test("pickup point is named 3L Pastelerías at the approved address", () => {
  assert.equal(PICKUP_LOCATION.name, "3L Pastelerías");
  assert.deepEqual(PICKUP_LOCATION.lines, [
    "Golositalia JLT",
    "Jumeirah Lakes Towers",
    "Cluster C",
    "Retail Shop C6/A",
    "Dubai, UAE",
  ]);
});

// ---- Delivery area search -------------------------------------------------

const areas = publicDeliveryAreas(zoneSeed);
const names = (text: string, limit?: number) =>
  searchAreas(areas, text, limit).map((m) => m.area.name);

test("typing part of an area suggests approved areas only", () => {
  assert.deepEqual(names("Jumei", 7), [
    "Jumeirah 1",
    "Jumeirah 2",
    "Jumeirah 3",
    "Jumeirah Golf Estate",
    "Jumeirah Heights",
    "Jumeirah Island",
    "Jumeirah Park",
  ]);
  assert.deepEqual(names("Dubai Mar"), ["Marina"]);
  assert.ok(names("Barsh").every((n) => n.includes("Barsha")));
  assert.equal(names("Barsh").length, 5);
  assert.ok(names("JLT", 20).every((n) => n.includes("JLT")));
  assert.equal(names("JLT", 20).length, 16);
  assert.ok(names("Jumeirah Lakes Towers", 20).length >= 15);
  // Every suggestion is one of the approved areas, by id.
  const ids = new Set(areas.map((a) => a.id));
  for (const q of ["a", "ju", "palm", "dubai", "hills"])
    assert.ok(searchAreas(areas, q).every((m) => ids.has(m.area.id)));
});

test("aliases and exact names resolve to one canonical area", () => {
  for (const [text, id] of [
    ["Marina", "marina"],
    ["dubai marina", "marina"],
    ["Jumeirah Village Circle", "jvc"],
    ["JVC", "jvc"],
    ["Downtown Dubai", "downtown"],
    ["Jumeirah Islands", "jumeirah-island"],
    ["Jumeirah Lakes Towers Cluster C", "jlt-cluster-c"],
    ["  MOTOR   city ", "motorcity"],
  ])
    assert.equal(exactArea(areas, text!)?.id, id);
  // A generic or partial label never selects an area by itself.
  for (const text of ["JLT", "Jumeirah", "Palm", "Al Barsha", ""])
    assert.equal(exactArea(areas, text), null);
});

test("reasonable misspellings still suggest; unsupported areas suggest nothing", () => {
  assert.deepEqual(names("Mraina"), ["Marina"]);
  assert.deepEqual(names("Jumeriah Isl"), ["Jumeirah Island"]);
  assert.deepEqual(names("Arabian Ranchs"), ["Arabian Ranches"]);
  assert.ok(names("Discovry Gardens").includes("Discovery Gardens"));
  for (const text of [
    "Sharjah",
    "Abu Dhabi",
    "Ajman",
    "zzzz",
    "Business Bay",
    "<script>",
  ])
    assert.deepEqual(names(text), []);
});

test("the minimum comes from the canonical zone, and free text can never be checked out", async () => {
  const f = fixture();
  try {
    // Typed text is not an area: only an approved id is accepted by the server.
    for (const zoneId of [
      "Marina",
      "Dubai Marina",
      "jumei",
      "marina ",
      "sharjah",
    ])
      await assert.rejects(
        f.place(delivery({ delivery: { ...delivery().delivery, zoneId } })),
      );
    // Marina's approved minimum is AED 50: six conchas (AED 66) pass, one (AED 11) does not.
    const marina = {
      ...delivery().delivery,
      zoneId: exactArea(areas, "dubai marina")!.id,
    };
    const key = await f.place(delivery({ delivery: marina }));
    assert.equal(f.order(key).quote?.minOrderAed, 50);
    assert.equal(f.order(key).quote?.zoneId, "marina");
    await assert.rejects(
      f.place(
        delivery({
          lines: [{ productId: sku, quantity: 1 }],
          delivery: marina,
        }),
      ),
    );
    // The approved table itself is unchanged by search.
    assert.equal(zoneSeed.length, 94);
    assert.equal(zoneSeed.find((z) => z.id === "marina")!.minOrderAed, 50);
  } finally {
    f.store.close();
  }
});

// ---- 9 PM cutoff ------------------------------------------------------------

test("cutoff across the evening and past midnight", () => {
  const at = (iso: string) => new Date(`${iso}+04:00`);
  for (const [time, closed, production] of [
    ["2026-10-06T20:59:00", false, "2026-10-07"],
    ["2026-10-06T21:00:00", false, "2026-10-07"],
    ["2026-10-06T21:00:59", false, "2026-10-07"],
    ["2026-10-06T21:01:00", true, "2026-10-08"],
    ["2026-10-06T23:59:00", true, "2026-10-08"],
    // A new Dubai day: the ordinary next-day calculation, from the new date.
    ["2026-10-07T00:00:00", false, "2026-10-08"],
    ["2026-10-07T00:01:00", false, "2026-10-08"],
    ["2026-10-07T20:59:00", false, "2026-10-08"],
    ["2026-10-07T21:01:00", true, "2026-10-09"],
  ] as const) {
    assert.equal(nextDayClosed(at(time)), closed, time);
    assert.equal(earliestProductionDate(at(time)), production, time);
  }
  // Product lead time and the cutoff combine; the later date wins.
  assert.equal(
    earliestFulfillmentDate(at("2026-10-06T10:00:00"), 12),
    "2026-10-07",
  );
  assert.equal(
    earliestFulfillmentDate(at("2026-10-06T10:00:00"), 24),
    "2026-10-07",
  );
  assert.equal(
    earliestFulfillmentDate(at("2026-10-06T21:00:00"), 12),
    "2026-10-07",
  );
  assert.equal(
    earliestFulfillmentDate(at("2026-10-06T21:00:00"), 24),
    "2026-10-08",
  );
  assert.equal(
    earliestFulfillmentDate(at("2026-10-06T21:01:00"), 12),
    "2026-10-08",
  );
  assert.equal(
    earliestFulfillmentDate(at("2026-10-06T21:01:00"), 24),
    "2026-10-08",
  );
  assert.equal(
    earliestFulfillmentDate(at("2026-10-06T23:59:00"), 24),
    "2026-10-08",
  );
  assert.equal(
    earliestFulfillmentDate(at("2026-10-07T00:01:00"), 12),
    "2026-10-08",
  );
  assert.equal(
    earliestFulfillmentDate(at("2026-10-07T00:01:00"), 24),
    "2026-10-08",
  );
});

// ---- Internal WhatsApp event ------------------------------------------------

test("a paid order records one WhatsApp alert per configured recipient and sends nothing", async () => {
  // The manager's number is private configuration; a placeholder stands in here.
  const manager = "+971500000001";
  assert.deepEqual(
    operationsRecipients().map((r) => r.name),
    ["Liza"],
  );
  assert.deepEqual(
    operationsRecipients("not a number").map((r) => r.name),
    ["Liza"],
  );
  assert.deepEqual(
    operationsRecipients("+971 50 000 0001").map((r) => [r.name, r.phone]),
    [
      ["Liza", "+971521683319"],
      ["3L Manager", manager],
    ],
  );
  const f = fixture();
  f.service.operationsManagerPhone = manager;
  try {
    const key = await f.place(pickup());
    await f.pay(key);
    await reconcileEmbeddedPayment(f.service, key);
    const rows = f.store.read().operationsNotifications!;
    assert.deepEqual(
      rows.map((r) => r.recipient.name),
      ["Liza", "3L Manager"],
    );
    assert.ok(
      rows.every(
        (r) =>
          r.status === "pending-whatsapp-delivery" &&
          r.attempts === 0 &&
          !r.sentAt,
      ),
    );
    assert.equal(rows[0]!.publicOrderNumber, 1);
    const message = rows[0]!.message;
    assert.match(message, /New paid order #001/);
    assert.match(message, /Customer: Ana María López Ortega/);
    assert.match(message, /PICKUP at 3L Pastelerías/);
    assert.match(message, /4:00 PM – 9:00 PM/);
    assert.match(message, /Total paid: AED 11\.00/);
    assert.match(message, /1 × /);
    // No contact, address or payment-instrument detail.
    for (const secret of [
      "ana@example.invalid",
      "0500000000",
      "+9715",
      "Fixture billing street",
      "card",
      "checkout-",
    ])
      assert.ok(!message.includes(secret), secret);
    // Outbound disabled: the dispatcher touches nothing and reports nothing as sent.
    let calls = 0;
    const result = await dispatchOperationsNotifications(f.store, {
      outboundEnabled: false,
      notifier: { send: async () => (calls++, { providerId: "x" }) },
    });
    assert.equal(result.skipped, "outbound-disabled");
    assert.equal(calls, 0);
    assert.ok(
      f.store
        .read()
        .operationsNotifications!.every(
          (r) => r.status === "pending-whatsapp-delivery",
        ),
    );
  } finally {
    f.store.close();
  }
});

// ---- Customer emails --------------------------------------------------------

test("only real transitions announce anything, and each to the right kind of order", () => {
  const d = { fulfillmentMethod: "delivery" } as const,
    p = { fulfillmentMethod: "pickup" } as const;
  assert.equal(
    customerEventFor(d, "Confirmed", "Production"),
    "ORDER_PRODUCTION_STARTED",
  );
  assert.equal(
    customerEventFor(p, "Confirmed", "Production"),
    "ORDER_PRODUCTION_STARTED",
  );
  assert.equal(
    customerEventFor(p, "Production", "Ready"),
    "ORDER_READY_FOR_PICKUP",
  );
  assert.equal(customerEventFor(d, "Production", "Ready"), null);
  assert.equal(
    customerEventFor(d, "Ready", "Out for Delivery"),
    "ORDER_OUT_FOR_DELIVERY",
  );
  assert.equal(customerEventFor(p, "Ready", "Out for Delivery"), null);
  for (const [from, to] of [
    ["Paid", "Confirmed"],
    ["Awaiting Payment", "Paid"],
    ["Out for Delivery", "Delivered"],
    ["Ready", "Delivered"],
  ] as const) {
    assert.equal(customerEventFor(d, from, to), null);
    assert.equal(customerEventFor(p, from, to), null);
  }
});

test("delivery: production email once, nothing at Ready, on-the-way email once", async () => {
  const f = fixture();
  const mail = fakeEmail();
  try {
    const key = await f.place(delivery());
    await f.pay(key);
    // Paying and viewing the order announce nothing to the customer.
    assert.equal(f.store.read().customerNotifications, undefined);
    f.move(key, "Production");
    f.move(key, "Ready");
    assert.deepEqual(
      f.store.read().customerNotifications!.map((n) => n.event),
      ["ORDER_PRODUCTION_STARTED"],
    );
    f.move(key, "Out for Delivery");
    f.move(key, "Delivered");
    const rows = f.store.read().customerNotifications!;
    assert.deepEqual(
      rows.map((n) => n.event),
      ["ORDER_PRODUCTION_STARTED", "ORDER_OUT_FOR_DELIVERY"],
    );
    assert.ok(
      rows.every(
        (n) =>
          n.status === "pending" &&
          n.attemptCount === 0 &&
          n.channel === "email" &&
          n.publicOrderNumber === 1 &&
          n.orderId === f.order(key).id,
      ),
    );
    assert.equal(rows[0]!.subject, "Your 3L order #001 is now being prepared");
    assert.match(
      rows[0]!.body,
      /^Hi Ana María,\n\nGood news — your 3L order #001 is now being prepared by our team\./,
    );
    assert.match(rows[0]!.body, /Delivery: .*4:00 PM – 9:00 PM/);
    assert.match(
      rows[0]!.body,
      /We'll let you know as soon as it's ready\.\n\n3L Pastelerías$/,
    );
    assert.equal(rows[1]!.subject, "Your 3L order #001 is on the way");
    assert.match(rows[1]!.body, /Your 3L order #001 is on the way\./);
    assert.match(rows[1]!.body, /Delivering to: JLT Cluster C/);
    // Area only: no street, building, phone or invented support address.
    for (const row of rows)
      for (const leak of [
        "Fixture street",
        "Fixture Tower",
        "0500000000",
        "@",
        "pickup",
      ])
        assert.ok(!row.body.includes(leak), leak);
    await dispatchCustomerNotifications(f.store, mail.provider);
    assert.deepEqual(
      mail.sent.map((m) => [m.to, m.subject]),
      [
        ["ana@example.invalid", "Your 3L order #001 is now being prepared"],
        ["ana@example.invalid", "Your 3L order #001 is on the way"],
      ],
    );
    const done = f.store.read().customerNotifications!;
    assert.ok(
      done.every(
        (n) =>
          n.status === "sent" &&
          n.attemptCount === 1 &&
          n.provider === "fake-resend" &&
          n.providerMessageId &&
          n.sentAt &&
          n.lastAttemptAt,
      ),
    );
    // The outbox row's ID is the provider idempotency key.
    assert.deepEqual(
      mail.sent.map((m) => m.idempotencyKey),
      done.map((n) => n.id),
    );
  } finally {
    f.store.close();
  }
});

test("pickup: production email once, ready-for-pickup email once, never an on-the-way email", async () => {
  const f = fixture();
  try {
    const key = await f.place(pickup());
    await f.pay(key);
    f.move(key, "Production");
    f.move(key, "Ready");
    // Pickup has no Out for Delivery step at all.
    assert.throws(() => f.move(key, "Out for Delivery"));
    f.move(key, "Delivered");
    const rows = f.store.read().customerNotifications!;
    assert.deepEqual(
      rows.map((n) => n.event),
      ["ORDER_PRODUCTION_STARTED", "ORDER_READY_FOR_PICKUP"],
    );
    assert.equal(rows[1]!.subject, "Your 3L order #001 is ready for pickup");
    assert.match(rows[0]!.body, /Pickup: .*4:00 PM – 9:00 PM/);
    assert.match(
      rows[1]!.body,
      /3L Pastelerías\nGolositalia JLT\nJumeirah Lakes Towers\nCluster C\nRetail Shop C6\/A\nDubai, UAE/,
    );
    assert.match(rows[1]!.body, /Pickup: .*4:00 PM – 9:00 PM/);
    for (const row of rows)
      assert.ok(!/on the way|deliver/i.test(row.body), row.event);
  } finally {
    f.store.close();
  }
});

test("double click, request retry, repeated mutation and replay never create or send a duplicate", async () => {
  const f = fixture();
  const mail = fakeEmail();
  try {
    const key = await f.place(delivery());
    await f.pay(key);
    f.take(key);
    const before = f.order(key);
    const command = {
      type: "transition",
      id: before.id,
      version: before.version,
      state: "Production",
    };
    // Double click and network retry: the same request, the same idempotency key.
    const idempotency = randomUUID();
    f.service.command(command, idempotency, admin);
    f.service.command(command, idempotency, admin);
    // A second, different request for the same move is refused (stale version).
    assert.throws(() => f.service.command(command, randomUUID(), admin));
    // Even with the fresh version, Production → Production is not a transition.
    assert.throws(() => f.move(key, "Production"));
    assert.equal(f.store.read().customerNotifications!.length, 1);
    // Two dispatchers at once, then a third pass: one email.
    await Promise.all([
      dispatchCustomerNotifications(f.store, mail.provider),
      dispatchCustomerNotifications(f.store, mail.provider),
    ]);
    await dispatchCustomerNotifications(f.store, mail.provider);
    assert.equal(mail.sent.length, 1);
    assert.equal(f.store.read().customerNotifications![0]!.attemptCount, 1);
  } finally {
    f.store.close();
  }
});

test("events survive a restart exactly once, and an interrupted send is never resent blindly", async () => {
  const dir = mkdtempSync(join(tmpdir(), "customer-events-"));
  const path = join(dir, "store.sqlite");
  try {
    let f = fixture(path);
    const key = await f.place(delivery());
    await f.pay(key);
    f.move(key, "Production");
    const id = f.store.read().customerNotifications![0]!.id;
    // The process dies after claiming the row but before the provider answers.
    f.store.write((s) => {
      s.customerNotifications![0]!.status = "sending";
      s.customerNotifications![0]!.attemptCount = 1;
    });
    f.store.close();
    f = fixture(path);
    assert.equal(f.store.read().customerNotifications!.length, 1);
    assert.equal(f.store.read().customerNotifications![0]!.id, id);
    assert.equal(recoverInterruptedCustomerNotifications(f.store), 1);
    const mail = fakeEmail();
    await dispatchCustomerNotifications(f.store, mail.provider);
    assert.equal(mail.sent.length, 0);
    const row = f.store.read().customerNotifications![0]!;
    assert.equal(row.status, "failed");
    assert.match(row.lastError ?? "", /Interrupted/);
    // Later transitions after the restart still record their own single event.
    f.move(key, "Ready");
    f.move(key, "Out for Delivery");
    assert.deepEqual(
      f.store.read().customerNotifications!.map((n) => n.event),
      ["ORDER_PRODUCTION_STARTED", "ORDER_OUT_FOR_DELIVERY"],
    );
    f.store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("without a provider events stay pending; a provider failure is recorded, not hidden", async () => {
  const f = fixture();
  try {
    const key = await f.place(delivery());
    await f.pay(key);
    f.move(key, "Production");
    const idle = await dispatchCustomerNotifications(f.store, null);
    assert.equal(idle.skipped, "no-email-provider");
    let row = f.store.read().customerNotifications![0]!;
    assert.deepEqual(
      [row.status, row.attemptCount, row.provider, row.sentAt],
      ["pending", 0, undefined, undefined],
    );
    await dispatchCustomerNotifications(f.store, {
      name: "fake-resend",
      send: async () => {
        throw new Error("provider said no: ana@example.invalid");
      },
    });
    row = f.store.read().customerNotifications![0]!;
    assert.deepEqual(
      [row.status, row.attemptCount, row.provider],
      ["failed", 1, "fake-resend"],
    );
    assert.ok(row.lastAttemptAt && !row.sentAt && !row.providerMessageId);
    // The stored error never echoes provider text or the recipient.
    assert.ok(!row.lastError!.includes("@"));
  } finally {
    f.store.close();
  }
});

test("Resend adapter: configured only by explicit environment, and sends one idempotent request", async () => {
  assert.equal(resendFromEnv({}), null);
  assert.equal(
    resendFromEnv({
      RESEND_API_KEY: "re_fixture_key_000",
      CUSTOMER_EMAIL_FROM: "3L <orders@example.invalid>",
    }),
    null,
  );
  assert.throws(() => resendFromEnv({ CUSTOMER_EMAIL_ENABLED: "true" }));
  assert.throws(() =>
    resendFromEnv({
      CUSTOMER_EMAIL_ENABLED: "true",
      RESEND_API_KEY: "re_fixture_key_000",
    }),
  );
  assert.throws(
    () =>
      new ResendEmailProvider({
        apiKey: "re_fixture_key_000",
        from: "not an address",
      }),
  );
  const calls: { url: string; init: RequestInit }[] = [];
  const provider = new ResendEmailProvider(
    {
      apiKey: "re_fixture_key_000",
      from: "3L Pastelerías <orders@example.invalid>",
    },
    (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return calls.length === 1
        ? Response.json({ id: "resend-message-1" })
        : new Response('{"message":"blocked ana@example.invalid"}', {
            status: 422,
          });
    }) as unknown as typeof fetch,
  );
  assert.equal(provider.name, "resend");
  const email = {
    to: "ana@example.invalid",
    subject: "Your 3L order #001 is on the way",
    text: "Hi",
    idempotencyKey: "event-1",
  };
  assert.deepEqual(await provider.send(email), {
    messageId: "resend-message-1",
  });
  assert.equal(calls[0]!.url, "https://api.resend.com/emails");
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers["Idempotency-Key"], "event-1");
  assert.equal(headers.Authorization, "Bearer re_fixture_key_000");
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), {
    from: "3L Pastelerías <orders@example.invalid>",
    to: ["ana@example.invalid"],
    subject: email.subject,
    text: "Hi",
  });
  // A rejection surfaces only a status code.
  await assert.rejects(
    provider.send(email),
    (e: Error) => e.message === "Resend HTTP 422",
  );
});
