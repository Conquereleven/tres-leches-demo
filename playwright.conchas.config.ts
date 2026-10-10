import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "3l-conchas-"));
export default defineConfig({
  testDir: "tests/conchas-e2e",
  outputDir: "test-results/conchas",
  workers: 1,
  timeout: 60000,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: { baseURL: "http://127.0.0.1:3223" },
  webServer: {
    command: `DELIVERY_ADDRESS_MODE=legacy COVERAGE_FIXTURE=approved FIXTURE_DATE=2026-10-08T08:00:00+04:00 DB_PATH=${dir}/state.sqlite PORT=3223 API_PORT=3223 APP_ORIGIN=http://127.0.0.1:3223 node --import tsx tests/fixtures/web-checkout-server.ts`,
    url: "http://127.0.0.1:3223",
    reuseExistingServer: false,
  },
});
