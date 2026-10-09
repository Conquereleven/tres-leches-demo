import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "3l-closure-e2e-"));
export default defineConfig({
  outputDir: "test-results/closure",
  testDir: "tests/closure-e2e",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3198",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: `COVERAGE_FIXTURE=approved FIXTURE_DATE=2026-10-20T08:00:00+04:00 FIXTURE_PAYMENT_STATUS=PAID DB_PATH=${dir}/state.sqlite PORT=3198 API_PORT=3198 APP_ORIGIN=http://127.0.0.1:3198 node --import tsx tests/fixtures/web-checkout-server.ts`,
    url: "http://127.0.0.1:3198",
    reuseExistingServer: false,
  },
});
