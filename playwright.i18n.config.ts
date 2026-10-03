import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "3l-i18n-e2e-"));
export default defineConfig({
  outputDir: "test-results/i18n",
  testDir: "tests/i18n-e2e",
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:3210",
    viewport: { width: 390, height: 900 },
  },
  webServer: {
    command: `DELIVERY_ADDRESS_MODE=legacy COVERAGE_FIXTURE=approved FIXTURE_DATE=2026-10-03T08:00:00+04:00 FIXTURE_PAYMENT_STATUS=PAID DB_PATH=${dir}/state.sqlite PORT=3210 API_PORT=3210 APP_ORIGIN=http://127.0.0.1:3210 node --import tsx tests/fixtures/web-checkout-server.ts`,
    url: "http://127.0.0.1:3210",
    reuseExistingServer: false,
  },
});
