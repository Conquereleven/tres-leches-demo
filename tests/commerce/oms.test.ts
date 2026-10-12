import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Workspace } from "../../src/commerce/api";
import type { Order } from "../../server/domain/model";
import { transitions } from "../../server/domain/workflow";
import { inQueue } from "../../src/commerce/orders-board";
import {
  EMPTY_QUERY,
  PAGE_SIZE,
  addressCheck,
  conversationOf,
  customerName,
  fulfilmentSteps,
  listOrders,
  orderActivity,
  orderLines,
  orderNotifications,
  orderPath,
  orderPermissions,
  parseListQuery,
  parseOperationsPath,
  paymentMethod,
  paymentOf,
  serializeListQuery,
  type ListQuery,
} from "../../src/commerce/order-view";
import { omsWorkspace } from "../fixtures/oms";

const load = (extra = 0) => omsWorkspace(extra) as unknown as Workspace;
const find = (data: Workspace, id: string) =>
  data.orders.find((o) => o.id === id)!;
const ids = (data: Workspace, q: Partial<ListQuery>) =>
  listOrders(data, { ...EMPTY_QUERY, ...q }).rows.map((o) => o.id);

test("OMS list shows every order, newest first, and never drops history silently", () => {
  const data = load();
  const all = listOrders(data, EMPTY_QUERY);
  assert.equal(all.total, data.orders.length);
  // Unpaid, cancelled and draft orders are listed, not hidden.
  for (const id of ["TL-FIX00007", "TL-FIX00008", "TL-FIX00009"])
    assert.ok(
      all.rows.some((o) => o.id === id),
      id,
    );
  const times = all.rows.map((o) => o.audit[0]!.at);
  assert.deepEqual(times, [...times].sort().reverse());
  // Listing an unpaid order does not put it in the kitchen queue.
  assert.equal(inQueue(find(data, "TL-FIX00007")), false);
});

test("OMS search covers order number, internal id, name, phone and email", () => {
  const data = load();
  assert.deepEqual(ids(data, { q: "#012" }), ["TL-FIX00001"]);
  assert.deepEqual(ids(data, { q: "tl-fix00003" }), ["TL-FIX00003"]);
  assert.deepEqual(ids(data, { q: "layla" }), ["TL-FIX00001"]);
  assert.deepEqual(ids(data, { q: "layla.fixture@example" }), ["TL-FIX00001"]);
  assert.deepEqual(ids(data, { q: "+971 50 000 0101" }), ["TL-FIX00001"]);
  assert.deepEqual(ids(data, { q: "no such order" }), []);
});

test("OMS filters by fulfilment, payment, method and both date ranges", () => {
  const data = load();
  assert.deepEqual(ids(data, { fulfilment: "unpaid" }), ["TL-FIX00007"]);
  assert.deepEqual(ids(data, { fulfilment: "cancelled" }), ["TL-FIX00008"]);
  assert.deepEqual(ids(data, { fulfilment: "draft" }), ["TL-FIX00009"]);
  assert.deepEqual(ids(data, { method: "pickup" }), ["TL-FIX00003"]);
  assert.deepEqual(ids(data, { payment: "review" }), ["TL-FIX00007"]);
  assert.deepEqual(ids(data, { payment: "issue" }), ["TL-FIX00008"]);
  assert.deepEqual(ids(data, { payment: "none" }), ["TL-FIX00009"]);
  const due = find(data, "TL-FIX00005").delivery!.date;
  const dueIds = ids(data, { dueFrom: due, dueTo: due });
  assert.ok(dueIds.includes("TL-FIX00005") && !dueIds.includes("TL-FIX00001"));
  // An order with no date is excluded only when a date filter is active.
  assert.ok(!dueIds.includes("TL-FIX00009"));
  assert.deepEqual(ids(data, { placedFrom: "2999-01-01" }), []);
});

