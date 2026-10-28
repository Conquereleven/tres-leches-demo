import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const dir = mkdtempSync(join(tmpdir(), "3l-conversion-"));
export default defineConfig({
  testDir: "tests/conversion-e2e",
  outputDir: "test-results/conversion",
  workers: 1,
  timeout: 90000,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL: "http://127.0.0.1:3286",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `DB_PATH=${dir}/state.sqlite PORT=3286 API_PORT=3286 APP_ORIGIN=http://127.0.0.1:3286 node --import tsx tests/fixtures/pack-builder-server.ts`,
    url: "http://127.0.0.1:3286/api/health",
    reuseExistingServer: false,
  },
});
