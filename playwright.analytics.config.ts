import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "3l-analytics-browser-"));
export default defineConfig({
  testDir: "tests/analytics-e2e",
  outputDir: "test-results/analytics",
  workers: 1,
  timeout: 45000,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL: "https://127.0.0.1:3339",
    headless: true,
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: `DB_PATH=${dir}/state.sqlite HOST=127.0.0.1 API_PORT=3338 PORT=3338 APP_ORIGIN=https://127.0.0.1:3339 node --import tsx tests/fixtures/analytics-tls-server.ts`,
    url: "https://127.0.0.1:3339/api/health",
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
  },
});
