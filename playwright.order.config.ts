import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// A fixture operator so an order can be taken and moved, as in Operations.
// Not a credential: the fixture server never authenticates against it.
const operator = `OPERATOR_USERS_JSON='${JSON.stringify([
  {
    id: "liza",
    role: "admin",
    salt: "fixture-salt-0000",
    hash: "0".repeat(128),
  },
])}'`;
/** Isolated fixture servers: fake payment provider, throwaway databases, frozen Dubai time. */
const server = (port: number, date: string, extra = "") => {
  const dir = mkdtempSync(join(tmpdir(), `3l-order-${port}-`));
  return {
    command: `DELIVERY_ADDRESS_MODE=legacy FIXTURE_DATE=${date} ${extra} DB_PATH=${dir}/state.sqlite PORT=${port} API_PORT=${port} APP_ORIGIN=http://127.0.0.1:${port} node --import tsx tests/fixtures/web-checkout-server.ts`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  };
};
export default defineConfig({
  testDir: "tests/order-e2e",
  outputDir: "test-results/order",
  workers: 1,
  timeout: 90000,
  use: { baseURL: "http://127.0.0.1:3231" },
  webServer: [
    // Daytime, payments reconcile as PAID: the full order journey.
    server(
      3231,
      "2026-10-20T10:00:00+04:00",
      `FIXTURE_PAYMENT_STATUS=PAID ${operator}`,
    ),
    // A second daytime server for the pickup journey. With the clock frozen the
    // API rate-limit window never rolls over, so each long journey gets its own.
    server(
      3237,
      "2026-10-20T10:00:00+04:00",
      `FIXTURE_PAYMENT_STATUS=PAID ${operator}`,
    ),
    // The evening of 6 October around the 9 PM Dubai cutoff.
    server(3232, "2026-10-06T20:59:00+04:00"),
    server(3233, "2026-10-06T21:00:00+04:00"),
    server(3234, "2026-10-06T21:01:00+04:00"),
    server(3235, "2026-10-06T23:59:00+04:00"),
    server(3236, "2026-10-07T00:01:00+04:00"),
  ],
});
