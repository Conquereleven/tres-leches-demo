import { mock } from "node:test";
import { attachVerifiedAddresses } from "../../server/domain/website-address";
import { fixtureAddressGeo } from "./website-address";
// Isolated UAT harness; never imported by the production server.
import { startServer } from "../../server/http";
import { seed } from "../../server/db/store";
import { PaymenntProvider } from "../../server/adapters/paymennt";
import { validateCatalog } from "../../server/domain/catalog";
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { bluewatersFixture } from "./delivery-areas";
import { planFlexibleDelivery } from "../../server/domain/flexible-delivery";
process.env.APP_ENV = "test";
process.env.NODE_ENV = "test";
process.env.PROVIDER_MODE = "offline";
process.env.META_OUTBOUND_ENABLED = "false";
const secretFile = join(dirname(process.env.DB_PATH!), "webhook.json");
writeFileSync(
  secretFile,
  JSON.stringify({
    id: "fixture-webhook",
    hmacKey: "fixture-hmac-key",
    address: "https://fixture.invalid/api/webhooks/payment",
  }),
  { mode: 0o600 },
);
process.env.PAYMENNT_WEBHOOK_SECRET_FILE = secretFile;
if (process.env.FIXTURE_DATE)
  mock.timers.enable({
    apis: ["Date"],
    now: new Date(process.env.FIXTURE_DATE),
  });
let status = process.env.FIXTURE_PAYMENT_STATUS ?? "PENDING";
const checkouts = new Map<string, Record<string, unknown>>();
process.on("message", (value) => {
  if (
    value === "PAID" ||
    value === "FAILED" ||
    value === "CANCELLED" ||
    value === "HTTP_400"
  ) {
    status = value;
    process.send?.("updated");
  }
});
const debits = new Map<string, unknown>();
const initial = seed();
if (process.env.FLEXIBLE_DELIVERY_FIXTURE === "true") {
  for (const change of planFlexibleDelivery(initial.zones).changes)
    initial.zones.find((z) => z.id === change.id)!.deliveryPolicy =
      change.after;
}
if (process.env.DELIVERY_AREA_FIXTURE === "true")
  initial.zones.push(
    bluewatersFixture,
    {
      ...bluewatersFixture,
      id: "fixture-inactive",
      name: "Inactive Fixture",
      aliases: [],
      active: false,
    },
    {
      ...bluewatersFixture,
      id: "fixture-pending",
      name: "Pending Fixture",
      aliases: [],
      minOrderAed: null,
    },
  );
initial.catalog = validateCatalog(
  JSON.parse(
    readFileSync(
      process.env.CATALOG_FIXTURE === "legacy"
        ? "tests/fixtures/retired-pan-de-muerto.json"
        : "data-imports/liza-current-menu.json",
      "utf8",
    ),
  ),
);
if (process.env.CATALOG_FIXTURE === "legacy")
  initial.catalog.push({
    id: "fixture-36",
    name: "Fixture Bakery",
    priceFils: 3600,
    active: true,
    availability: "available",
  });
const provider = new PaymenntProvider(
  { apiKey: "fixture-key", apiSecret: "fixture-secret", environment: "test" },
  async (url, init) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const id = randomUUID();
      if (String(url).endsWith("/payment/debit")) {
        if (status === "HTTP_400")
          return Response.json(
            {
              success: false,
              code: "CUSTOMER_INVALID",
              error: "Customer details could not be validated",
            },
            { status: 400 },
          );
        const debit = {
          id,
          status: "CAPTURED",
          amount: body.checkoutDetails.amount,
          currency: "AED",
          checkoutDetails: {
            ...body.checkoutDetails,
            id: "fixture-checkout",
            status: "PAID",
          },
        };
        debits.set(id, debit);
        return Response.json({
          success: true,
          result: {
            id,
            status: "CAPTURED",
            amount: body.checkoutDetails.amount,
            currency: "AED",
            checkoutDetails: {
              ...body.checkoutDetails,
              id: "fixture-checkout",
              status: "PAID",
            },
          },
        });
      }
      checkouts.set(id, {
        ...body,
        id,
        redirectUrl: `https://pay.test.paymennt.com/checkout/${id}`,
      });
      return Response.json({
        success: true,
        result: { ...checkouts.get(id), status },
      });
    }
    const id = String(url).split("/").at(-1)!;
    if (debits.has(id))
      return Response.json({ success: true, result: debits.get(id) });
    // A checkout created outside this site on the same merchant account.
    if (id === process.env.FIXTURE_EXTERNAL_CHECKOUT)
      return Response.json({
        success: true,
        result: {
          id,
          requestId: "7b1d9c7e-0000-4000-8000-00000000e001",
          orderId: null,
          amount: 374,
          currency: "AED",
          status: "PAID",
        },
      });
    return Response.json({
      success: true,
      result: { ...checkouts.get(id), status },
    });
  },
);
let geo = fixtureAddressGeo;
if (process.env.COVERAGE_FIXTURE === "approved") {
  // Disposable test-only tariff rectangle. No production rate/boundary data is changed.
  initial.zones.find((z) => z.id === "jlt-cluster-c")!.polygon = [
    { lat: 24.8, lng: 55 },
    { lat: 24.8, lng: 55.7 },
    { lat: 25.6, lng: 55.7 },
    { lat: 25.6, lng: 55 },
  ];
  const registry = join(dirname(process.env.DB_PATH!), "addresses.json");
  writeFileSync(
    registry,
    JSON.stringify([
      {
        searchable: true,
        address: "JVC coverage fixture",
        building: "Fixture Tower",
        location: { lat: 25.1, lng: 55.25 },
        community: "JVC",
      },
      {
        searchable: true,
        address: "Unresolved coverage fixture",
        building: "Fixture Tower",
        location: { lat: 25.1, lng: 55.25 },
        community: "Unlisted community",
      },
      {
        searchable: true,
        address: "Downtown coverage fixture",
        building: "Fixture Tower",
        location: { lat: 25.1, lng: 55.25 },
        community: "Downtown Dubai",
      },
      {
        searchable: true,
        address: "Approved coverage fixture",
        building: "Fixture Tower",
        location: { lat: 25.1, lng: 55.25 },
        community: "Jumeirah Lakes Towers",
        cluster: "C",
      },
      {
        searchable: true,
        address: "Outside coverage fixture",
        building: "Fixture Tower",
        location: { lat: 25.45, lng: 55.4 },
        community: "JLT",
        cluster: "C",
      },
    ]),
  );
  geo = attachVerifiedAddresses(
    { resolve: () => null },
    registry,
    undefined,
    true,
  );
}
process.env.DELIVERY_ADDRESS_MODE ??=
  process.env.COVERAGE_FIXTURE === "approved" ? "google" : "legacy";
await startServer({
  initial,
  payment: provider,
  geo,
  ...(process.env.CUSTOMER_PAID_EMAIL_FIXTURE === "true"
    ? {
        email: {
          name: "fake-resend",
          async send(email: { idempotencyKey: string }) {
            process.send?.({
              type: "customer-email-accepted",
              eventId: email.idempotencyKey,
            });
            return { messageId: "fixture-provider-accepted" };
          },
        },
      }
    : {}),
});