test("OMS list is paginated and clamps an out-of-range page", () => {
  const data = load(40);
  const first = listOrders(data, EMPTY_QUERY);
  assert.equal(first.rows.length, PAGE_SIZE);
  assert.equal(first.pages, Math.ceil(data.orders.length / PAGE_SIZE));
  const last = listOrders(data, { ...EMPTY_QUERY, page: 999 });
  assert.equal(last.page, last.pages);
  assert.ok(last.rows.length > 0);
  const seen = new Set<string>();
  for (let page = 1; page <= first.pages; page++)
    for (const o of listOrders(data, { ...EMPTY_QUERY, page }).rows)
      seen.add(o.id);
  assert.equal(seen.size, data.orders.length);
});

test("OMS filters round-trip through the URL and reject invalid values", () => {
  const query: ListQuery = {
    q: "layla #012",
    payment: "paid",
    fulfilment: "preparing",
    method: "pickup",
    placedFrom: "2026-10-01",
    placedTo: "2026-10-31",
    dueFrom: "2026-10-05",
    dueTo: "",
    page: 3,
  };
  assert.deepEqual(parseListQuery(serializeListQuery(query)), query);
  assert.equal(serializeListQuery(EMPTY_QUERY), "");
  assert.deepEqual(
    parseListQuery("?payment=bogus&status=nope&method=x&dueFrom=13/10&page=-2"),
    EMPTY_QUERY,
  );
});

test("OMS routes: dedicated path, legacy ?order= link, encoded and missing ids", () => {
  assert.deepEqual(parseOperationsPath("/operations/orders/TL-AB12CD34"), {
    view: "orders",
    orderId: "TL-AB12CD34",
    legacy: false,
  });
  assert.deepEqual(
    parseOperationsPath("/operations/orders", "?order=TL-AB12CD34"),
    { view: "orders", orderId: "TL-AB12CD34", legacy: true },
  );
  assert.deepEqual(parseOperationsPath("/operations/orders", "?q=layla"), {
    view: "orders",
    orderId: "",
    legacy: false,
  });
  assert.equal(parseOperationsPath("/operations/production").orderId, "");
  assert.equal(parseOperationsPath("/operations").view, "overview");
  assert.equal(orderPath("TL A/1"), "/operations/orders/TL%20A%2F1");
  assert.equal(
    parseOperationsPath(orderPath("TL A/1").replace("%2F", "%2f")).orderId,
    "TL A/1",
  );
  // A malformed escape never throws.
  assert.equal(
    parseOperationsPath("/operations/orders/%E0%A4%A").orderId,
    "%E0%A4%A",
  );
});

test("OMS customer name: checkout name first, never a delivery area or phone", () => {
  const data = load();
  const name = (id: string) => {
    const o = find(data, id);
    return customerName(data, o, conversationOf(data, o));
  };
  assert.deepEqual(name("TL-FIX00001"), {
    name: "Layla Fixture",
    source: "checkout",
  });
  assert.deepEqual(name("TL-FIX00002"), {
    name: "Omar Sample",
    source: "conversation",
  });
  // Conversation labelled with the zone "JVC".
  assert.deepEqual(name("TL-FIX00004"), { name: null, source: "none" });
  const o = find(data, "TL-FIX00002");
  const c = conversationOf(data, o)!;
  assert.equal(
    customerName(data, o, { ...c, customer: "Jumeirah Village Circle" }).name,
    null,
  );
  assert.equal(
    customerName(data, o, { ...c, customer: "+971 50 000 0000" }).name,
    null,
  );
  assert.equal(customerName(data, o, undefined).name, null);
});

test("OMS prices come from the order snapshot, never today's catalog or zero", () => {
  const data = load();
  const o = structuredClone(find(data, "TL-FIX00001"));
  data.catalog[0]!.priceFils = 99900;
  assert.deepEqual(
    orderLines(data, o).map((l) => [l.unitFils, l.lineFils]),
    [[2500, 10000]],
  );
  for (const snapshot of [
    undefined,
    [],
    [o.catalogSnapshot![0]!, { ...o.catalogSnapshot![0]! }],
    [{ ...o.catalogSnapshot![0]!, priceFils: -1 }],
  ]) {
    const line = orderLines(data, { ...o, catalogSnapshot: snapshot })[0]!;
    assert.equal(line.unitFils, null);
    assert.equal(line.lineFils, null);
  }
  // A draft has no snapshot yet and is quoted from the current catalog.
  const draft = find(data, "TL-FIX00009");
  assert.equal(orderLines(data, draft)[0]!.unitFils, 99900);
});

