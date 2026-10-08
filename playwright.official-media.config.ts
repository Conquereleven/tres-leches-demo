import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "3l-official-media-"));
export default defineConfig({
  testDir: "tests/official-media-e2e",
  outputDir: "test-results/official-media",
  workers: 1,
  timeout: 60000,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: { baseURL: "http://127.0.0.1:3217" },
  webServer: {
    command: `DELIVERY_ADDRESS_MODE=legacy COVERAGE_FIXTURE=approved FIXTURE_DATE=2026-10-08T08:00:00+04:00 DB_PATH=${dir}/state.sqlite PORT=3217 API_PORT=3217 APP_ORIGIN=http://127.0.0.1:3217 node --import tsx tests/fixtures/web-checkout-server.ts`,
    url: "http://127.0.0.1:3217",
    reuseExistingServer: false,
  },
});
