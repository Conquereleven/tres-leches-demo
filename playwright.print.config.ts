import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const baseURL = "http://127.0.0.1:5174";
const dir = mkdtempSync(join(tmpdir(), "order-documents-browser-"));
export default defineConfig({
  testDir: "tests/print-e2e",
  outputDir: "test-results/print",
  workers: 1,
  timeout: 60000,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node --import tsx tests/fixtures/order-documents-server.ts",
    env: {
      DB_PATH: join(dir, "state.sqlite"),
      APP_ORIGIN: baseURL,
      HOST: "127.0.0.1",
      PORT: "5174",
      PRINT_FIXTURES: "true",
    },
    url: baseURL + "/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