test("OMS address checks keep the hotfix rules and exempt pickup", () => {
  const data = load();
  assert.deepEqual(addressCheck(find(data, "TL-FIX00001")), {
    incomplete: false,
    unverified: false,
  });
  assert.deepEqual(addressCheck(find(data, "TL-FIX00004")), {
    incomplete: true,
    unverified: true,
  });
  assert.deepEqual(addressCheck(find(data, "TL-FIX00003")), {
    incomplete: false,
    unverified: false,
  });
  assert.deepEqual(addressCheck({ fulfillmentMethod: "delivery" }), {
    incomplete: true,
    unverified: true,
  });
});

test("OMS offers only transitions the state machine allows", () => {
  const data = load();
  for (const o of data.orders) {
    const c = conversationOf(data, o);
    const { next } = orderPermissions(data, o, c, paymentOf(data, o));
    if (!next) continue;
    assert.ok(
      o.fulfillmentMethod === "pickup" && o.state === "Ready"
        ? next.to === "Delivered"
        : transitions[o.state].includes(next.to),
      `${o.state} → ${next.to}`,
    );
  }
  // No fulfilment step is offered before the order is confirmed, or after it ends.
  for (const state of [
    "Awaiting Payment",
    "Paid",
    "Delivered",
    "Cancelled",
    "Building",
  ] as const) {
    const o = { ...find(data, "TL-FIX00001"), state } as Order;
    assert.equal(orderPermissions(data, o, conversationOf(data, o)).next, null);
  }
  // Pickup skips "Out for Delivery" in both the action and the visual steps.
  const pickup = find(data, "TL-FIX00003");
  assert.equal(
    orderPermissions(data, pickup, conversationOf(data, pickup)).next!.to,
    "Delivered",
  );
  assert.ok(
    !fulfilmentSteps(pickup).steps.some((s) => s.state === "Out for Delivery"),
  );
  assert.equal(fulfilmentSteps(find(data, "TL-FIX00001")).steps.length, 5);
});

test("OMS mirrors assignment rules: owner acts, others may only take when allowed", () => {
  const data = load();
  const o = find(data, "TL-FIX00001");
  const c = conversationOf(data, o)!;
  const as = (role: Workspace["actor"]["role"], id: string) => ({
    ...data,
    actor: { id, role },
  });
  assert.equal(orderPermissions(data, o, c).owned, true);
  const other = orderPermissions(as("operator", "someone-else"), o, c);
  assert.deepEqual([other.owned, other.canTake], [false, false]);
  assert.equal(orderPermissions(as("manager", "boss"), o, c).canTake, true);
  const free = { ...c, assignedAgent: null };
  assert.equal(orderPermissions(as("operator", "x"), o, free).canTake, true);
  const closed = { ...c, status: "closed" as const };
  const shut = orderPermissions(data, o, closed);
  assert.deepEqual([shut.owned, shut.canTake], [false, false]);
  // Reconciliation: owner or elevated role, Paymennt payments only.
  const p = paymentOf(data, o)!;
  assert.equal(orderPermissions(data, o, c, p).canReconcile, true);
  assert.equal(
    orderPermissions(as("operator", "x"), o, c, p).canReconcile,
    false,
  );
  assert.equal(
    orderPermissions(data, o, c, { ...p, provider: "mock" }).canReconcile,
    false,
  );
});

