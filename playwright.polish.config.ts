import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "3l-polish-"));
export default defineConfig({
  testDir: "tests/polish-e2e",
  outputDir: "test-results/polish",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3212", video: "on" },
  webServer: {
    command: `DELIVERY_ADDRESS_MODE=legacy COVERAGE_FIXTURE=approved FIXTURE_DATE=2026-10-06T21:01:00+04:00 DB_PATH=${dir}/state.sqlite PORT=3212 API_PORT=3212 APP_ORIGIN=http://127.0.0.1:3212 node --import tsx tests/fixtures/web-checkout-server.ts`,
    url: "http://127.0.0.1:3212",
    reuseExistingServer: false,
  },
});
