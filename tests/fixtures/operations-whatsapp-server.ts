import { startServer } from "../../server/http";
import { seed } from "../../server/db/store";
import {
  recordOrderPaid,
  PAID_ALERT_BODY,
} from "../../server/domain/notifications";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import type { Order, Payment } from "../../server/domain/model";
const phone = "+971500000009";
Object.assign(process.env, {
  APP_ENV: "test",
  NODE_ENV: "test",
  PROVIDER_MODE: "offline",
  PORT: "0",
  APP_ORIGIN: "https://fixture.invalid",
  META_OUTBOUND_ENABLED: "false",
  META_ACCESS_TOKEN: "synthetic-token",
  META_APP_SECRET: "synthetic-app-secret-for-local-test",
  META_VERIFY_TOKEN: "synthetic-verify-token-for-local-test",
  META_GRAPH_VERSION: "v26.0",
  META_NUMBERS_JSON: JSON.stringify([
    {
      id: "wa2",
      label: "Synthetic WA2",
      phone,
      phoneNumberId: "222",
      wabaId: "333",
    },
  ]),
  WHATSAPP_MANAGER_PHONE: "+971500000001",
  OPERATIONS_WHATSAPP_ENABLED: "true",
  OPERATIONS_WHATSAPP_PHONE_NUMBER_ID: "222",
  OPERATIONS_WHATSAPP_ACTIVATION_SINCE: new Date(
    Date.now() - 60000,
  ).toISOString(),
  OPERATIONS_WHATSAPP_SEND_PERMISSION_CONFIRMED: "true",
  OPERATIONS_WHATSAPP_TEMPLATE_POLICY_CONFIRMED: "true",
  OPERATIONS_WHATSAPP_TEMPLATE_JSON: JSON.stringify({
    name: "3l_new_paid_order_alert",
    language: "en_US",
    category: "UTILITY",
  }),
  CUSTOMER_EMAIL_ENABLED: "false",
  OPERATIONS_EMAIL_ENABLED: "false",
  AI_ENABLED: "false",
});
let sends = 0;
globalThis.fetch = (async (url, init) => {
  if (String(url).includes("phone_numbers"))
    return Response.json({
      data: [
        {
          id: "222",
          display_phone_number: phone,
          status: "CONNECTED",
          platform_type: "CLOUD_API",
          code_verification_status: "VERIFIED",
        },
      ],
    });
  if (String(url).includes("message_templates"))
    return Response.json({
      data: [
        {
          name: "3l_new_paid_order_alert",
          language: "en_US",
          status: "APPROVED",
          category: "UTILITY",
          components: [{ type: "BODY", text: PAID_ALERT_BODY }],
        },
      ],
    });
  if (String(url).endsWith("/222/messages") && init?.method === "POST") {
    const body = JSON.parse(String(init.body));
    if (body.to !== process.env.WHATSAPP_MANAGER_PHONE)
      throw new Error("Unexpected fixture recipient");
    sends++;
    return Response.json({ messages: [{ id: "wamid-synthetic" }] });
  }
  throw new Error(
    "Unexpected network request; all providers are blocked in this fixture",
  );
}) as typeof fetch;
const state = seed(),
  paidAt = new Date().toISOString();
const order = {
  id: "synthetic-order",
  conversationId: "synthetic",
  state: "Confirmed",
  version: 0,
  lines: [],
  quote: null,
  audit: [],
  paidAt,
  paymentId: "synthetic-payment",
  fulfillmentMethod: "pickup",
  pickup: { pickupDate: "2026-10-15", preferredTime: "4 PM" },
} as Order;
const payment = {
  id: "synthetic-payment",
  orderId: order.id,
  status: "paid",
  paidAt,
  lastReconciledAt: paidAt,
  amountFils: 10800,
} as Payment;
state.orders.push(order);
state.payments.push(payment);
recordOrderPaid(
  state,
  order,
  payment,
  process.env.APP_ORIGIN,
  process.env.WHATSAPP_MANAGER_PHONE,
);
const app = await startServer({ initial: state });
if (!app.server.listening)
  await new Promise<void>((resolve) => app.server.once("listening", resolve));
const address = app.server.address();
process.send?.({
  port: typeof address === "object" ? address?.port : undefined,
  customerDisabled: app.service.wa instanceof DisabledWhatsAppProvider,
});
process.on("message", () =>
  process.send?.({
    sends,
    notification: app.store.read().operationsNotifications?.[0],
    orders: app.store.read().orders,
    payments: app.store.read().payments,
  }),
);
