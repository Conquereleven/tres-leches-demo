import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const fixtureDbPath = join(mkdtempSync(join(tmpdir(), "3l-v32-uat-")), "synthetic.sqlite");
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/v32-release-e2e",
  outputDir: "test-results/v32-release",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45000,
  expect: { timeout: 15000 },
  projects: [
    { name: "chromium-desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "webkit-mobile", use: { browserName: "webkit", viewport: { width: 390, height: 844 } } },
  ],
  use: {
    baseURL: "http://127.0.0.1:5175",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `APP_ENV=test NODE_ENV=test PROVIDER_MODE=offline META_OUTBOUND_ENABLED=false COVERAGE_FIXTURE=approved DELIVERY_ADDRESS_MODE=legacy FIXTURE_DATE=2026-10-08T08:00:00+04:00 DB_PATH=${fixtureDbPath} PORT=5175 HOST=127.0.0.1 APP_ORIGIN=http://127.0.0.1:5175 node --import tsx tests/fixtures/web-checkout-server.ts`,
    url: "http://127.0.0.1:5175/api/health",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
