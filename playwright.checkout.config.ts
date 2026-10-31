import { defineConfig } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "3l-checkout-e2e-"));
const statuses =
  process.env.CHECKOUT_FIXTURE_STATUS_FILE ??
  join(dir, "provider-statuses.json");
if (!process.env.CHECKOUT_FIXTURE_STATUS_FILE) writeFileSync(statuses, "{}");
process.env.CHECKOUT_FIXTURE_STATUS_FILE = statuses;
export default defineConfig({
  outputDir: "test-results/checkout",
  testDir: "tests/checkout-e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3189",
    headless: true,
    trace: "retain-on-failure",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: `FIXTURE_PAYMENT_STATUS_FILE=${statuses} FIXTURE_DATE=2026-10-08T08:00:00+04:00 CATALOG_FIXTURE=legacy DB_PATH=${dir}/state.sqlite PAYMENNT_PUBLIC_KEY=pk_test_fixture_local API_PORT=3189 PORT=3189 APP_ORIGIN=http://127.0.0.1:3189 node --import tsx tests/fixtures/web-checkout-server.ts`,
    url: "http://127.0.0.1:3189",
    reuseExistingServer: false,
  },
});
