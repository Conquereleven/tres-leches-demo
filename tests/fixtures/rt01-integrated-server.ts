/** Disposable integration fixture. No runtime route/control/provider modification. */
import { mock } from "node:test";
import { scryptSync } from "node:crypto";
import { startServer } from "../../server/http";
import { paidFixture } from "./customer-paid";
import { fixtureAddressGeo } from "./website-address";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
const allowed = new Set([
  "PATH",
  "HOME",
  "TMPDIR",
  "DB_PATH",
  "PORT",
  "API_PORT",
  "HOST",
  "APP_ORIGIN",
]);
for (const key of Object.keys(process.env))
  if (!allowed.has(key)) delete process.env[key];
if (!process.env.DB_PATH?.includes("rt01-integrated-"))
  throw new Error("New disposable rt01-integrated DB required");
process.env.APP_ENV = "test";
process.env.NODE_ENV = "production";
process.env.PROVIDER_MODE = "offline";
process.env.WEBHOOK_SECRET = "synthetic-integrated-only-secret-12345";
process.env.OPERATOR_USERS_JSON = JSON.stringify(
  ["admin", "manager", "operator", "agent"].map((role) => ({
    id: `fixture-${role}`,
    role,
    salt: "integrated-fixture-only-salt",
    hash: scryptSync(
      "fictional-password",
      "integrated-fixture-only-salt",
      64,
    ).toString("hex"),
  })),
);
mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-12T10:38:00Z") });
const f = paidFixture();
const initial = f.store.read();
f.store.close();
const started = await startServer({
  initial,
  payment: f.payment,
  whatsapp: new DisabledWhatsAppProvider(),
  geo: fixtureAddressGeo,
});
started.service.customerPaidEmailSince = "2026-11-12T10:00:00Z";
started.service.operationsEmailRecipients = ["ops@example.invalid"];
process.on(
  "message",
  (message: { id: number; action: string; now?: string; orderId?: string }) => {
    try {
      if (message.action === "paid") f.providerState.status = "PAID";
      if (message.action === "pending") f.providerState.status = "PENDING";
      if (message.action === "clock")
        mock.timers.setTime(Date.parse(message.now!));
      if (message.action === "hold")
        started.store.write((s) => {
          const o = s.orders.find((o) => o.id === message.orderId)!;
          delete s.payments.find((p) => p.id === o.paymentId)!
            .fulfillmentIntent;
        });
      if (message.action === "assign")
        started.store.write((s) => {
          for (const c of s.conversations) c.assignedAgent = "fixture-admin";
        });
      process.send?.({
        id: message.id,
        state: started.store.read(),
        creates: f.providerState.creates,
      });
    } catch (error) {
      process.send?.({ id: message.id, error: String(error) });
    }
  },
);
if (started.server.listening) process.send?.({ready:true});
else started.server.once("listening",()=>process.send?.({ready:true}));
