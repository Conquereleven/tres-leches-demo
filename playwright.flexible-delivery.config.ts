import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "3l-flexible-e2e-"));
export default defineConfig({
  testDir: "tests/flexible-delivery-e2e",
  outputDir: "test-results/flexible-delivery",
  workers: 1,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL: "http://127.0.0.1:3268",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `FLEXIBLE_DELIVERY_FIXTURE=true FIXTURE_DATE=2026-10-08T08:00:00+04:00 CATALOG_FIXTURE=legacy DB_PATH=${dir}/state.sqlite PAYMENNT_PUBLIC_KEY=pk_test_fixture_local API_PORT=3268 PORT=3268 APP_ORIGIN=http://127.0.0.1:3268 node --import tsx tests/fixtures/web-checkout-server.ts`,
    url: "http://127.0.0.1:3268",
    reuseExistingServer: false,
  },
});