test("OMS notifications are 'sent' only with provider evidence", () => {
  const data = load();
  const rows = orderNotifications(data, find(data, "TL-FIX00001"));
  assert.deepEqual(
    rows.map((r) => [r.channel, r.status]),
    [
      ["Internal WhatsApp", "disabled"],
      ["Internal email", "sent"],
    ],
  );
  assert.equal(
    orderNotifications(data, find(data, "TL-FIX00002"))[0]!.status,
    "disabled",
  );
  assert.equal(
    orderNotifications(
      { ...data, customerEmailProvider: "resend" },
      find(data, "TL-FIX00002"),
    )[0]!.status,
    "pending",
  );
  assert.equal(
    orderNotifications(data, find(data, "TL-FIX00004"))[0]!.status,
    "failed",
  );
  // A row marked sent without a timestamp is not reported as a sent event.
  const activity = orderActivity(
    {
      ...data,
      operationsEmailNotifications: [
        { ...data.operationsEmailNotifications![0]!, sentAt: undefined },
      ],
    },
    find(data, "TL-FIX00001"),
  );
  assert.ok(!activity.some((e) => e.text === "Internal paid-order email sent"));
});

test("OMS activity is one chronological record of stored events", () => {
  const data = load();
  const activity = orderActivity(data, find(data, "TL-FIX00001"));
  const times = activity.map((e) => e.at);
  assert.deepEqual(times, [...times].sort());
  assert.equal(activity[0]!.text, "Order created");
  for (const kind of ["order", "payment", "notification"])
    assert.ok(
      activity.some((e) => e.kind === kind),
      kind,
    );
  assert.ok(
    activity.some((e) => e.from === "Awaiting Payment" && e.to === "Paid"),
  );
});

test("OMS payment method reports only what the payment record stores", () => {
  assert.equal(paymentMethod(undefined), null);
  assert.equal(paymentMethod({ provider: "mock" }), "Test provider");
  assert.equal(paymentMethod({ provider: "paymennt" }), "Card · Paymennt");
  assert.equal(
    paymentMethod({ provider: "paymennt", checkoutFlow: "web" }),
    "Card · Paymennt (website checkout)",
  );
  assert.equal(paymentMethod({}), null);
});

test("OMS styles use only the approved palette and stay scoped to Operations", () => {
  const css = readFileSync("src/commerce/oms.css", "utf8");
  const colours = new Set(
    [...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase()),
  );
  assert.deepEqual([...colours].sort(), [
    "#27242d",
    "#5a565f",
    "#a28d5b",
    "#e6e2df",
    "#f6dfe0",
    "#ffc0c8",
    "#ffffff",
  ]);
  for (const rule of css.matchAll(/(^|\})\s*([^{}@/]+)\{/g))
    for (const selector of rule[2]!.replace(/\([^()]*\)/g, "").split(","))
      assert.ok(
        selector.trim().startsWith(".commerce.ops-shell"),
        selector.trim(),
      );
  for (const file of ["operations-shell", "commerce", "product-hub", "oms"])
    assert.doesNotMatch(
      readFileSync(`src/commerce/${file}.css`, "utf8"),
      /#(a191b2|dddae8|635572|176346|d5e6dc|ebefed)\b/i,
      file,
    );
});

test("server serves the app shell for one order path and nothing wider", async () => {
  const PORT = 3173;
  const call = (path: string) =>
    new Promise<number>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port: PORT, path }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      });
      req.on("error", reject);
      req.end();
    });
  const dir = mkdtempSync(join(tmpdir(), "oms-"));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/web-checkout-server.ts"],
    {
      env: {
        ...process.env,
        DB_PATH: join(dir, "store.sqlite"),
        API_PORT: String(PORT),
        PORT: String(PORT),
        APP_ORIGIN: `http://127.0.0.1:${PORT}`,
      },
      stdio: "ignore",
    },
  );
  try {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await call("/api/health")) === 200) break;
      } catch {
        /* still starting */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    // Same answer as the list route it belongs to (200 once the client is built).
    const list = await call("/operations/orders");
    assert.equal(await call("/operations/orders/TL-AB12CD34"), list);
    assert.equal(await call("/operations/orders/TL-AB12CD34?x=1"), list);
    for (const path of [
      "/operations/orders/TL-AB12CD34/extra",
      "/operations/orders/..%2f..%2fetc",
      "/operations/orders/a.b",
      "/operations/production/TL-AB12CD34",
      "/operations/unknown",
    ])
      assert.equal(await call(path), 404, path);
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
