import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const dir = mkdtempSync(join(tmpdir(), "3l-conchas-packs-"));
export default defineConfig({
  testDir: "tests/conchas-packs-e2e",
  outputDir: "test-results/conchas-packs",
  workers: 1,
  timeout: 90000,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL: "http://127.0.0.1:3274",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `CONCHAS_PACK_FIXTURE=true DB_PATH=${dir}/state.sqlite PORT=3274 API_PORT=3274 APP_ORIGIN=http://127.0.0.1:3274 node --import tsx tests/fixtures/pack-builder-server.ts`,
    url: "http://127.0.0.1:3274/api/health",
    reuseExistingServer: false,
  },
});
