import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "3l-brand02-"));
export default defineConfig({
  testDir: "tests/brand02-e2e",
  outputDir: "test-results/brand02",
  workers: 1,
  timeout: 90000,
  use: { baseURL: "http://127.0.0.1:3268", headless: true },
  webServer: {
    command: `DELIVERY_ADDRESS_MODE=legacy COVERAGE_FIXTURE=approved FIXTURE_DATE=2026-10-12T08:00:00+04:00 DB_PATH=${dir}/state.sqlite PORT=3268 API_PORT=3268 APP_ORIGIN=http://127.0.0.1:3268 node --import tsx tests/fixtures/web-checkout-server.ts`,
    url: "http://127.0.0.1:3268",
    reuseExistingServer: false,
  },
});
