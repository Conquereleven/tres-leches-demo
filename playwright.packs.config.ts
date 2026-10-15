import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const dir = mkdtempSync(join(tmpdir(), "3l-packs-uat-"));
export default defineConfig({
  testDir: "tests/packs-e2e",
  outputDir: "test-results/packs",
  workers: 1,
  timeout: 90000,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL: "http://127.0.0.1:3272",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `DB_PATH=${dir}/state.sqlite PORT=3272 API_PORT=3272 APP_ORIGIN=http://127.0.0.1:3272 node --import tsx tests/fixtures/pack-builder-server.ts`,
    url: "http://127.0.0.1:3272/api/health",
    reuseExistingServer: false,
  },
});
