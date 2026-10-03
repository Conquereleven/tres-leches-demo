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
        address: "Approved coverage fixture",
        building: "Fixture Tower",
        location: { lat: 25.1, lng: 55.25 },
      },
      {
        address: "Outside coverage fixture",
        building: "Fixture Tower",
        location: { lat: 25.45, lng: 55.4 },
      },
    ]),
  );
  geo = attachVerifiedAddresses({ resolve: () => null }, registry);
}
await startServer({ initial, payment: provider, geo });
