import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Store } from "../../server/db/store";
import { CommerceService } from "../../server/domain/service";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { DisabledWhatsAppProvider } from "../../server/adapters/blocked";
import { validateCatalog } from "../../server/domain/catalog";
import {
  createWebCheckout,
  readWebCheckoutStatus,
  addDays,
  dubaiToday,
} from "../../server/domain/web-checkout";
import { reconcileEmbeddedPayment } from "../../server/domain/embedded-checkout";
import { fixtureAddressGeo } from "./website-address";
export function paidFixture(path = ":memory:") {
  const store = new Store(path, "test");
  if (!store.read().catalog?.length)
    store.write((s) => {
      s.catalog = validateCatalog(
        JSON.parse(readFileSync("data-imports/liza-current-menu.json", "utf8")),
      );
    });
  const providerState = { status: "PENDING", creates: 0 };
  const checkouts = new Map<string, Record<string, unknown>>();
  const payment = new PaymenntProvider(
    { apiKey: "fixture", apiSecret: "fixture", environment: "test" },
    async (url, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        const id = `checkout-${body.requestId}`;
        checkouts.set(id, { ...body, id });
        providerState.creates++;
      }
      const id = String(url).split("/").at(-1)!;
      const body =
        init?.method === "POST"
          ? [...checkouts.values()].at(-1)
          : checkouts.get(id);
      return Response.json({
        success: true,
        result: {
          ...body,
          status: providerState.status,
          redirectUrl: "https://pay.test.paymennt.com/checkout/fixture",
        },
      });
    },
  );
  const service = new CommerceService(
    store,
    new DisabledWhatsAppProvider(),
    payment,
    fixtureAddressGeo,
  );
  const since = new Date(Date.now() - 1000).toISOString();
  service.customerPaidEmailSince = since;
  service.deliveryAddressMode = "legacy";
  service.operationsEmailRecipients = ["ops@example.invalid"];
  const place = async (pickup = false) => {
    const key = randomUUID();
    await createWebCheckout(
      service,
      {
        fulfillmentMethod: pickup ? "pickup" : "delivery",
        lines: [
          { productId: "conchas-traditional-chocolate-mini-40-g", quantity: 6 },
        ],
        ...(pickup
          ? {
              pickup: {
                pickupDate: addDays(dubaiToday(), 2),
                preferredTime: "4:00 PM – 9:00 PM",
              },
            }
          : {
              delivery: {
                zoneId: "jlt-cluster-c",
                address: "Fixture Street",
                building: "Fixture Tower",
                date: addDays(dubaiToday(), 2),
                slot: "4:00 PM – 9:00 PM",
              },
            }),
        customer: {
          firstName: "Alex",
          lastName: "Private",
          email: "alex@example.invalid",
          phone: "0500000000",
        },
        billing: pickup
          ? {
              sameAsDelivery: false,
              name: "Alex Private",
              address1: "Private Street",
              city: "Dubai",
              country: "AE",
            }
          : { sameAsDelivery: true },
      },
      key,
      "web",
      "https://test.example.invalid",
    );
    return key;
  };
  const order = (key: string) =>
    store
      .read()
      .orders.find(
        (o) => o.id === readWebCheckoutStatus(service, key).orderId,
      )!;
  return {
    store,
    service,
    providerState,
    since,
    place,
    order,
    reconcile: (key: string) => reconcileEmbeddedPayment(service, key),
  };
}
