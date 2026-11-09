/**
 * TPL-21 customer recovery from a stale 5-piece hosted checkout. Disposable
 * SQLite, current catalog and the in-process fake Paymennt; one seeded stale
 * checkout per project. Provider requests are logged for exact-count assertions.
 */
import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const STALE_KEYS = {
  "chromium-mobile": "5f0e4a1c-0000-4000-8000-000000000390",
  "webkit-iphone": "5f0e4a1c-0000-4000-8000-000000000013",
  "chromium-desktop": "5f0e4a1c-0000-4000-8000-000000001440",
};
export const STALE_BODY = {
  lines: [
    { productId: "pan-de-muerto-filled-pistachio-individual", quantity: 6 },
  ],
  delivery: {
    zoneId: "jlt-cluster-c",
    address: "Synthetic delivery address",
    building: "Fixture Tower",
    unit: "12",
    date: "2026-11-11",
    slot: "4:00 PM – 9:00 PM",
  },
  customer: {
    firstName: "Synthetic",
    lastName: "Buyer",
    phone: "0500000000",
    email: "fixture@example.invalid",
  },
  billing: { sameAsDelivery: true },
};
const dir = mkdtempSync(join(tmpdir(), "3l-minimum-recovery-e2e-"));
process.env.PROVIDER_CALL_LOG ??= join(dir, "provider-calls.log");
writeFileSync(process.env.PROVIDER_CALL_LOG, "");
export default defineConfig({
  outputDir: "test-results/minimum-recovery",
  testDir: "tests/minimum-recovery-e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3191",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-mobile",
      use: { browserName: "chromium", viewport: { width: 390, height: 844 } },
    },
    {
      name: "webkit-iphone",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
    {
      name: "chromium-desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: {
    command: `PROVIDER_CALL_LOG=${process.env.PROVIDER_CALL_LOG} STALE_MINIMUM_FIXTURE_KEYS=${Object.values(STALE_KEYS).join(",")} STALE_MINIMUM_FIXTURE_BODY='${JSON.stringify(STALE_BODY)}' FIXTURE_DATE=2026-11-09T10:00:00+04:00 DB_PATH=${dir}/state.sqlite API_PORT=3191 PORT=3191 APP_ORIGIN=http://127.0.0.1:3191 node --import tsx tests/fixtures/web-checkout-server.ts`,
    url: "http://127.0.0.1:3191",
    reuseExistingServer: false,
  },
});
