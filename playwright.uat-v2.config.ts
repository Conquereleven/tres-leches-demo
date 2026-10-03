import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "3l-uat-v2-e2e-"));
export default defineConfig({
  outputDir: "test-results/uat-v2",
  testDir: "tests/uat-v2-e2e",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3203",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: `DELIVERY_ADDRESS_MODE=legacy COVERAGE_FIXTURE=approved FIXTURE_DATE=2026-10-03T08:00:00+04:00 FIXTURE_PAYMENT_STATUS=PAID DB_PATH=${dir}/state.sqlite PORT=3203 API_PORT=3203 APP_ORIGIN=http://127.0.0.1:3203 node --import tsx tests/fixtures/web-checkout-server.ts`,
    url: "http://127.0.0.1:3203",
    reuseExistingServer: false,
  },
});
