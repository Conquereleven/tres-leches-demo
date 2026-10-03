import { randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results/original",
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:5174",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `DB_PATH=work/e2e/${randomUUID()}.sqlite API_PORT=5174 APP_ORIGIN=http://127.0.0.1:5174 node --import tsx tests/fixtures/server.ts`,
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
