/**
 * Synthetic workspace for the order management screens. Fictitious people,
 * numbers and addresses; served only through Playwright route mocks or passed
 * to pure functions. Nothing here reaches a database or a provider.
 */
import { dubai, workspace } from "./ux-states";

const DAY = 86_400_000;
const iso = (days: number, hour = 9) =>
  new Date(Date.now() + days * DAY).toISOString().slice(0, 11) +
  `${String(hour).padStart(2, "0")}:00:00.000Z`;

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** `extra` appends that many delivered historical orders, for pagination. */
export function omsWorkspace(extra = 0) {
  const data: Loose = workspace();
  const orders = data.orders as Loose[];
  const conversations = data.conversations as Loose[];
  data.zones = [
    {
      id: "jvc",
      name: "JVC",
      aliases: ["Jumeirah Village Circle"],
      minOrderAed: 100,
      deliveryFeeAed: 0,
      freeDelivery: true,
      active: true,
      priority: 10,
      version: 1,
    },
  ];
  // #012 · delivery, checkout name and contacts, verified address, notifications.
  Object.assign(orders[0]!, {
    publicOrderNumber: 12,
    fulfillmentMethod: "delivery",
    address: "Unit 1204, Fixture Tower 1, Sample Street, JLT Cluster C",
    customerDetails: {
      firstName: "Layla",
      lastName: "Fixture",
      email: "layla.fixture@example.invalid",
      whatsappNumber: "+971500000101",
      instructions: "Happy birthday plaque, no nuts",
    },
    paidAt: iso(0, 6),
    audit: [
      { at: iso(-1, 18), actor: "web", action: "created" },
      {
        at: iso(0, 6),
        actor: "payment-webhook",
        action: "Awaiting Payment → Paid",
        from: "Awaiting Payment",
        to: "Paid",
      },
      {
        at: iso(0, 6),
        actor: "system",
        action: "Paid → Confirmed",
        from: "Paid",
        to: "Confirmed",
      },
    ],
  });
  Object.assign(orders[0]!.delivery, {
    address: "Sample Street",
    building: "Fixture Tower 1",
    unit: "1204",
    addressVerification: "VERIFIED",
    notes: "Leave with reception",
  });
  Object.assign(orders[0]!.quote, { feeFils: 0 });
  // #013 · pickup, ready.
  Object.assign(orders[2]!, {
    publicOrderNumber: 13,
    fulfillmentMethod: "pickup",
    pickup: { pickupDate: dubai(0), preferredTime: "5:00 PM" },
    customerDetails: { firstName: "Sofía", lastName: "Demo" },
  });
  delete orders[2]!.delivery;
  orders[2]!.quote.zoneName = null;
  // WhatsApp order whose conversation label is a delivery area, not a person.
  conversations[3]!.customer = "JVC";
  Object.assign(orders[3]!, { publicOrderNumber: 14 });
  orders[3]!.quote.zoneName = "JVC";
  Object.assign(orders[3]!.delivery, { address: "", building: "" });
  // Awaiting payment: not owned by anyone yet.
  conversations[6]!.assignedAgent = null;
  // A cancelled order and a WhatsApp draft still being built.
  const base = orders[4]!;
  orders.push(
    {
      ...structuredClone(base),
      id: "TL-FIX00008",
      conversationId: "c8",
      state: "Cancelled",
      paymentId: "p8",
      audit: [
        { at: iso(-3), actor: "wa1", action: "created" },
        {
          at: iso(-3, 11),
          actor: "test-admin",
          action: "Minimum Check → Cancelled",
          from: "Minimum Check",
          to: "Cancelled",
        },
      ],
    },
    {
      ...structuredClone(base),
      id: "TL-FIX00009",
      conversationId: "c9",
      state: "Building",
      paymentId: undefined,
      catalogSnapshot: undefined,
      delivery: undefined,
      audit: [{ at: iso(0, 7), actor: "test-admin", action: "created" }],
    },
  );
  conversations.push(
    {
      ...structuredClone(conversations[0]!),
      id: "c8",
      customer: "Rami Sample",
      sourceNumberId: "wa1",
    },
    {
      ...structuredClone(conversations[0]!),
      id: "c9",
      customer: "Dana Example",
      sourceNumberId: "wa1",
    },
  );
  (data.payments as Loose[]).push({
    ...structuredClone((data.payments as Loose[])[0]!),
    id: "p8",
    orderId: "TL-FIX00008",
    status: "expired",
  });
  Object.assign((data.payments as Loose[])[0]!, {
    checkoutFlow: "web",
    paidAt: iso(0, 6),
    lastReconciledAt: iso(0, 6),
    transactionId: "txn_fixture_0001",
    providerRawStatus: "CAPTURED",
    timeline: [
      { at: iso(-1, 18), actor: "web", action: "Payment created" },
      {
        at: iso(0, 6),
        actor: "payment-webhook",
        action: "Payment reconciled as paid",
      },
    ],
  });
  data.operationsOutboundEnabled = false;
  data.operationsEmailProvider = "resend";
  data.customerEmailProvider = null;
  data.operationsNotifications = [
    {
      id: "n-wa-1",
      event: "ORDER_PAID",
      kind: "notify_operations_whatsapp",
      orderId: "TL-FIX00001",
      paymentId: "p1",
      recipient: { name: "Fixture Manager", phone: "+971500000199" },
      message: "fixture",
      status: "pending-whatsapp-delivery",
      attempts: 0,
      createdAt: iso(0, 6),
    },
  ];
  data.operationsEmailNotifications = [
    {
      id: "n-em-1",
      orderId: "TL-FIX00001",
      status: "sent",
      attemptCount: 1,
      createdAt: iso(0, 6),
      sentAt: iso(0, 6),
    },
  ];
  data.customerNotifications = [
    {
      id: "n-cu-1",
      event: "ORDER_PRODUCTION_STARTED",
      channel: "email",
      orderId: "TL-FIX00002",
      recipient: "omar.sample@example.invalid",
      subject: "fixture",
      body: "fixture",
      status: "pending",
      attemptCount: 0,
      createdAt: iso(0, 8),
    },
    {
      id: "n-cu-2",
      event: "ORDER_OUT_FOR_DELIVERY",
      channel: "email",
      orderId: "TL-FIX00004",
      recipient: "priya.example@example.invalid",
      subject: "fixture",
      body: "fixture",
      status: "failed",
      attemptCount: 3,
      createdAt: iso(0, 9),
      lastError: "Provider rejected",
    },
  ];
  for (let i = 0; i < extra; i++) {
    const n = 100 + i;
    orders.push({
      ...structuredClone(orders[5]!),
      id: `TL-HIST${String(n).padStart(4, "0")}`,
      conversationId: "c6",
      paymentId: "p6",
      publicOrderNumber: undefined,
      audit: [
        {
          at: iso(-10 - i),
          actor: "payment-webhook",
          action: "Awaiting Payment → Paid",
          from: "Awaiting Payment",
          to: "Paid",
        },
      ],
    });
    orders.at(-1)!.delivery.date = dubai(-9 - i);
  }
  return data;
}
