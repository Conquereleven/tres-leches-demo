/**
 * Visual-state fixtures for UX review. Fictitious data, used only through
 * Playwright route mocks: nothing here reaches a database or a provider.
 */
const DAY = 86_400_000;
export const dubai = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offsetDays * DAY));

export const summary = {
  items: [
    {
      productId: "pan-de-muerto",
      name: "Pan de Muerto",
      quantity: 2,
      lineFils: 5000,
    },
  ],
  subtotalFils: 5000,
  feeFils: 0,
  delivery: {
    zoneId: "jlt-cluster-c",
    zoneName: "JLT Cluster C",
    address: "Jumeirah Lakes Towers, Cluster C",
    building: "Fixture Tower",
    unit: "1204",
    date: dubai(1),
    slot: "Afternoon, after 4 pm",
  },
  customerName: "Layla Fixture",
};
export const status = (over: Record<string, unknown>) => ({
  orderId: "TL-FIXTURE1",
  status: "Awaiting Payment",
  paymentStatus: "pending",
  amountFils: 5000,
  currency: "AED",
  url: null,
  actionRequired: null,
  summary,
  ...over,
});

/**
 * Stand-in for the provider's card frame script. It renders a labelled
 * placeholder, reports the card as valid, and tokenises only when a test
 * sets `window.__tokenize`.
 */
export const FRAMES_STUB = `
window.PaymenntJS = {
  modes: { TEST: "TEST", LIVE: "LIVE" },
  init(o) {
    window.__frames = o;
    const el = document.querySelector(o.selector);
    const f = document.createElement("iframe");
    f.srcdoc = '<div style="font:14px sans-serif;color:#66554b;display:grid;gap:10px;padding:6px"><div style="border:1px solid #d6cdc1;border-radius:8px;padding:12px">Card number</div><div style="display:flex;gap:10px"><div style="flex:1;border:1px solid #d6cdc1;border-radius:8px;padding:12px">MM / YY</div><div style="flex:1;border:1px solid #d6cdc1;border-radius:8px;padding:12px">CVV</div></div></div>';
    f.style.cssText = "border:0;width:100%;height:100%";
    el.appendChild(f);
    setTimeout(() => o.onValidationUpdate({ valid: true }), 30);
  },
  submitPayment() {
    if (window.__tokenize) window.__frames.onTokenized({ token: "ptk_fixture_ui_only" });
  },
};`;

const agent = { id: "test-admin", name: "Fixture Admin" };
const conversation = (id: string, customer: string, source = "web") => ({
  id,
  customer,
  phone: "+971500000000",
  sourceNumberId: source,
  sourcePhoneNumber: "",
  assignedAgent: agent.id,
  status: "open",
  unread: false,
  version: 1,
  messages: [],
  audit: [],
});
const at = (days: number, hour = 9) =>
  new Date(Date.now() + days * DAY).toISOString().slice(0, 11) +
  `${String(hour).padStart(2, "0")}:00:00.000Z`;
const order = (
  n: number,
  state: string,
  date: string,
  quantity: number,
  paidDaysAgo: number | null,
  slot = "Afternoon",
) => ({
  id: `TL-FIX0000${n}`,
  conversationId: `c${n}`,
  state,
  version: 3,
  lines: [{ productId: "pan-de-muerto", quantity }],
  catalogSnapshot: [
    { id: "pan-de-muerto", name: "Pan de Muerto", priceFils: 2500 },
  ],
  quote: {
    zoneId: "jlt-cluster-c",
    zoneName: n % 2 ? "JLT Cluster C" : "JLT Cluster B",
    minOrderAed: 30,
    feeFils: 0,
    subtotalFils: 2500 * quantity,
    totalFils: 2500 * quantity,
    minimumMet: true,
    eligible: true,
    reason: "",
    zoneVersion: 1,
  },
  delivery: {
    zoneId: "jlt-cluster-c",
    address: "Jumeirah Lakes Towers",
    building: `Fixture Tower ${n}`,
    date,
    slot,
  },
  paymentId: `p${n}`,
  audit:
    paidDaysAgo == null
      ? [{ at: at(-1), actor: "web", action: "created" }]
      : [
          {
            at: at(-paidDaysAgo),
            actor: "payment-webhook",
            action: "Awaiting Payment → Paid",
            from: "Awaiting Payment",
            to: "Paid",
          },
        ],
});
const payment = (n: number, amount: number, s = "paid", extra = {}) => ({
  id: `p${n}`,
  orderId: `TL-FIX0000${n}`,
  amountFils: amount,
  currency: "AED",
  provider: "paymennt",
  status: s,
  createdAt: at(-1),
  updatedAt: at(-1),
  timeline: [],
  ...extra,
});

export function workspace() {
  const orders = [
    order(1, "Confirmed", dubai(0), 4, 0, "Morning, 10–12"),
    order(2, "Production", dubai(0), 2, 0, "Afternoon, after 4 pm"),
    order(3, "Ready", dubai(0), 6, 1),
    order(4, "Out for Delivery", dubai(0), 2, 1, "Evening"),
    order(5, "Confirmed", dubai(1), 3, 0),
    order(6, "Delivered", dubai(0), 2, 1),
    order(7, "Awaiting Payment", dubai(1), 2, null),
  ];
  const names = [
    "Layla Fixture",
    "Omar Sample",
    "Sofía Demo",
    "Priya Example",
    "Noura Test",
    "James Placeholder",
    "Hana Pending",
  ];
  return {
    mode: "integration",
    environment: "test",
    actor: { id: agent.id, name: agent.name, role: "admin" },
    agents: [agent],
    numbers: [],
    catalog: [{ id: "pan-de-muerto", name: "Pan de Muerto", priceFils: 2500 }],
    zones: [],
    conversations: names.map((name, i) =>
      conversation(`c${i + 1}`, name, i === 3 ? "wa1" : "web"),
    ),
    orders,
    payments: orders.map((o, i) =>
      payment(
        i + 1,
        o.quote.totalFils,
        o.state === "Awaiting Payment" ? "pending" : "paid",
        o.state === "Awaiting Payment" ? { directAttempt: "unknown" } : {},
      ),
    ),
    jobs: [],
  };
}
